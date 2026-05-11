import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "../create-context";

interface SpeedCameraDTO {
  id: string;
  latitude: number;
  longitude: number;
  speedLimit?: number;
  description?: string;
}

interface OverpassNode {
  type: "node";
  id: number;
  lat: number;
  lon: number;
  tags?: Record<string, string>;
}

interface OverpassResponse {
  elements?: OverpassNode[];
}

const TILE_DEG = 0.1;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const FETCH_RADIUS_M = 8000;
const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.osm.ch/api/interpreter",
];

interface CacheEntry {
  cameras: SpeedCameraDTO[];
  fetchedAt: number;
}

const tileCache = new Map<string, CacheEntry>();

function tileKey(lat: number, lon: number): string {
  const t = (n: number) => Math.floor(n / TILE_DEG) * TILE_DEG;
  return `${t(lat).toFixed(2)},${t(lon).toFixed(2)}`;
}

function tileCenter(key: string): { lat: number; lon: number } {
  const [a, b] = key.split(",").map(Number);
  return { lat: a + TILE_DEG / 2, lon: b + TILE_DEG / 2 };
}

function parseSpeedLimit(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const m = raw.trim().match(/^(\d{2,3})(\s*(mph|kmh|km\/h))?$/i);
  if (!m) return undefined;
  const n = parseInt(m[1], 10);
  if (!Number.isFinite(n)) return undefined;
  if (m[3] && /mph/i.test(m[3])) return Math.round(n * 1.60934);
  return n;
}

function describe(tags: Record<string, string> | undefined): string | undefined {
  if (!tags) return undefined;
  const parts: string[] = [];
  if (tags.name) parts.push(tags.name);
  else if (tags.ref) parts.push(tags.ref);
  if (tags.operator) parts.push(tags.operator);
  if (tags["camera:type"]) parts.push(tags["camera:type"]);
  return parts.length ? parts.join(" · ") : "Speed camera";
}

async function fetchFromOverpass(lat: number, lon: number, radiusM: number): Promise<SpeedCameraDTO[]> {
  const query = `[out:json][timeout:25];node["highway"="speed_camera"](around:${radiusM},${lat},${lon});out;`;
  let lastErr: unknown = null;
  for (const url of OVERPASS_ENDPOINTS) {
    try {
      const resp = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": "RedLineApp/1.0 (speed-camera lookup)",
        },
        body: `data=${encodeURIComponent(query)}`,
      });
      if (!resp.ok) {
        lastErr = new Error(`Overpass ${url} responded ${resp.status}`);
        continue;
      }
      const json = (await resp.json()) as OverpassResponse;
      const elements = json.elements ?? [];
      const cameras: SpeedCameraDTO[] = [];
      for (const el of elements) {
        if (el.type !== "node") continue;
        if (typeof el.lat !== "number" || typeof el.lon !== "number") continue;
        const tags = el.tags;
        cameras.push({
          id: `osm-${el.id}`,
          latitude: el.lat,
          longitude: el.lon,
          speedLimit: parseSpeedLimit(tags?.maxspeed),
          description: describe(tags),
        });
      }
      return cameras;
    } catch (err) {
      lastErr = err;
    }
  }
  console.error("[SPEED_CAMERAS] All Overpass endpoints failed:", lastErr);
  return [];
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export const speedCamerasRouter = createTRPCRouter({
  getNearby: publicProcedure
    .input(
      z.object({
        latitude: z.number().min(-90).max(90),
        longitude: z.number().min(-180).max(180),
        radiusKm: z.number().min(0.1).max(20).optional().default(5),
      })
    )
    .query(async ({ input }) => {
      const key = tileKey(input.latitude, input.longitude);
      const now = Date.now();
      const cached = tileCache.get(key);

      let cameras: SpeedCameraDTO[];
      if (cached && now - cached.fetchedAt < CACHE_TTL_MS) {
        cameras = cached.cameras;
      } else {
        const center = tileCenter(key);
        cameras = await fetchFromOverpass(center.lat, center.lon, FETCH_RADIUS_M);
        tileCache.set(key, { cameras, fetchedAt: now });
        console.log(`[SPEED_CAMERAS] Tile ${key}: fetched ${cameras.length} cameras from Overpass`);

        if (tileCache.size > 500) {
          const oldest = [...tileCache.entries()].sort((a, b) => a[1].fetchedAt - b[1].fetchedAt)[0];
          if (oldest) tileCache.delete(oldest[0]);
        }
      }

      const filtered = cameras.filter(
        (c) => haversineKm(input.latitude, input.longitude, c.latitude, c.longitude) <= input.radiusKm
      );

      return { cameras: filtered, tileKey: key, cachedHit: !!cached };
    }),
});
