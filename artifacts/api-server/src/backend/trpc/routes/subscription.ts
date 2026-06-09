import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, publicProcedure } from "../create-context";
import { isDbConfigured, getSupabaseHeaders, getSupabaseRestUrl } from "../db";

/**
 * Server-side source of truth for Pro (subscription) status.
 *
 * Two write paths keep `users.is_pro` / `users.pro_expires_at` current:
 *  - The RevenueCat webhook (see hono.ts) — robust, server-authoritative.
 *  - `syncStatus` — a client backstop the app calls when RevenueCat
 *    customerInfo changes, so status stays fresh even before the dashboard
 *    webhook is configured. It takes ONLY a userId and re-verifies the
 *    entitlement directly against RevenueCat's REST API server-side, so a
 *    malicious client cannot grant itself Pro by asserting `isPro: true`.
 *
 * Both funnel through `setUserProStatus`.
 */

// The entitlement is identified by its RevenueCat *lookup_key* (what the SDK and
// the legacy v1 API call the entitlement "identifier").
const REVENUECAT_ENTITLEMENT_ID = process.env.REVENUECAT_ENTITLEMENT_ID ?? "RedLine App Pro";
const RC_API_ORIGIN = "https://api.revenuecat.com";

interface ProUserRow {
  id: string;
  pro_expires_at?: number | null;
}

// Resolved once and reused. The v2 API is project-scoped and references the
// entitlement by an internal id (entlXXXX), so we map lookup_key -> id once.
let cachedProjectId: string | null = null;
let cachedEntitlementId: string | null = null;
// The secret key the cached ids were resolved with; if it changes (rotation)
// we drop the cache so we never serve a stale project/entitlement mapping.
let cachedForKey: string | null = null;

async function rcV2Fetch(path: string, key: string): Promise<Response> {
  const url = path.startsWith("http") ? path : `${RC_API_ORIGIN}${path}`;
  return fetch(url, { method: "GET", headers: { Authorization: `Bearer ${key}` } });
}

/** Resolve (and cache) the RevenueCat v2 project id for this secret key. */
async function resolveProjectId(key: string): Promise<string | null> {
  if (cachedProjectId) return cachedProjectId;
  const envId = process.env.REVENUECAT_PROJECT_ID;
  if (envId) {
    cachedProjectId = envId;
    return envId;
  }
  const resp = await rcV2Fetch("/v2/projects", key);
  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    console.error("[SUBSCRIPTION] RevenueCat list projects failed", resp.status, body.slice(0, 300));
    return null;
  }
  const data = (await resp.json()) as { items?: { id: string; name?: string }[] };
  const items = data.items ?? [];
  const wantedName = process.env.REVENUECAT_PROJECT_NAME;
  const chosen = (wantedName && items.find((p) => p.name === wantedName)) || items[0];
  if (!chosen?.id) {
    console.error("[SUBSCRIPTION] RevenueCat no projects found for this key");
    return null;
  }
  cachedProjectId = chosen.id;
  console.log("[SUBSCRIPTION] RevenueCat project resolved", { projectId: chosen.id, name: chosen.name });
  return cachedProjectId;
}

/** Resolve (and cache) the internal entitlement id matching our lookup_key. */
async function resolveEntitlementId(key: string, projectId: string): Promise<string | null> {
  if (cachedEntitlementId) return cachedEntitlementId;
  let path: string | null = `/v2/projects/${projectId}/entitlements`;
  while (path) {
    const resp = await rcV2Fetch(path, key);
    if (!resp.ok) {
      const body = await resp.text().catch(() => "");
      console.error("[SUBSCRIPTION] RevenueCat list entitlements failed", resp.status, body.slice(0, 300));
      return null;
    }
    const data = (await resp.json()) as {
      items?: { id: string; lookup_key?: string }[];
      next_page?: string | null;
    };
    const match = (data.items ?? []).find((e) => e.lookup_key === REVENUECAT_ENTITLEMENT_ID);
    if (match?.id) {
      cachedEntitlementId = match.id;
      console.log("[SUBSCRIPTION] RevenueCat entitlement resolved", {
        lookupKey: REVENUECAT_ENTITLEMENT_ID,
        id: match.id,
      });
      return cachedEntitlementId;
    }
    path = data.next_page ?? null;
  }
  console.error(
    "[SUBSCRIPTION] RevenueCat entitlement not found for lookup_key",
    REVENUECAT_ENTITLEMENT_ID,
  );
  return null;
}

/**
 * Verify a user's Pro entitlement directly with RevenueCat (server-authoritative)
 * using the RevenueCat REST API **v2** (the legacy v1 `/subscribers` endpoint is
 * rejected by the newer `sk_` secret keys). Returns the resolved
 * {isPro, expiresAt} or `null` when verification is not possible (no secret key
 * configured, network/HTTP error, or unresolved project/entitlement) — callers
 * must treat `null` as "could not verify" and NOT downgrade the user.
 *
 * A 404 on the customer means the user has no RevenueCat record (never
 * purchased), which is a definitive "not Pro" answer, not an error.
 */
async function verifyProViaRevenueCat(
  userId: string,
): Promise<{ isPro: boolean; expiresAt: number | null } | null> {
  const key = process.env.REVENUECAT_SECRET_API_KEY;
  if (!key) return null;
  if (cachedForKey !== key) {
    cachedForKey = key;
    cachedProjectId = null;
    cachedEntitlementId = null;
  }
  try {
    const projectId = await resolveProjectId(key);
    if (!projectId) return null;
    const targetEntId = await resolveEntitlementId(key, projectId);
    if (!targetEntId) return null;

    let path: string | null = `/v2/projects/${projectId}/customers/${encodeURIComponent(
      userId,
    )}/active_entitlements`;
    while (path) {
      const resp = await rcV2Fetch(path, key);
      if (resp.status === 404) {
        // A 404 here should mean the customer has no RevenueCat record (never
        // purchased) => definitively not Pro. Project + entitlement were already
        // resolved above, so a misconfigured project would have failed earlier
        // (returning null, not false). Still, only treat a customer-scoped 404
        // as a downgrade; anything else is "could not verify".
        const body = (await resp.text().catch(() => "")).toLowerCase();
        if (body === "" || body.includes("customer")) {
          return { isPro: false, expiresAt: null };
        }
        console.error("[SUBSCRIPTION] RevenueCat unexpected 404", userId, body.slice(0, 300));
        return null;
      }
      if (!resp.ok) {
        const body = await resp.text().catch(() => "");
        console.error(
          "[SUBSCRIPTION] RevenueCat verify failed",
          userId,
          resp.status,
          body.slice(0, 400),
        );
        return null;
      }
      const data = (await resp.json()) as {
        items?: { entitlement_id?: string; expires_at?: number | null }[];
        next_page?: string | null;
      };
      const match = (data.items ?? []).find((e) => e.entitlement_id === targetEntId);
      if (match) {
        // expires_at null => lifetime/non-expiring; v2 timestamps are Unix ms.
        if (match.expires_at == null) return { isPro: true, expiresAt: null };
        return { isPro: match.expires_at > Date.now(), expiresAt: match.expires_at };
      }
      path = data.next_page ?? null;
    }
    // No matching active entitlement across all pages.
    return { isPro: false, expiresAt: null };
  } catch (err) {
    console.error("[SUBSCRIPTION] RevenueCat verify error", err);
    return null;
  }
}

function ensureDb() {
  if (!isDbConfigured()) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Database is not configured.",
    });
  }
}

/** Update a user's Pro flag + expiry. expiresAt is Unix ms (null = no expiry / lifetime). */
export async function setUserProStatus(
  userId: string,
  isPro: boolean,
  expiresAt?: number | null,
): Promise<boolean> {
  const url = `${getSupabaseRestUrl("users")}?id=eq.${encodeURIComponent(userId)}`;
  const body: Record<string, unknown> = { is_pro: isPro };
  // Only touch expiry when we have a value (don't wipe it on simple flips).
  if (expiresAt !== undefined) body.pro_expires_at = expiresAt;
  const resp = await fetch(url, {
    method: "PATCH",
    headers: getSupabaseHeaders(),
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    console.error("[SUBSCRIPTION] setUserProStatus failed", userId, resp.status, await resp.text());
    return false;
  }
  console.log("[SUBSCRIPTION] setUserProStatus", { userId, isPro, expiresAt });
  return true;
}

/** Count of users who are currently Pro (is_pro true AND not expired). */
export async function getActiveProCount(): Promise<number> {
  const url = `${getSupabaseRestUrl("users")}?is_pro=eq.true&select=id,pro_expires_at`;
  const resp = await fetch(url, { method: "GET", headers: getSupabaseHeaders() });
  if (!resp.ok) {
    console.error("[SUBSCRIPTION] getActiveProCount failed", resp.status);
    return 0;
  }
  const rows = (await resp.json()) as ProUserRow[];
  const now = Date.now();
  return rows.filter((r) => r.pro_expires_at == null || r.pro_expires_at > now).length;
}

/**
 * Reconciliation backfill: scan a stable page of users and mirror each one's
 * CURRENT RevenueCat entitlement into `users.is_pro` / `pro_expires_at`. Only
 * rows whose status actually changes are written. Returns a summary plus
 * `nextOffset` for paging (null when the last page was processed).
 *
 * Used to populate Pro status for subscribers who purchased before the server
 * had a RevenueCat secret key (so neither the webhook nor syncStatus had run),
 * and as a periodic safety net if a webhook event is ever missed.
 */
export async function backfillProStatus(
  offset: number,
  limit: number,
): Promise<{
  scanned: number;
  changedToPro: number;
  changedToFree: number;
  unverifiable: number;
  errors: number;
  nextOffset: number | null;
}> {
  const usersUrl = `${getSupabaseRestUrl(
    "users",
  )}?select=id,is_pro,pro_expires_at&order=id.asc&offset=${offset}&limit=${limit}`;
  const resp = await fetch(usersUrl, { method: "GET", headers: getSupabaseHeaders() });
  if (!resp.ok) {
    throw new Error(`backfillProStatus: fetch users failed ${resp.status}`);
  }
  const users = (await resp.json()) as {
    id: string;
    is_pro?: boolean;
    pro_expires_at?: number | null;
  }[];

  let changedToPro = 0;
  let changedToFree = 0;
  let unverifiable = 0;
  let errors = 0;
  const now = Date.now();
  const CONCURRENCY = 8;

  for (let i = 0; i < users.length; i += CONCURRENCY) {
    const batch = users.slice(i, i + CONCURRENCY);
    await Promise.all(
      batch.map(async (u) => {
        try {
          const verified = await verifyProViaRevenueCat(u.id);
          if (!verified) {
            unverifiable++;
            return;
          }
          const currentlyPro =
            !!u.is_pro && (u.pro_expires_at == null || u.pro_expires_at > now);
          const sameExpiry = (u.pro_expires_at ?? null) === (verified.expiresAt ?? null);
          if (verified.isPro === currentlyPro && (!verified.isPro || sameExpiry)) {
            return; // already correct — skip the write
          }
          const ok = await setUserProStatus(u.id, verified.isPro, verified.expiresAt);
          if (!ok) {
            errors++;
            return;
          }
          if (verified.isPro) changedToPro++;
          else changedToFree++;
        } catch (err) {
          console.error("[SUBSCRIPTION] backfill error", u.id, err);
          errors++;
        }
      }),
    );
  }

  const nextOffset = users.length < limit ? null : offset + users.length;
  return { scanned: users.length, changedToPro, changedToFree, unverifiable, errors, nextOffset };
}

/** Whether a single user is currently Pro. */
export async function isUserPro(userId: string): Promise<boolean> {
  const url = `${getSupabaseRestUrl("users")}?id=eq.${encodeURIComponent(userId)}&select=is_pro,pro_expires_at&limit=1`;
  const resp = await fetch(url, { method: "GET", headers: getSupabaseHeaders() });
  if (!resp.ok) return false;
  const rows = (await resp.json()) as { is_pro?: boolean; pro_expires_at?: number | null }[];
  const row = rows[0];
  if (!row || !row.is_pro) return false;
  return row.pro_expires_at == null || row.pro_expires_at > Date.now();
}

export const subscriptionRouter = createTRPCRouter({
  // Client backstop: the app pokes this when its RevenueCat customerInfo
  // changes. We do NOT trust any client-asserted Pro flag — the server
  // re-verifies the entitlement against RevenueCat's REST API and only then
  // writes `users.is_pro`. When verification isn't possible (no secret key, or
  // a transient error) we leave the existing status untouched and let the
  // authoritative webhook reconcile it.
  syncStatus: publicProcedure
    .input(z.object({ userId: z.string().min(1) }))
    .mutation(async ({ input }) => {
      ensureDb();
      const verified = await verifyProViaRevenueCat(input.userId);
      if (!verified) {
        return { success: false, verified: false };
      }
      const ok = await setUserProStatus(input.userId, verified.isPro, verified.expiresAt);
      return { success: ok, verified: true, isPro: verified.isPro };
    }),

  // Live count of Pro members (powers the challenge unlock progress).
  getProCount: publicProcedure.query(async () => {
    ensureDb();
    const count = await getActiveProCount();
    return { count };
  }),
});
