import AsyncStorage from '@react-native-async-storage/async-storage';
import { trpcClient } from '@/lib/trpc';
import type { Location as LocationType } from '@/types/trip';

// h3-js is an emscripten (asm.js) module whose initialization runs at import
// time. Importing it statically pulls that heavy init into the app's BOOT path
// (this file is reached via TripProvider at app root), which crashes release
// Hermes builds on launch. We therefore lazy-load it the first time a territory
// rendering helper actually needs it — well after the app has finished booting —
// and cache the module. If the require ever throws, we degrade gracefully (the
// callers already return safe defaults) instead of taking the whole app down.
type H3Module = typeof import('h3-js');
let h3Cache: H3Module | null | undefined;
function getH3(): H3Module | null {
  if (h3Cache !== undefined) return h3Cache;
  try {
    h3Cache = require('h3-js') as H3Module;
  } catch (err) {
    console.error('[TERRITORY] failed to load h3-js:', err);
    h3Cache = null;
  }
  return h3Cache;
}

// Mirror of the server constants (display only — the server is authoritative).
export const FREE_CELL_CAP = 50;

// H3 resolution for the coarse "region"/area grouping used by King-of-the-Area.
// Must match REGION_RES on the server.
const REGION_RES = 6;

// Max GPS points we send to the server for one trip. Cells are ~174m wide, so a
// few hundred points already cover a long drive; this caps payload size.
const MAX_POINTS_PER_TRIP = 1000;

const RECORDED_TRIPS_KEY = 'territory_recorded_trips';
const RECORDED_TRIPS_MAX = 200;

// Durable set of trips whose territory record has been ATTEMPTED but not yet
// confirmed persisted. The retry loop drives off THIS set (not "all ended trips"),
// and a trip is removed the instant the server confirms persistence — so a
// successfully-recorded trip can never be replayed (which would double-count
// visits), even after it ages out of the rolling recent-guard above. Capped only
// as a safety valve for the degenerate "tables never created" case where nothing
// can ever persist.
const PENDING_TRIPS_KEY = 'territory_pending_trips';
const PENDING_TRIPS_MAX = 1000;

export const TERRITORY_COLORS = {
  mineFill: 'rgba(34,197,94,0.22)',
  mineStroke: 'rgba(34,197,94,0.85)',
  rivalFill: 'rgba(239,68,68,0.20)',
  rivalStroke: 'rgba(239,68,68,0.80)',
  king: '#FFD54A',
};

export interface LatLng {
  latitude: number;
  longitude: number;
}

// Convert an H3 cell index into a closed polygon ring for react-native-maps.
export function cellToPolygon(h3: string): LatLng[] {
  try {
    const h3lib = getH3();
    if (!h3lib) return [];
    const boundary = h3lib.cellToBoundary(h3); // [[lat, lng], ...]
    return boundary.map(([lat, lng]) => ({ latitude: lat, longitude: lng }));
  } catch {
    return [];
  }
}

// Coarse region (H3 parent) for a lat/lng, used to look up the current area's
// King on the drive map. Returns null if H3 can't index the point.
export function latLngToRegion(lat: number, lng: number): string | null {
  try {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    const h3lib = getH3();
    if (!h3lib) return null;
    return h3lib.cellToParent(h3lib.latLngToCell(lat, lng, 9), REGION_RES);
  } catch {
    return null;
  }
}

function downsample(points: LatLng[], maxPoints: number): LatLng[] {
  if (points.length <= maxPoints) return points;
  const result: LatLng[] = [points[0]];
  const step = (points.length - 1) / (maxPoints - 1);
  for (let i = 1; i < maxPoints - 1; i++) {
    result.push(points[Math.round(i * step)]);
  }
  result.push(points[points.length - 1]);
  return result;
}

async function alreadyRecorded(tripId: string): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(RECORDED_TRIPS_KEY);
    if (!raw) return false;
    const ids = JSON.parse(raw) as string[];
    return Array.isArray(ids) && ids.includes(tripId);
  } catch {
    return false;
  }
}

async function markRecorded(tripId: string): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(RECORDED_TRIPS_KEY);
    let ids: string[] = raw ? (JSON.parse(raw) as string[]) : [];
    if (!Array.isArray(ids)) ids = [];
    if (ids.includes(tripId)) return;
    ids.push(tripId);
    if (ids.length > RECORDED_TRIPS_MAX) ids = ids.slice(ids.length - RECORDED_TRIPS_MAX);
    await AsyncStorage.setItem(RECORDED_TRIPS_KEY, JSON.stringify(ids));
  } catch {
    // best-effort; double-record is harmless beyond minor visit inflation
  }
}

async function readPending(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(PENDING_TRIPS_KEY);
    const ids = raw ? (JSON.parse(raw) as string[]) : [];
    return Array.isArray(ids) ? ids : [];
  } catch {
    return [];
  }
}

async function addPending(tripId: string): Promise<void> {
  try {
    let ids = await readPending();
    if (ids.includes(tripId)) return;
    ids.push(tripId);
    if (ids.length > PENDING_TRIPS_MAX) ids = ids.slice(ids.length - PENDING_TRIPS_MAX);
    await AsyncStorage.setItem(PENDING_TRIPS_KEY, JSON.stringify(ids));
  } catch {
    // best-effort
  }
}

async function clearPending(tripId: string): Promise<void> {
  try {
    const ids = await readPending();
    if (!ids.includes(tripId)) return;
    await AsyncStorage.setItem(
      PENDING_TRIPS_KEY,
      JSON.stringify(ids.filter((id) => id !== tripId)),
    );
  } catch {
    // best-effort
  }
}

// Trip ids whose territory record is attempted-but-unconfirmed. The TripProvider
// sync loop retries ONLY these (never the full trip history), so a persisted trip
// is never replayed.
export async function getPendingTerritoryTripIds(): Promise<string[]> {
  return readPending();
}

// Drop a pending trip that can no longer be recorded (e.g. its route points are
// gone), so it doesn't linger in the retry set forever.
export async function clearPendingTerritoryTrip(tripId: string): Promise<void> {
  await clearPending(tripId);
}

export interface TerritorySummary {
  claimed: number;
  taken: number;
  defended: number;
  blocked: number;
  totalOwned: number;
  capReached: boolean;
  isPro: boolean;
  cap: number;
  // false when the server couldn't persist (missing tables / DB error). The
  // client leaves the trip un-recorded so it can be re-tried later.
  persisted: boolean;
}

// Record a finished trip's route as claimed territory. Idempotent per trip via an
// AsyncStorage guard so react-query retries / re-mounts can't double-count visits.
// Returns the server summary, or null when skipped (no user, no points, dup, error).
export async function recordTerritoryForTrip(
  tripId: string,
  locations: LocationType[],
): Promise<TerritorySummary | null> {
  try {
    if (!tripId || !Array.isArray(locations) || locations.length === 0) return null;
    if (await alreadyRecorded(tripId)) {
      await clearPending(tripId);
      return null;
    }

    const stored = await AsyncStorage.getItem('user_profile');
    if (!stored) return null;
    let userId: string | undefined;
    try {
      userId = (JSON.parse(stored) as { id?: string }).id;
    } catch {
      return null;
    }
    if (!userId) return null;

    const points: LatLng[] = locations
      .filter(
        (l) =>
          Number.isFinite(l.latitude) &&
          Number.isFinite(l.longitude) &&
          Math.abs(l.latitude) <= 90 &&
          Math.abs(l.longitude) <= 180,
      )
      .map((l) => ({ latitude: l.latitude, longitude: l.longitude }));
    if (points.length === 0) return null;

    // Mark pending BEFORE the network attempt so an interrupted or failed record
    // is durably retried — and so the retry loop only ever touches genuinely
    // unconfirmed trips, never the full trip history.
    await addPending(tripId);

    const summary = (await trpcClient.territory.recordTrip.mutate({
      userId,
      points: downsample(points, MAX_POINTS_PER_TRIP),
    })) as TerritorySummary;

    // Only clear pending / guard against re-recording once the server confirms it
    // committed. If the request throws or the write didn't persist (missing tables
    // / transient DB error), the trip stays pending so it isn't permanently lost.
    if (summary && summary.persisted) {
      await markRecorded(tripId);
      await clearPending(tripId);
    }
    return summary;
  } catch (err) {
    console.error('[TERRITORY] recordTerritoryForTrip failed:', err);
    return null;
  }
}
