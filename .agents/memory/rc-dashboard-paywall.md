---
name: RevenueCat dashboard paywall — intentionally disabled
description: Why RedLine uses its hand-coded paywalls and keeps the RCUI dashboard paywall path disabled
---

**Current decision (user, Jul 2026): the app's hand-coded paywalls are authoritative.**
The RCUI dashboard-paywall code path in `presentPaywall` exists but is gated OFF by a
`USE_RC_DASHBOARD_PAYWALL = false` flag. Onboarding renders the inline
`OnboardPaywallPage` directly; everywhere else shows `CustomPaywallModal`. (The
whats-new announcement screen was removed entirely in the same release.)

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
- The app has TWO hand-coded paywall surfaces: `OnboardPaywallPage` (inline page in
  onboarding final step; "START YEARLY") and `CustomPaywallModal`
  (presentPaywall path; "START YEARLY PLAN"). When debugging "which paywall showed",
  the button label + presence/absence of `paywall_*` analytics events tells you which
  surface it was (the inline page logs no paywall events).
