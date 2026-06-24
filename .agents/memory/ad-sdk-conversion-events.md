---
name: Ad SDK conversion events (RedLine)
description: How RedLine fires Subscribe/Purchase to ad SDKs and where the wiring lives
---

# Ad SDK conversion events

RedLine reports conversions to ad networks **client-side, directly from the app**,
NOT via RevenueCat's dashboard server-to-server integrations.

**Rule:** Every ad SDK that needs Subscribe/Purchase must be fired in the RevenueCat
`purchaseMutation` post-purchase block in `lib/revenuecat.tsx`, and identified in the
identify `useEffect` in `app/_layout.tsx`. Each SDK has its own `lib/<sdk>.ts` wrapper
(tiktok.ts, meta.ts, appsflyer.ts) that lazily requires the native module and no-ops on
web / Expo Go.

**Why:** AppsFlyer was silently missing the Subscribe event — it was `initSdk`-ed at boot
but no event was ever logged to it (TikTok + Meta were wired, AppsFlyer was not, and there
was no RC->AppsFlyer attribute wiring either). The user expected RevenueCat to forward the
event; in this codebase RC does NOT forward — events are logged directly by the app.

**How to apply:** When a conversion event "isn't arriving" in an ad network, check that
(1) a `lib/<sdk>.ts` wrapper exists, (2) it's called in `purchaseMutation`, and (3) the
user id is set in `_layout.tsx` identify. Adding a new SDK = new wrapper + add both calls.

**Caveat (double-count):** Do NOT also enable that SDK's RevenueCat dashboard S2S
integration while firing client-side — it double-counts conversions. Pick one path; this
app uses client-side for all SDKs.

**Readiness gate (mandatory for every ad SDK):** an ad-SDK event must never be logged
before that SDK's init has completed — every `lib/<sdk>.ts` wrapper must own init and gate
each event on an `ensureReady()`/`initPromise` that resolves on the init callback (with a
safety timeout so calls can't hang). Init belongs in the wrapper, not as an inline `initSdk`
in `_layout.tsx`.

**Why:** SDKs that wait for ATT before starting (AppsFlyer's
`timeToWaitForATTUserAuthorization`) drop in-app events logged before start on iOS. RedLine's
onboarding paywall fires within seconds of launch, so a large share of purchases land inside
that window. A symptom of this class of bug: one network gets far fewer conversion events
than another despite identical call sites (TikTok worked because it gated on readiness;
AppsFlyer didn't and lost nearly all early events). It is an init/readiness race — NOT
attribution and NOT a missing call.

**How to apply:** when a conversion count lags a peer SDK, check init gating before anything
else. Verify on device by confirming `[<SDK>] Init success` is logged at/before the first
conversion event.

**Effect:** These are native client changes — require a new EAS/TestFlight build to apply.
