---
name: TikTok SDK eventId is a dedup key — never use a constant
description: Passing a stable eventId (e.g. the user id) to trackEvent makes TikTok drop every repeat occurrence.
---

`react-native-tiktok-business-sdk` `trackEvent(eventName, eventId?, properties?)` — the `eventId` is TikTok's **deduplication** key. If the same eventId is sent again, TikTok silently drops the event (no error, nothing in Events Manager).

**Why:** In RedLine, Subscribe/Purchase passed `orderId = customerInfo.originalAppUserId`, which is the **constant RevenueCat user id**. So the first Subscribe recorded but every subsequent one was deduped and vanished — looked like "Subscribe never records" while CompleteTutorial/Login (which pass NO eventId) worked fine. Wasted several TestFlight cycles.

**How to apply:** For SDK-only event tracking (no server Events API dedup), the eventId must be **unique per real occurrence** — or omitted entirely. RedLine `lib/revenuecat.tsx` now builds `orderId = ${productId}_${latestPurchaseDateMillis ?? Date.now()}_${random}`. Never reuse a user id, device id, or any value that's stable across purchases as the eventId. The admin "test events" button was already fine because it used `test_${Date.now()}`.
