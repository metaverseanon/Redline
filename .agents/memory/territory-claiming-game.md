---
name: Territory Claiming Game
description: Non-obvious invariants for the H3 territory feature (RedLine) so future changes don't regress correctness under Supabase-REST + no-auth constraints.
---

# Territory Claiming Game

H3-cell territory game: driving claims hex cells; regional "King of the Area" (top
Pro owner) + global most-territory leaderboard. Free users are capped; Pro =
unlimited + can contest rivals + King eligibility.

## Invariants worth keeping (the non-obvious "why")

- **Anything that gates on Pro or ownership MUST be re-verified server-side.**
  The api-server has no auth (publicProcedure + client-supplied userId), so Pro
  status comes from RevenueCat (`fetchProUserIds`), never the client. Same rule as
  the broader RedLine trust model — don't reintroduce client-trusted gating here.

- **No unconditional upsert on cell ownership — every write is DB-guarded.**
  Supabase REST has no transactions, so a read-then-merge-upsert lets two drivers
  both "win" a cell (last-write-wins) and breaks the contest rule. Each ownership
  write evaluates its guard against the *live* row (new = insert-ignore-duplicates,
  defend own = guarded on self-ownership, contest rival = guarded on
  rival-owned + my-visits-greater) and uses `return=representation` to learn what
  actually committed; a guard miss is reported as `blocked`, not an error.

- **Free cap is enforced on cells that actually COMMIT, not optimistically.**
  Counting intended claims before knowing which inserts landed falsely denied a
  near-cap free user whenever an attempt lost a race. Fill up to the remaining cap
  from committed inserts, re-attempting later candidates.

- **Persistence-truth contract:** the record mutation returns a `persisted` flag;
  on any write failure it returns `persisted:false` and the client does NOT set its
  dedupe guard. The earlier version marked a trip recorded *before* the network call
  and swallowed upsert failures, permanently losing that trip's territory on a
  transient error. Any new cell-writing mutation must thread the same flag and the
  client must gate its dedupe/optimistic UI on it.

- **Territory recording is retry-until-persisted, and the retry must be driven by a
  DURABLE pending set — not the trip history.** A trip is added to a persistent
  pending set before the network call and removed only on `persisted:true`; the sync
  loop retries only pending trips. An earlier version retried *all* ended trips and
  deduped via a rolling recent-id cap, so once a user exceeded the cap old ids aged
  out and got re-recorded — and since each record call increments visit counts by
  +1, replays double-counted and could flip ownership. Also: the pending retry must
  run independently of trip-sync state (a trip can sync to the backend while its
  territory write fails), so don't gate it behind the "any unsynced trips?" check.

- **Changing the H3 resolutions is a data migration, not a tweak** — cell ids are
  resolution-specific, so new values orphan every existing row.

- **Two Supabase tables need MANUAL one-time DDL** (dev+prod share one instance);
  prod must be redeployed so the router ships. Until then the feature degrades
  cleanly (empty everywhere, reads return empty on non-OK rather than throwing).
  Full DDL lives in `replit.md`.

- **Map overlay is native-only** — the web build relies on the existing
  react-native-maps web Polygon stub and must never depend on it for real rendering.
