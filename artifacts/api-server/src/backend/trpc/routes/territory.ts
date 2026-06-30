import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { latLngToCell, cellToLatLng, cellToParent } from "h3-js";
import { createTRPCRouter, publicProcedure } from "../create-context";
import { isDbConfigured, getSupabaseHeaders, getSupabaseRestUrl } from "../db";
import { cachedOrFetch, cacheInvalidatePrefix } from "../cache";
import { fetchProUserIds } from "./subscription";

// H3 resolution for individual claimable cells (~174m edge, ~0.1 km^2).
const TERRITORY_RES = 9;
// Coarser parent resolution used to group cells into a "region"/area for the
// regional King leaderboard (~district sized).
const REGION_RES = 6;
// Free users can hold at most this many cells. Pro is unlimited.
const FREE_CELL_CAP = 50;
// Hard ceiling on cells processed from a single trip (defensive).
const MAX_CELLS_PER_TRIP = 1500;

const TABLE_CELLS = "territory_cells";
const TABLE_CLAIMS = "territory_claims";

interface CellRow {
  h3: string;
  owner_id: string;
  owner_visits: number;
  region_h3: string;
  lat: number;
  lng: number;
  updated_at: number;
}

interface ClaimRow {
  id: string;
  h3: string;
  user_id: string;
  visits: number;
  region_h3: string;
  updated_at: number;
}

function ensureDb() {
  if (!isDbConfigured()) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Database is not configured.",
    });
  }
}

function newId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function quoteList(ids: string[]): string {
  return ids.map((id) => `"${id}"`).join(",");
}

// Returns true only when every batch persisted. A false result means the write
// did NOT commit (missing table, transient DB error) so callers must not report
// optimistic claim counts or invalidate caches as if the data changed.
async function upsert(
  table: string,
  rows: object[],
  onConflict: string,
  batchSize = 500,
): Promise<boolean> {
  const headers = {
    ...getSupabaseHeaders(),
    Prefer: "resolution=merge-duplicates,return=minimal",
  };
  let ok = true;
  for (const batch of chunk(rows, batchSize)) {
    const url = `${getSupabaseRestUrl(table)}?on_conflict=${onConflict}`;
    const resp = await fetch(url, { method: "POST", headers, body: JSON.stringify(batch) });
    if (!resp.ok) {
      const text = await resp.text();
      console.error(`[TERRITORY] upsert ${table} failed`, resp.status, text);
      ok = false;
    }
  }
  return ok;
}

// Contested takeover of a rival-owned cell. The takeover is applied with a
// DB-side guard (`owner_id != me` AND `owner_visits < my visits`) so the contest
// rule — "a Pro out-driving the current owner's visit count wins the cell" — is
// enforced ATOMICALLY at the database, not from the stale snapshot read earlier
// in the request. Two rivals racing on the same cell with the same stale read
// can't both win: PostgREST evaluates the filter against the live row, so only
// the writer whose visit count still exceeds the (possibly already-updated)
// owner_visits succeeds. Returns true only when a row was actually updated.
async function conditionalTakeover(row: CellRow): Promise<boolean> {
  const headers = { ...getSupabaseHeaders(), Prefer: "return=representation" };
  const url =
    `${getSupabaseRestUrl(TABLE_CELLS)}?h3=eq.${encodeURIComponent(row.h3)}` +
    `&owner_id=neq.${encodeURIComponent(row.owner_id)}` +
    `&owner_visits=lt.${row.owner_visits}`;
  const body = {
    owner_id: row.owner_id,
    owner_visits: row.owner_visits,
    region_h3: row.region_h3,
    lat: row.lat,
    lng: row.lng,
    updated_at: row.updated_at,
  };
  const resp = await fetch(url, { method: "PATCH", headers, body: JSON.stringify(body) });
  if (!resp.ok) {
    const text = await resp.text();
    console.error("[TERRITORY] takeover PATCH failed", resp.status, text);
    return false;
  }
  const updated = (await resp.json()) as unknown[];
  return Array.isArray(updated) && updated.length > 0;
}

async function fetchUserNames(userIds: string[]): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  const unique = [...new Set(userIds)];
  if (unique.length === 0) return result;
  for (const batch of chunk(unique, 150)) {
    const url = `${getSupabaseRestUrl("users")}?id=in.(${quoteList(batch)})&select=id,display_name`;
    const resp = await fetch(url, { method: "GET", headers: getSupabaseHeaders() });
    if (!resp.ok) continue;
    const rows = (await resp.json()) as { id: string; display_name?: string }[];
    for (const r of rows) result.set(r.id, r.display_name || "Driver");
  }
  return result;
}

// Aggregate owner -> owned-cell count, sorted desc. Pulls a bounded slice of
// territory_cells and counts in-memory (acceptable at current scale; cached).
async function aggregateOwners(filterParam?: string): Promise<[string, number][]> {
  const counts = new Map<string, number>();
  const base = `${getSupabaseRestUrl(TABLE_CELLS)}?select=owner_id${filterParam ? `&${filterParam}` : ""}&limit=200000`;
  const resp = await fetch(base, { method: "GET", headers: getSupabaseHeaders() });
  if (!resp.ok) return [];
  const rows = (await resp.json()) as { owner_id: string }[];
  for (const r of rows) {
    if (!r.owner_id) continue;
    counts.set(r.owner_id, (counts.get(r.owner_id) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

export const territoryRouter = createTRPCRouter({
  // Record a finished trip's GPS points as claimed territory. Server-authoritative:
  // empty cells are claimed instantly; rival-owned cells can only be taken over by
  // Pro users who out-drive the current owner's visit count.
  recordTrip: publicProcedure
    .input(
      z.object({
        userId: z.string().min(1),
        points: z
          .array(z.object({ latitude: z.number(), longitude: z.number() }))
          .max(5000),
      }),
    )
    .mutation(async ({ input }) => {
      ensureDb();
      const now = Date.now();
      const empty = {
        claimed: 0,
        taken: 0,
        defended: 0,
        blocked: 0,
        totalOwned: 0,
        capReached: false,
        isPro: false,
        cap: FREE_CELL_CAP,
        persisted: true,
      };
      if (input.points.length === 0) return empty;

      // Compute unique cells (+ centers + region parents) from the route.
      const cellCenter = new Map<string, { lat: number; lng: number }>();
      const cellRegion = new Map<string, string>();
      for (const p of input.points) {
        if (!Number.isFinite(p.latitude) || !Number.isFinite(p.longitude)) continue;
        if (Math.abs(p.latitude) > 90 || Math.abs(p.longitude) > 180) continue;
        let cell: string;
        try {
          cell = latLngToCell(p.latitude, p.longitude, TERRITORY_RES);
        } catch {
          continue;
        }
        if (cellCenter.has(cell)) continue;
        const [clat, clng] = cellToLatLng(cell);
        cellCenter.set(cell, { lat: clat, lng: clng });
        cellRegion.set(cell, cellToParent(cell, REGION_RES));
        if (cellCenter.size >= MAX_CELLS_PER_TRIP) break;
      }
      const cells = [...cellCenter.keys()];
      if (cells.length === 0) return { ...empty };

      const isPro = (await fetchProUserIds([input.userId])).has(input.userId);

      // Existing per-user claims for these cells (to grow visit counts + reuse ids).
      const myClaims = new Map<string, { id: string; visits: number }>();
      for (const batch of chunk(cells, 120)) {
        const url = `${getSupabaseRestUrl(TABLE_CLAIMS)}?user_id=eq.${encodeURIComponent(input.userId)}&h3=in.(${quoteList(batch)})&select=id,h3,visits`;
        const resp = await fetch(url, { method: "GET", headers: getSupabaseHeaders() });
        if (!resp.ok) continue;
        const rows = (await resp.json()) as { id: string; h3: string; visits: number }[];
        for (const r of rows) myClaims.set(r.h3, { id: r.id, visits: r.visits });
      }

      // Current owners of these cells.
      const owners = new Map<string, { ownerId: string; ownerVisits: number }>();
      for (const batch of chunk(cells, 120)) {
        const url = `${getSupabaseRestUrl(TABLE_CELLS)}?h3=in.(${quoteList(batch)})&select=h3,owner_id,owner_visits`;
        const resp = await fetch(url, { method: "GET", headers: getSupabaseHeaders() });
        if (!resp.ok) continue;
        const rows = (await resp.json()) as { h3: string; owner_id: string; owner_visits: number }[];
        for (const r of rows) owners.set(r.h3, { ownerId: r.owner_id, ownerVisits: r.owner_visits });
      }

      // Current total owned (for free cap enforcement + summary).
      let ownedCount = 0;
      {
        const url = `${getSupabaseRestUrl(TABLE_CELLS)}?owner_id=eq.${encodeURIComponent(input.userId)}&select=h3&limit=100000`;
        const resp = await fetch(url, { method: "GET", headers: getSupabaseHeaders() });
        if (resp.ok) ownedCount = ((await resp.json()) as unknown[]).length;
      }

      let claimed = 0;
      let taken = 0;
      let defended = 0;
      let blocked = 0;
      let capReached = false;
      const claimRows: ClaimRow[] = [];
      // Uncontested writes (new claims + cells I already own) go in one batch
      // upsert; contested rival cells are resolved individually with a DB-guarded
      // conditional PATCH so concurrent takeovers stay deterministic.
      const safeCellRows: CellRow[] = [];
      const takeoverRows: CellRow[] = [];

      for (const h3 of cells) {
        const region = cellRegion.get(h3)!;
        const center = cellCenter.get(h3)!;
        const existing = myClaims.get(h3);
        const myVisits = (existing?.visits ?? 0) + 1;
        claimRows.push({
          id: existing?.id ?? newId("tclaim"),
          h3,
          user_id: input.userId,
          visits: myVisits,
          region_h3: region,
          updated_at: now,
        });

        const cur = owners.get(h3);
        const ownedRow: CellRow = {
          h3,
          owner_id: input.userId,
          owner_visits: myVisits,
          region_h3: region,
          lat: center.lat,
          lng: center.lng,
          updated_at: now,
        };

        if (!cur) {
          if (isPro || ownedCount < FREE_CELL_CAP) {
            safeCellRows.push(ownedRow);
            claimed++;
            ownedCount++;
          } else {
            capReached = true;
          }
        } else if (cur.ownerId === input.userId) {
          safeCellRows.push(ownedRow);
          defended++;
        } else if (isPro && myVisits > cur.ownerVisits) {
          // Contested: resolved via guarded PATCH below; taken/blocked is decided
          // by whether the DB guard still holds at write time, not this stale read.
          takeoverRows.push(ownedRow);
        } else {
          // Rival-owned and we can't take it (free user, or not enough visits yet).
          blocked++;
        }
      }

      // Write ownership (territory_cells) FIRST, then per-user claims (the visit
      // counter) LAST as a single atomic batch. owner_visits is set to the
      // ABSOLUTE value derived from the claims table, so if cells commit but
      // claims don't, a later retry recomputes the same value (idempotent set,
      // no inflation). Claims is a single request (no chunked partial commit) so
      // it can't half-apply and double-count visits on retry.
      //
      // CRITICAL ordering guarantee: claims (the +1 visit increment) is only
      // written when cells fully committed. If cells fail we return persisted:
      // false WITHOUT touching claims, so a client retry recomputes the same
      // myVisits (claims unchanged) — never +2. This closes the
      // cells-fail/claims-succeed inflation path.
      const cellsOk = safeCellRows.length ? await upsert(TABLE_CELLS, safeCellRows, "h3") : true;
      if (!cellsOk) {
        return { ...empty, isPro, persisted: false };
      }

      // Resolve contested rival cells one-by-one with a DB-guarded conditional
      // PATCH. A guard miss (a concurrent rival already out-drove us, or we lost
      // the race) is NOT a failure — the cell is simply reported as blocked. We
      // re-read owners at the start of every recordTrip, so a retry re-classifies
      // an already-won cell as a cheap defended upsert rather than a double-take.
      for (const row of takeoverRows) {
        const won = await conditionalTakeover(row);
        if (won) {
          taken++;
          ownedCount++;
        } else {
          blocked++;
        }
      }

      const claimsOk = claimRows.length
        ? await upsert(TABLE_CLAIMS, claimRows, "h3,user_id", claimRows.length)
        : true;
      const persisted = cellsOk && claimsOk;

      // If the writes didn't commit (missing tables / transient DB failure), do
      // NOT report optimistic claim counts or invalidate caches — the client
      // keeps the trip un-recorded so it isn't permanently lost.
      if (!persisted) {
        return { ...empty, isPro, persisted: false };
      }

      cacheInvalidatePrefix("territory:");
      return {
        claimed,
        taken,
        defended,
        blocked,
        totalOwned: ownedCount,
        capReached,
        isPro,
        cap: FREE_CELL_CAP,
        persisted: true,
      };
    }),

  // Cells inside a lat/lng bounding box, for the map overlay.
  getCellsInBounds: publicProcedure
    .input(
      z.object({
        userId: z.string().min(1),
        minLat: z.number(),
        maxLat: z.number(),
        minLng: z.number(),
        maxLng: z.number(),
        limit: z.number().min(1).max(2000).default(800),
      }),
    )
    .query(async ({ input }) => {
      ensureDb();
      const url =
        `${getSupabaseRestUrl(TABLE_CELLS)}?lat=gte.${input.minLat}&lat=lte.${input.maxLat}` +
        `&lng=gte.${input.minLng}&lng=lte.${input.maxLng}` +
        `&select=h3,owner_id,owner_visits,region_h3&limit=${input.limit}`;
      const resp = await fetch(url, { method: "GET", headers: getSupabaseHeaders() });
      // Degrade gracefully: a missing table or transient error just means no
      // overlay to show, not a hard map error.
      if (!resp.ok) {
        return { cells: [] };
      }
      const rows = (await resp.json()) as CellRow[];
      const names = await fetchUserNames(rows.map((r) => r.owner_id));
      return {
        cells: rows.map((r) => ({
          h3: r.h3,
          ownerId: r.owner_id,
          ownerName: names.get(r.owner_id) ?? "Driver",
          visits: r.owner_visits,
          isMine: r.owner_id === input.userId,
        })),
      };
    }),

  // The current user's territory totals + King status for their strongest area.
  getMyTerritory: publicProcedure
    .input(z.object({ userId: z.string().min(1) }))
    .query(async ({ input }) => {
      ensureDb();
      return cachedOrFetch(`territory:my:${input.userId}`, 20_000, async () => {
        const isPro = (await fetchProUserIds([input.userId])).has(input.userId);

        const url = `${getSupabaseRestUrl(TABLE_CELLS)}?owner_id=eq.${encodeURIComponent(input.userId)}&select=region_h3&limit=100000`;
        const resp = await fetch(url, { method: "GET", headers: getSupabaseHeaders() });
        const rows = resp.ok ? ((await resp.json()) as { region_h3: string }[]) : [];
        const totalOwned = rows.length;

        const regionCounts = new Map<string, number>();
        for (const r of rows) regionCounts.set(r.region_h3, (regionCounts.get(r.region_h3) ?? 0) + 1);
        const sortedRegions = [...regionCounts.entries()].sort((a, b) => b[1] - a[1]);
        const topRegionH3 = sortedRegions[0]?.[0] ?? null;

        let topRegion: {
          regionH3: string;
          centerLat: number;
          centerLng: number;
          myCount: number;
          myRank: number;
          totalCells: number;
          king: { userId: string; name: string; count: number } | null;
          isKing: boolean;
          iLead: boolean;
        } | null = null;

        if (topRegionH3) {
          const sorted = await aggregateOwners(`region_h3=eq.${encodeURIComponent(topRegionH3)}`);
          const proSet = await fetchProUserIds(sorted.map((e) => e[0]));
          const kingEntry = sorted.find((e) => proSet.has(e[0])) ?? null;
          const names = await fetchUserNames(
            [kingEntry?.[0]].filter((x): x is string => !!x),
          );
          const myIdx = sorted.findIndex((e) => e[0] === input.userId);
          const [clat, clng] = cellToLatLng(topRegionH3);
          topRegion = {
            regionH3: topRegionH3,
            centerLat: clat,
            centerLng: clng,
            myCount: myIdx >= 0 ? sorted[myIdx][1] : 0,
            myRank: myIdx >= 0 ? myIdx + 1 : 0,
            totalCells: sorted.reduce((s, e) => s + e[1], 0),
            king: kingEntry
              ? { userId: kingEntry[0], name: names.get(kingEntry[0]) ?? "Driver", count: kingEntry[1] }
              : null,
            isKing: !!kingEntry && kingEntry[0] === input.userId,
            iLead: sorted[0]?.[0] === input.userId,
          };
        }

        return {
          totalOwned,
          isPro,
          cap: FREE_CELL_CAP,
          regionCount: regionCounts.size,
          topRegion,
        };
      });
    }),

  // Global leaderboard ranked by total cells owned.
  getGlobalLeaderboard: publicProcedure
    .input(z.object({ userId: z.string().min(1), limit: z.number().min(1).max(100).default(50) }))
    .query(async ({ input }) => {
      ensureDb();
      const agg = await cachedOrFetch("territory:global:agg", 60_000, () => aggregateOwners());
      const top = agg.slice(0, input.limit);
      const names = await fetchUserNames(top.map((e) => e[0]));
      const proSet = await fetchProUserIds(top.map((e) => e[0]));
      const entries = top.map((e, i) => ({
        userId: e[0],
        name: names.get(e[0]) ?? "Driver",
        count: e[1],
        rank: i + 1,
        isPro: proSet.has(e[0]),
      }));
      const myIdx = agg.findIndex((e) => e[0] === input.userId);
      return {
        entries,
        total: agg.length,
        me: myIdx >= 0 ? { rank: myIdx + 1, count: agg[myIdx][1] } : { rank: 0, count: 0 },
      };
    }),

  // Regional leaderboard (one H3 region). The top Pro owner is the King.
  getRegionLeaderboard: publicProcedure
    .input(
      z.object({
        userId: z.string().min(1),
        regionH3: z.string().min(1),
        limit: z.number().min(1).max(100).default(25),
      }),
    )
    .query(async ({ input }) => {
      ensureDb();
      const agg = await cachedOrFetch(`territory:region:${input.regionH3}`, 30_000, () =>
        aggregateOwners(`region_h3=eq.${encodeURIComponent(input.regionH3)}`),
      );
      // King = the top Pro owner across the FULL region aggregate, not just the
      // displayed slice. Determining it only within `top` would hide a valid King
      // (or crown the wrong user) when many free users outrank the top Pro owner.
      const proSet = await fetchProUserIds(agg.map((e) => e[0]));
      const kingIdx = agg.findIndex((e) => proSet.has(e[0]));
      const kingId = kingIdx >= 0 ? agg[kingIdx][0] : null;

      const top = agg.slice(0, input.limit);
      // Fetch names for the displayed rows plus the King (who may sit outside the slice).
      const names = await fetchUserNames([...top.map((e) => e[0]), ...(kingId ? [kingId] : [])]);
      const entries = top.map((e, i) => ({
        userId: e[0],
        name: names.get(e[0]) ?? "Driver",
        count: e[1],
        rank: i + 1,
        isPro: proSet.has(e[0]),
        isKing: e[0] === kingId,
      }));
      const myIdx = agg.findIndex((e) => e[0] === input.userId);
      return {
        entries,
        total: agg.length,
        // Canonical King metadata, independent of `limit` so clients never have
        // to infer the King from the (possibly truncated) entry list.
        king:
          kingId !== null
            ? {
                userId: kingId,
                name: names.get(kingId) ?? "Driver",
                count: agg[kingIdx][1],
                rank: kingIdx + 1,
              }
            : null,
        me: myIdx >= 0 ? { rank: myIdx + 1, count: agg[myIdx][1] } : { rank: 0, count: 0 },
      };
    }),
});
