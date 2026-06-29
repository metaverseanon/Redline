---
name: Superwall layered over RevenueCat (Option A)
description: How RedLine layers Superwall paywall presentation on top of RevenueCat without breaking the no-key path; the gotchas that drove the design.
---

# Superwall over RevenueCat (RedLine, "Option A")

When Superwall is configured it OWNS paywall presentation everywhere; RevenueCat
stays the purchase/entitlement backend via a Superwall `CustomPurchaseController`.
The existing `CustomPaywallModal` is the automatic fallback. Everything gates on
the Superwall key so the no-key state is byte-for-byte unchanged.

## Non-obvious constraints / decisions

- **Never settle a Superwall placement result on a fixed-time inference.**
  `registerPlacement()`'s returned promise resolution timing vs `onPresent` is
  unspecified, so a short timeout (we originally used 50ms) can fire BEFORE
  `onDismiss` and drop a real `purchased` result. Settle deterministically from
  callbacks only: `onDismiss`→mapped result, `onSkip`/`feature()`-grant→
  not_presented, `onError`→error. A multi-MINUTE safety timer only prevents a hung
  awaiter; it must be long enough to never race a user reading the paywall.
  **Why:** wrong settle = user pays but app shows "cancelled". (Pro still
  activates via RC's own customerInfo listener, but the paywall flow looks broken.)

- **`registerSuperwallPlacement` returns `PaywallResult | null`; null === "bridge
  not mounted, fall back to the RC modal".** A configured-but-failing Superwall
  returns `"error"` (NOT null), so it does NOT fall back. This is why a
  truthy-but-wrong key in `eas.json` is dangerous (see below).

- **Do NOT put a placeholder/empty Superwall key in `eas.json`.** A truthy bad key
  makes Superwall configure then error on every placement → returns `"error"` →
  no RC fallback → prod paywalls break. No key at all ⇒ clean RC fallback. Only
  add the REAL public key to `eas.json` production env when available (public keys
  are safe to commit, mirroring TikTok/PostHog).

- **`SuperwallProvider` renders `{children}` unconditionally** (verified in its
  compiled source — it does NOT gate on `isConfigured`). So `SuperwallGate` can
  wrap the app tree without ever blocking startup. It is mounted INSIDE the RC
  `SubscriptionProvider` + `UserProvider` so a sync child can read both app user
  and RC entitlement and mirror them into Superwall (`identify` +
  `setSubscriptionStatus`). Under a CustomPurchaseController Superwall does NOT
  know subscription status automatically — you must push it from RC.

- **`lib/superwall.tsx` ↔ `lib/revenuecat.tsx` is a circular import.** Use
  NAMESPACE imports (`import * as rc` / `import * as sw`) and only call across at
  runtime (never at module top level) — destructured named imports from a
  partially-initialized circular module would be `undefined` at call time.

- **Analytics parity:** the ad-SDK + PostHog + funnel events for a purchase live
  in `recordSubscribeTapped` / `recordSuccessfulPurchase` (extracted from
  `purchaseMutation`). The Superwall purchase controller MUST call these so
  Superwall-driven purchases emit identical events. Superwall's `onPurchase` only
  has a `productId` (no RC packageType), so plan label is inferred from the id
  (year/annual→yearly, month→monthly).
