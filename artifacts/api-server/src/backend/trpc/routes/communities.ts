import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "../create-context";
import { isDbConfigured, getSupabaseHeaders, getSupabaseRestUrl } from "../db";

interface CommunityUserRow {
  id: string;
  display_name?: string;
  car_brand?: string;
  car_model?: string;
}

interface CommunityTripRow {
  id: string;
  user_id: string;
  user_name?: string;
  start_time?: number;
  distance?: number | null;
  duration?: number | null;
  avg_speed?: number | null;
  top_speed?: number | null;
  car_brand?: string;
  car_model?: string;
}

const SortEnum = z.enum(["topSpeed", "distance", "recent"]);
type Sort = z.infer<typeof SortEnum>;

async function fetchCommunityUserIds(brand: string, model: string): Promise<CommunityUserRow[]> {
  const url = `${getSupabaseRestUrl("users")}?car_brand=eq.${encodeURIComponent(brand)}&car_model=eq.${encodeURIComponent(model)}&select=id,display_name,car_brand,car_model`;
  const resp = await fetch(url, { method: "GET", headers: getSupabaseHeaders() });
  if (!resp.ok) return [];
  return (await resp.json()) as CommunityUserRow[];
}

function computeAggregateStats(trips: CommunityTripRow[]): {
  avgTopSpeed: number;
  avgDistance: number;
  totalTrips: number;
  totalDistance: number;
} {
  if (trips.length === 0) {
    return { avgTopSpeed: 0, avgDistance: 0, totalTrips: 0, totalDistance: 0 };
  }
  const totalDistance = trips.reduce((s, t) => s + (t.distance ?? 0), 0);
  const totalTopSpeed = trips.reduce((s, t) => s + (t.top_speed ?? 0), 0);
  return {
    avgTopSpeed: totalTopSpeed / trips.length,
    avgDistance: totalDistance / trips.length,
    totalTrips: trips.length,
    totalDistance,
  };
}

export const communitiesRouter = createTRPCRouter({
  getMyCommunity: publicProcedure
    .input(
      z.object({
        userId: z.string().min(1),
        brand: z.string().optional(),
        model: z.string().optional(),
      }),
    )
    .query(async ({ input }) => {
      if (!isDbConfigured()) {
        return { available: false as const, reason: "db" as const };
      }

      let brand = input.brand;
      let model = input.model;

      if (!brand || !model) {
        const url = `${getSupabaseRestUrl("users")}?id=eq.${encodeURIComponent(input.userId)}&select=car_brand,car_model&limit=1`;
        const resp = await fetch(url, { method: "GET", headers: getSupabaseHeaders() });
        if (resp.ok) {
          const rows = (await resp.json()) as CommunityUserRow[];
          if (rows[0]) {
            brand = brand ?? rows[0].car_brand;
            model = model ?? rows[0].car_model;
          }
        }
      }

      if (!brand || !model) {
        return { available: false as const, reason: "no_car" as const };
      }

      const members = await fetchCommunityUserIds(brand, model);
      const memberIds = members.map((m) => m.id);
      if (memberIds.length === 0) {
        return {
          available: true as const,
          brand,
          model,
          memberCount: 0,
          stats: { avgTopSpeed: 0, avgDistance: 0, totalTrips: 0, totalDistance: 0 },
          topMembers: [],
        };
      }

      const idList = memberIds.map(encodeURIComponent).join(",");
      const tripsUrl = `${getSupabaseRestUrl("trips")}?user_id=in.(${idList})&select=id,user_id,user_name,top_speed,distance,duration,avg_speed,start_time&limit=2000`;
      const tripsResp = await fetch(tripsUrl, { method: "GET", headers: getSupabaseHeaders() });
      const trips = tripsResp.ok ? ((await tripsResp.json()) as CommunityTripRow[]) : [];

      const stats = computeAggregateStats(trips);

      const bestPerUser = new Map<string, number>();
      for (const t of trips) {
        const v = t.top_speed ?? 0;
        const prev = bestPerUser.get(t.user_id) ?? 0;
        if (v > prev) bestPerUser.set(t.user_id, v);
      }
      const userById = new Map(members.map((u) => [u.id, u] as const));
      const topMembers = Array.from(bestPerUser.entries())
        .map(([uid, v]) => ({
          userId: uid,
          displayName: userById.get(uid)?.display_name ?? "Unknown",
          topSpeed: v,
        }))
        .sort((a, b) => b.topSpeed - a.topSpeed)
        .slice(0, 5);

      return {
        available: true as const,
        brand,
        model,
        memberCount: members.length,
        stats,
        topMembers,
      };
    }),

  getCommunityFeed: publicProcedure
    .input(
      z.object({
        brand: z.string().min(1),
        model: z.string().min(1),
        sort: SortEnum.optional().default("recent"),
        limit: z.number().int().min(1).max(50).optional().default(10),
      }),
    )
    .query(async ({ input }) => {
      if (!isDbConfigured()) return { trips: [] };

      const members = await fetchCommunityUserIds(input.brand, input.model);
      const memberIds = members.map((m) => m.id);
      if (memberIds.length === 0) return { trips: [] };

      const idList = memberIds.map(encodeURIComponent).join(",");
      const orderBy = ((s: Sort): string => {
        switch (s) {
          case "topSpeed":
            return "top_speed.desc.nullslast";
          case "distance":
            return "distance.desc.nullslast";
          case "recent":
          default:
            return "start_time.desc.nullslast";
        }
      })(input.sort);

      const url = `${getSupabaseRestUrl("trips")}?user_id=in.(${idList})&select=id,user_id,user_name,top_speed,distance,duration,avg_speed,start_time,car_brand,car_model&order=${orderBy}&limit=${input.limit}`;
      const resp = await fetch(url, { method: "GET", headers: getSupabaseHeaders() });
      if (!resp.ok) return { trips: [] };
      const trips = (await resp.json()) as CommunityTripRow[];

      const userById = new Map(members.map((m) => [m.id, m] as const));
      return {
        trips: trips.map((t) => ({
          id: t.id,
          userId: t.user_id,
          userName: t.user_name ?? userById.get(t.user_id)?.display_name ?? "Unknown",
          topSpeed: t.top_speed ?? 0,
          distance: t.distance ?? 0,
          duration: t.duration ?? 0,
          avgSpeed: t.avg_speed ?? 0,
          startTime: t.start_time ?? 0,
        })),
      };
    }),
});
