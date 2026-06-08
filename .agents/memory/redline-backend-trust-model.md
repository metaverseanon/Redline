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
server-side against the provider. For Pro status, call RevenueCat REST
`GET /v1/subscribers/{userId}` with `REVENUECAT_SECRET_API_KEY`, read
`subscriber.entitlements[ENTITLEMENT_ID].expires_date` (null = lifetime). When
the key is absent or the call errors, return "could not verify" and do NOT
downgrade — let the authoritative RevenueCat webhook reconcile. Entitlement id
defaults to "RedLine App Pro" (`REVENUECAT_ENTITLEMENT_ID`).
