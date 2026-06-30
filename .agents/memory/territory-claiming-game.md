---
name: Territory Claiming Game
description: Design decisions and degradation contract for the H3 territory feature (RedLine), so future changes stay consistent.
---

# Territory Claiming Game

H3-cell territory game in RedLine: driving claims hex cells; regional "King of the
Area" (top Pro owner) + global most-territory leaderboard. Free cap 50 cells; Pro =
unlimited + contest rivals + King eligibility.

## Durable decisions / constraints

- **Server is authoritative; Pro is re-verified server-side** via `fetchProUserIds`
  (RevenueCat), never trusted from the client. Contesting a rival cell requires
  `isPro && myVisits > owner_visits`. King = top *Pro* owner in a region.
  **Why:** the api-server has no auth (publicProcedure + client userId), so any
  Pro/ownership gate that matters must be enforced from RevenueCat, not the client.

- **Two new Supabase tables require MANUAL DDL** (`territory_cells`,
  `territory_claims`) — dev+prod share one Supabase instance, so run the DDL once;
  prod must also be redeployed so the new tRPC router ships. Full DDL is in
  `replit.md` (Territory section).

- **Persistence-truth contract (do not regress):** `recordTrip` returns a
  `persisted` boolean. On write failure (missing tables / transient DB error) it
  returns `persisted:false` + zeroed counts and skips cache invalidation; the
  client `recordTerritoryForTrip` only sets its AsyncStorage dedupe guard
  (`territory_recorded_trips`) **after** `persisted:true`.
  **Why:** the earlier version marked the trip recorded *before* the network call
  and logged-but-ignored upsert failures, so a transient failure permanently lost
  that trip's territory. Any new write path must thread the same persisted signal.
  **How to apply:** if you add another mutation that writes cells, return a
  persisted flag and gate the client dedupe / optimistic UI on it.

- **Graceful degradation everywhere:** read queries (e.g. `getCellsInBounds`)
  return empty on any non-OK response instead of throwing, so the map/cards show
  nothing rather than erroring when tables are absent.

- **Contested takeovers must be DB-guarded, not snapshot-based.** Taking a rival
  cell is a conditional `PATCH ... &owner_id=neq.me&owner_visits=lt.myVisits` (with
  `return=representation` to detect whether a row was actually updated); only
  uncontested writes (new claims + cells you already own) go through the batch
  upsert. **Why:** Supabase REST has no transactions, so a stale read-then-upsert
  lets two rivals both "win" the same cell (last-write-wins). Evaluating the
  contest filter against the live row makes concurrent takeovers deterministic. A
  guard miss = report `blocked`, not an error.

- **Territory recording must be retried, not fire-once.** Drive-stop recording is
  best-effort; the durable retry is in `TripProvider.syncUnsyncedTrips`, which
  re-calls `recordTerritoryForTrip` for every ended trip that still has route
  points (the AsyncStorage dedupe guard no-ops the already-persisted ones).
  **Why:** an offline / transient failure at stop-time would otherwise lose that
  trip's territory forever. **How to apply:** anything that records territory must
  rely on `persisted:true` for its dedupe and be safe to re-invoke from the sync
  loop (idempotent because owners are re-read every call and visit counts are
  absolute).

- **H3 resolutions:** `TERRITORY_RES=9` (~174m claimable cell), `REGION_RES=6`
  (district/area grouping for Kings). Changing these orphans all existing rows
  (cell ids are resolution-specific) — treat as a data migration, not a tweak.

- **Map overlay is native-only** (`Platform.OS!=='web'`); the web build relies on
  the existing `lib/react-native-maps.web.js` Polygon stub and must never depend on
  it for real rendering.
