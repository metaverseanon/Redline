---
name: Challenges round lifecycle & finalization
description: How RedLine Pro challenge rounds activate/finalize, why it's traffic-driven + a ticker, and the max-points/scoring lockstep invariant.
---

# Challenges round lifecycle

All state transitions live as side effects inside `challenges.getActiveChallenge`
(activate pending→active at the Pro threshold; finalize on end condition). There
is no dedicated transition job — the query *is* the engine.

## What drives it
- **Organic traffic**: every leaderboard/challenges screen open calls
  `getActiveChallenge`, so for an app with steady traffic the lifecycle advances
  continuously on its own.
- **In-process ticker** (`startChallengesTicker` in hono.ts, started from
  index.ts): calls the same lifecycle every 5 min. Needed because production is
  **autoscale** (scales to zero, no wall-clock cron). It only fires on a warm
  instance; cold gaps are covered by the next request anyway.
- **`/api/cron/challenges-tick`** endpoint exists as a manual/external backstop.
- A true zero-traffic guarantee would need an external **Scheduled Deployment**
  pinging the cron endpoint — deliberately NOT added (extra paid deployment;
  organic traffic + ticker already cover an active app).

## End conditions (finalize when EITHER)
1. **Perfect score** — any participant reaches the max possible points.
2. **Timer** — 2-week window (`end_time`) elapses.

## Invariant: maxPointsForTasks() must mirror scoreUser()
**Why:** `scoreUser` treats a progressive task with no positive `points_cap` as
UNBOUNDED (`Number.MAX_SAFE_INTEGER`). If `maxPointsForTasks` summed a missing
cap as 0, `someoneMaxed` would trip at a finite total while more points were
still earnable → premature finalization (caught in architect review).
**How to apply:** if ANY progressive task lacks a positive cap,
`maxPointsForTasks` returns `Infinity`, which disables the perfect-score
condition (timer still applies). Any change to progressive scoring must update
both functions together.

## Concurrency
`finalizeChallenge` claims via conditional PATCH `status=eq.active` +
`Prefer: return=representation`; empty result = lost the race → bail. This makes
concurrent ticks across multiple autoscale instances safe (exactly-once reward
grants). See also `supabase-rest-once-only-mutex.md`.
