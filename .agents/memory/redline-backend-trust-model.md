---
name: RedLine backend trust model & RevenueCat verification
description: The api-server tRPC backend has NO auth; how to safely add sensitive mutations (esp. anything granting Pro/entitlements or rewards).
---

# RedLine api-server trust model

The entire `artifacts/api-server` tRPC backend uses `publicProcedure` with a
client-supplied `userId` in the input. There is **no session/auth context**
(`create-context.ts` carries no identity). This is the established app-wide
convention — do not try to bolt on auth for a single route.

## Rule: never trust client-asserted privilege/entitlement claims
For low-stakes mutations, trusting `userId` matches the rest of the app and is
fine. But for anything that grants a paid entitlement, money, or contest
standing, the client input cannot be the source of truth.

**Why:** a Pro-only, cash-prize Challenges feature shipped a `subscription.syncStatus`
that originally accepted `{userId, isPro, expiresAt}` and wrote `users.is_pro`
directly — any caller could grant themselves Pro for free and corrupt the unlock
count + contest eligibility.

**How to apply:** make the backstop take only `{userId}` and re-verify
server-side against the provider. When the key is absent or the call errors,
return "could not verify" (null) and do NOT downgrade — let the authoritative
RevenueCat webhook reconcile. Entitlement is identified by its **lookup_key**
"RedLine App Pro" (`REVENUECAT_ENTITLEMENT_ID`).

## Use RevenueCat REST **v2**, not v1
The newer `sk_` secret keys are REJECTED by the legacy v1 `GET /v1/subscribers/{id}`
endpoint (HTTP 403, `code 7723` "secret API key incompatible with RevenueCat API
V1"). That is exactly why the live Pro counter once read 0 despite real
subscribers. Verify via v2 instead:
1. `GET /v2/projects` → project id (cache; optional `REVENUECAT_PROJECT_ID` /
   `REVENUECAT_PROJECT_NAME` overrides).
2. `GET /v2/projects/{id}/entitlements` → map our `lookup_key` → internal
   `entlXXXX` id (cache, paginated via `next_page`).
3. `GET /v2/projects/{id}/customers/{userId}/active_entitlements` (paginated) →
   match `entitlement_id`; `expires_at` is **Unix ms** (null = lifetime).
   A customer-scoped **404 = definitively not Pro** (never purchased); other
   non-OK = null (could-not-verify, no downgrade).

**Why caches are key-scoped:** project/entitlement ids are resolved once per
process; reset them if the secret key changes so rotation can't serve a stale
mapping. Project/entitlement resolution runs *before* the customer call, so a
mis-set project id fails there (→ null), never reaching the downgrade path.

## Reconciliation backfill
`backfillProStatus(offset, limit)` + cron `GET|POST /api/cron/backfill-pro`
(CRON_SECRET-guarded if set, same as `challenges-tick`) page through
`users` and mirror current RC entitlement into `users.is_pro`, writing only on
change. Use it to populate Pro flags for subscribers who bought before the
server had a key. Dev and prod share ONE Supabase instance, so a backfill run
from dev immediately fixes the count the prod app reads.
