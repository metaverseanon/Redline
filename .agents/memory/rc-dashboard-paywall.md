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
