---
name: RevenueCat dashboard paywall — intentionally disabled
description: Why RedLine uses its hand-coded paywalls and keeps the RCUI dashboard paywall path disabled
---

**Current decision (user, Jul 2026): the app's hand-coded paywalls are authoritative.**
The RCUI dashboard-paywall code path in `presentPaywall` exists but is gated OFF by a
`USE_RC_DASHBOARD_PAYWALL = false` flag. Which hand-coded paywall UI shows (classic
vs the Lovable carousel) is a separate exported flag `USE_CAROUSEL_PAYWALL` in
`lib/revenuecat.tsx` that governs BOTH the app-wide modal host and onboarding —
the user's standing deal is that the classic paywall files stay intact and the
carousel is revertible by flipping that one flag.

**Why:** the dashboard paywall ("Podium Pass") was tried and rejected. The dealbreaker:
when NO active paywall is attached to the current offering, RCUI `presentPaywall` does
NOT return NOT_PRESENTED — it presents its own bare-bones default template (app icon +
product list). So there is no clean remote/dashboard way to fall back to the custom
design; deactivating the dashboard paywall just swaps in the ugly default.

**How to apply:**
- If the user ever wants dashboard paywalls again: flip `USE_RC_DASHBOARD_PAYWALL` to
  true (native rebuild required) AND make sure an active paywall stays attached to the
  current offering forever after — turning it off shows RC's default template, not the
  custom modal.
- The RCUI block already replays purchase analytics (TikTok/Meta + PostHog via
  `recordSubscribeTapped`/`recordSuccessfulPurchase`) on PURCHASED — keep that if
  re-enabled; RCUI purchases bypass `purchaseMutation`. AppsFlyer stays S2S.
- Hand-coded paywall surfaces: the presentPaywall modal host and the onboarding
  final step. Both follow `USE_CAROUSEL_PAYWALL`; when it's off, onboarding shows
  the inline `OnboardPaywallPage` ("START YEARLY") and everywhere else shows
  `CustomPaywallModal` ("START YEARLY PLAN"). When debugging "which paywall
  showed", the button label + presence/absence of `paywall_*` analytics events
  tells you which surface it was (the inline page logs no paywall events).
