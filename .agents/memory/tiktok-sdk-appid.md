---
name: TikTok Business SDK appId is the App Store ID
description: The appId arg in TikTokConfig must be the numeric App Store ID, not the bundle identifier.
---

`react-native-tiktok-business-sdk` `initializeSdk(appId, ttAppId, accessToken, debug)` maps to native `TikTokConfig(accessToken:appId:tiktokAppId:)`. The `appId` must be the **numeric iOS App Store ID** (e.g. the "App ID" shown in TikTok Events Manager / App Store Connect, like `6758342404`) — NOT the bundle identifier (`app.rork.redline-app`).

**Why:** Passing the bundle id compiles and the SDK reports init success, but events silently never match the TikTok app event source, so nothing shows in Events Manager. This wasted many TestFlight build cycles.

**How to apply:** In RedLine, `lib/tiktok.ts` passes `TIKTOK_APP_STORE_ID` (default `6758342404`, overridable via `EXPO_PUBLIC_TIKTOK_APP_STORE_ID`). The three TikTok credentials are distinct: App Store App ID (numeric), TikTok App ID (`EXPO_PUBLIC_TIKTOK_APP_ID`, in eas.json), and access token / "App Secret" (`EXPO_PUBLIC_TIKTOK_ACCESS_TOKEN`, in eas.json).
