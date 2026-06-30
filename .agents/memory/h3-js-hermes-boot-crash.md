---
name: h3-js Hermes boot crash
description: Why a static h3-js import crashes RedLine on launch in release Hermes, and the lazy-load fix pattern for emscripten/asm.js modules in React Native.
---

# h3-js (and emscripten/asm.js modules) crash RN release Hermes at import time

`h3-js` ships an emscripten asm.js module whose initialization runs **at import
time** (environment detection + asm heap setup in a single ~475KB function). A
static `import ... from 'h3-js'` pulls that init into whatever module graph
reaches it. In RedLine `lib/territory.ts` → `TripProvider` (mounted at app root)
→ so h3-js initialized during **app boot** and crashed the **release Hermes**
build on launch (worked fine in the dev bundler / JSC). Deterministic
launch crash with no symbolicated log; diagnosed from git (first build to include
the Territory feature was the first to crash).

**Rule:** never statically import an emscripten/asm.js/wasm-glue module on the
app boot path in a React Native (Hermes) app. Lazy-`require()` it inside the
function that needs it, cache the module, and wrap in try/catch so a failed load
degrades the feature instead of crashing the app.

**Why:** emscripten env detection sees RN's global `window` and takes the
`ENVIRONMENT_IS_WEB` branch; the heavy synchronous init during the RN/Hermes
bootstrap phase is what fails. Deferring to first real use (post-boot, e.g. when
a map overlay renders) avoids the boot-time failure.

**How to apply:** keep only `type`-level imports at top
(`type X = typeof import('h3-js')` is erased). Client only needed h3 for
rendering (`cellToPolygon`, `latLngToRegion`); the server does all authoritative
H3 work, so the client can degrade to empty/null with zero functional loss on the
record path. Residual risk: if the lazy init still hard-aborts Hermes (native
abort, not a JS throw), the crash moves to first territory use — but the app
boots and all non-territory features work; gate behind a kill-switch if observed.
