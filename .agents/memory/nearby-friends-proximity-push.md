---
name: Nearby Friends proximity push + free-open gate
description: Design + gotchas for the "friend nearby" push and the Friends Map free-open paywall gate in RedLine.
---

# "Friend nearby" push (server-side)

Triggered fire-and-forget from `updateUserLocation` (only when the write persisted).
Recipients = the people who **FOLLOW the mover** (`follows.following_id = moverId`),
because those are the users who see the mover on *their* friends map — so "X is
driving nearby" goes to the followers, not to the people the mover follows.

**Why this direction:** the friends map shows people you follow; the valuable push
re-engages an idle follower when someone they track appears near them.

**Guards (all must hold):** mover `location_sharing_enabled=true`; recipient has
`push_token` + location fresh within 2h; distance ≤ 25km.

**Cooldown = the anti-spam contract.** 3h per (mover,recipient) via a dedicated
`nearby_ping_cooldown` table. It is **fail-closed**: if the cooldown read/upsert
errors (e.g. the table isn't created yet) the send is SKIPPED. Never make this
fail-open — a missing table would then blast a push on every location tick.
Cooldown is upserted BEFORE the send. Requires one-time DDL (see replit.md); until
then the feature no-ops cleanly.

**Known residual race:** two concurrent location updates for the same mover can both
pass the pre-read and both send (rare duplicate). Acceptable; upsert-before-send
shrinks the window. If it ever matters, switch to an insert-if-stale conditional
write instead of read→filter→upsert.

# Free-open paywall gate (client)

Friends Map button → `handleOpenFriendsMap` in `app/(tabs)/leaderboard.tsx`.
Pro = always open. Free = `FRIENDS_MAP_FREE_OPENS` (3) opens counted in AsyncStorage
`@redline:nearbyFriendsOpens`, then `presentPaywall('nearby_friends_locked')`.

**Fail-open vs stay-gated is deliberate:** `not_presented`/`error` (web / Expo Go /
unconfigured paywall) and AsyncStorage errors → OPEN, so a paywall glitch never
hard-locks the feature. Only an explicit `cancelled` keeps the user gated.

**Gotcha that bit us:** the handler was written but the button still had an inline
`router.push('/nearby-friends')`, so the gate silently did nothing. When adding a
gate to an existing nav button, re-point the button's `onPress` — grep for the
`router.push` target to be sure it isn't bypassed elsewhere.
