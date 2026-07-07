---
name: RevenueCat dashboard paywall presentation
description: How RedLine shows RC dashboard-designed paywalls and why the custom modal alone never shows them
---

Paywalls designed in the RevenueCat dashboard (Paywalls editor) only appear if the app calls
`react-native-purchases-ui` `presentPaywall()`. A hand-coded modal that uses
`react-native-purchases` for purchases will NEVER pick up dashboard paywall designs.

**Why:** user published a dashboard paywall and it didn't show — the app was rendering its
own `CustomPaywallModal`. Paywall order is now: Superwall (if configured) → RC dashboard
paywall (RCUI `presentPaywall`) → CustomPaywallModal fallback (Expo Go / web / no published
paywall / native error).

**How to apply:**
- Dashboard design changes ship remotely (no app update); but ADDING the RCUI call itself is
  a native-client change → needs a new EAS build.
- Purchases inside the RCUI paywall bypass the app's `purchaseMutation` — analytics
  (TikTok/Meta + PostHog subscribe/subscription_started) must be replayed after a PURCHASED
  result via the extracted `recordSubscribeTapped`/`recordSuccessfulPurchase` helpers,
  matching the entitlement's `productIdentifier` against the current offering's packages
  (exact match first). AppsFlyer stays S2S — never re-add client-side.
- RCUI `presentPaywall` resolves at close with PAYWALL_RESULT strings
  (PURCHASED/RESTORED/CANCELLED/NOT_PRESENTED/ERROR); log presented/viewed only for real
  presentations so NOT_PRESENTED/ERROR don't inflate view counts.
- **The app has TWO hard-coded paywall surfaces, not one:** besides `CustomPaywallModal`
  (the `presentPaywall` fallback), there is `OnboardPaywallPage`, an inline PAGE rendered
  directly by the onboarding final step and the whats-new screen — it bypasses
  `presentPaywall` entirely. The user tested the dashboard paywall by creating a NEW account
  (→ onboarding) and concluded the feature was broken. Both surfaces now route through
  `presentPaywall` first (source `onboarding` / `whats_new`), keeping the inline page only as
  the not_presented/error fallback. When "the paywall didn't change", first ask WHICH
  surface was on screen ("START YEARLY" = onboarding page; "START YEARLY PLAN" = modal).
- Diagnostic tell: the onboarding page logs ZERO `paywall_*` analytics events — a session
  showing a paywall but no paywall events means the inline page, not the paywall system.
