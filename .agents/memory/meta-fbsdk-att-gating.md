---
name: Meta (fbsdk-next) ATT-gated init
description: Why react-native-fbsdk-next must keep isAutoInitEnabled false in the RedLine app.
---

# Meta App Events SDK must NOT auto-init

The `react-native-fbsdk-next` config plugin in `artifacts/redline/app.json` keeps
`isAutoInitEnabled: false`. Initialization happens only through `initializeMeta()`
in `lib/meta.ts`, which resolves the iOS ATT permission first and then calls
`Settings.setAdvertiserTrackingEnabled(granted)` before `Settings.initializeSDK()`.

**Why:** with auto-init on, the native SDK can initialize and start advertiser-ID
collection before the JS ATT-gating flow runs, defeating consent timing (same model
as the TikTok wrapper, which also inits explicitly after ATT). `autoLogAppEventsEnabled`
stays true — that only governs lifecycle logging *after* the controlled init.

**How to apply:** never flip `isAutoInitEnabled` back to true; keep all Meta init
flowing through `initializeMeta()`. The fbsdk plugin's `iosUserTrackingPermission`
is intentionally omitted so it doesn't double-add `NSUserTrackingUsageDescription`
(expo-tracking-transparency already adds it).
