---
name: RedLine production deploy is separate from dev
description: Why new backend features can work in dev but fail in the shipped iOS app, and how to tell a stale prod deploy apart from a code bug.
---

# RedLine: prod backend is a separate deployment

The shipped iOS/TestFlight build points its API base at the **production
deployment** (`EXPO_PUBLIC_RORK_API_BASE_URL` in `eas.json` production env →
`https://trip-stats-tracker.replit.app`), NOT the dev workspace server. So a
feature can be fully correct in dev and still fail on-device purely because the
production deployment is running older backend code.

**Symptoms of a stale prod deploy (not a code bug):**
- Newly-added Hono routes 404 in prod (e.g. video export `POST /api/replay/render`)
  while the same route returns 400/200 against the dev server.
- Newly-added/changed tRPC routes throw or misbehave in prod (e.g. AI coach
  `coach.getTripCoaching`, `music.searchTracks` for the song picker).

**How to diagnose fast:**
- `curl` the dev server via the proxy (`localhost:80/api/...`) AND prod
  (`https://trip-stats-tracker.replit.app/api/...`) and compare status codes.
- Use deployment logs to confirm prod is actually receiving the request.

**Fix:** redeploy `artifacts/api-server`. These features are all server-side,
so redeploying fixes them for the *existing* app build — no new TestFlight build
needed. Server-rendered video layout (replay render) also ships via redeploy.

**Why:** prod and dev are independent environments; dev env auto-injects the
Replit AI integration vars (`AI_INTEGRATIONS_ANTHROPIC_BASE_URL/_API_KEY`) that
the coach needs. After redeploy, if coach still fails, verify those exist in the
prod deployment env and check prod logs for provider/quota errors.

**Convention:** bump `BACKEND_VERSION` in `hono.ts` on every backend change so
`GET /api/healthz` (`{version}`) immediately reveals whether prod is current.
It had been left at `1.2.0` across multiple feature additions, which masked the
stale deploy. Bumped to `1.3.0` for the replay-render + coach generation.
