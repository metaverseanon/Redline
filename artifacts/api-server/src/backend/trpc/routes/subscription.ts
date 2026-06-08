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

const REVENUECAT_ENTITLEMENT_ID = process.env.REVENUECAT_ENTITLEMENT_ID ?? "RedLine App Pro";

interface ProUserRow {
  id: string;
  pro_expires_at?: number | null;
}

/**
 * Verify a user's Pro entitlement directly with RevenueCat (server-authoritative).
 * Returns the resolved {isPro, expiresAt} or `null` when verification is not
 * possible (no secret key configured, network/HTTP error, or unknown subscriber)
 * — callers must treat `null` as "could not verify" and NOT downgrade the user.
 */
async function verifyProViaRevenueCat(
  userId: string,
): Promise<{ isPro: boolean; expiresAt: number | null } | null> {
  const key = process.env.REVENUECAT_SECRET_API_KEY;
  if (!key) return null;
  try {
    const url = `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(userId)}`;
    const resp = await fetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${key}` },
    });
    if (!resp.ok) {
      console.error("[SUBSCRIPTION] RevenueCat verify failed", userId, resp.status);
      return null;
    }
    const data = (await resp.json()) as {
      subscriber?: { entitlements?: Record<string, { expires_date?: string | null }> };
    };
    const ent = data.subscriber?.entitlements?.[REVENUECAT_ENTITLEMENT_ID];
    if (!ent) return { isPro: false, expiresAt: null };
    // expires_date null => lifetime/non-expiring entitlement.
    if (ent.expires_date == null) return { isPro: true, expiresAt: null };
    const expiresAt = Date.parse(ent.expires_date);
    if (Number.isNaN(expiresAt)) return { isPro: false, expiresAt: null };
    return { isPro: expiresAt > Date.now(), expiresAt };
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
