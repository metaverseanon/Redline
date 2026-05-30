import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "../create-context";
import { cachedOrFetch } from "../cache";
import {
  getAnthropic,
  isAnthropicConfigured,
  COACH_MODEL,
  extractJsonObject,
} from "../../lib/anthropic";

// Cache generated coaching for 30 days. Keyed by trip id + a hash of the
// metrics so re-generating only happens if the underlying numbers change.
const COACHING_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_TOKENS = 8192;

const UnitEnum = z.enum(["kmh", "mph"]);

const ProMetricsSchema = z.object({
  smoothness: z.number(),
  aggression: z.number(),
  drivingStyle: z.string(),
  bestSectorSpeed: z.number().nullable(),
  bestSectorIndex: z.number().nullable(),
});

const TripStatsSchema = z.object({
  distanceKm: z.number(),
  durationSec: z.number(),
  avgSpeedKmh: z.number(),
  topSpeedKmh: z.number(),
  corners: z.number(),
  maxGForce: z.number().optional(),
  time0to100: z.number().optional(),
});

const TripCoachingInput = z.object({
  tripId: z.string().min(1),
  units: UnitEnum.default("kmh"),
  carModel: z.string().optional(),
  stats: TripStatsSchema,
  metrics: ProMetricsSchema,
});

const InsightSchema = z.object({
  title: z.string().min(1).max(80),
  body: z.string().min(1).max(400),
  tone: z.enum(["praise", "improve", "tip"]),
});

const TripCoachingModelOutput = z.object({
  headline: z.string().min(1).max(120),
  insights: z.array(InsightSchema).min(2).max(4),
});

type TripCoaching = z.infer<typeof TripCoachingModelOutput>;

const WeeklyTripSummarySchema = z.object({
  date: z.string().optional(),
  topSpeedKmh: z.number(),
  distanceKm: z.number(),
  smoothness: z.number(),
  aggression: z.number(),
  drivingStyle: z.string(),
});

const WeeklyCoachingInput = z.object({
  weekKey: z.string().min(1),
  units: UnitEnum.default("kmh"),
  aggregate: z.object({
    totalTrips: z.number(),
    totalDistanceKm: z.number(),
    topSpeedKmh: z.number(),
    avgSmoothness: z.number(),
    avgAggression: z.number(),
  }),
  trips: z.array(WeeklyTripSummarySchema).max(50),
});

const WeeklyCoachingModelOutput = z.object({
  headline: z.string().min(1).max(120),
  whatImproved: z.string().min(1).max(500),
  workOn: z.string().min(1).max(500),
  goal: z.string().min(1).max(300),
});

type WeeklyCoaching = z.infer<typeof WeeklyCoachingModelOutput>;

function hashString(input: string): string {
  let h = 5381;
  for (let i = 0; i < input.length; i++) {
    h = (h * 33) ^ input.charCodeAt(i);
  }
  return (h >>> 0).toString(36);
}

function speedLabel(units: z.infer<typeof UnitEnum>): string {
  return units === "mph" ? "mph" : "km/h";
}

function kmhTo(value: number, units: z.infer<typeof UnitEnum>): number {
  return units === "mph" ? Math.round(value * 0.621371) : Math.round(value);
}

function distanceLabel(units: z.infer<typeof UnitEnum>): string {
  return units === "mph" ? "mi" : "km";
}

function distTo(km: number, units: z.infer<typeof UnitEnum>): number {
  return units === "mph"
    ? Math.round(km * 0.621371 * 10) / 10
    : Math.round(km * 10) / 10;
}

const SYSTEM_PROMPT =
  "You are RedLine's AI drive coach: an expert, encouraging performance-driving coach. " +
  "You analyze real telemetry from a driver's trip and give short, specific, motivating, actionable feedback. " +
  "Be warm and human, never preachy or condescending, and never lecture about breaking the law or safety disclaimers. " +
  "Reference the actual numbers you're given. Respond with strict JSON only — no markdown, no prose outside the JSON.";

async function generateTripCoaching(
  input: z.infer<typeof TripCoachingInput>,
): Promise<TripCoaching> {
  const client = getAnthropic();
  if (!client) throw new Error("AI coach unavailable");

  const { stats, metrics, units, carModel } = input;
  const sl = speedLabel(units);
  const dl = distanceLabel(units);

  const userPrompt = `Here is the telemetry for one drive${carModel ? ` in a ${carModel}` : ""}:
- Distance: ${distTo(stats.distanceKm, units)} ${dl}
- Duration: ${Math.round(stats.durationSec / 60)} min
- Average speed: ${kmhTo(stats.avgSpeedKmh, units)} ${sl}
- Top speed: ${kmhTo(stats.topSpeedKmh, units)} ${sl}
- Corners taken: ${stats.corners}
- Max G-force: ${stats.maxGForce != null ? stats.maxGForce.toFixed(2) + "g" : "n/a"}
- 0-100 km/h: ${stats.time0to100 != null && stats.time0to100 > 0 ? stats.time0to100.toFixed(2) + "s" : "n/a"}
- Smoothness score: ${metrics.smoothness}/100
- Aggression score: ${metrics.aggression}/100
- Driving style: ${metrics.drivingStyle}
- Best sector: ${metrics.bestSectorIndex != null ? `sector ${metrics.bestSectorIndex} at ${kmhTo(metrics.bestSectorSpeed ?? 0, units)} ${sl}` : "n/a"}

Write 2-4 coaching insights derived from THESE numbers. Mix praise for what went well with one or two concrete things to work on next time.

Return strict JSON:
{
  "headline": "short punchy one-line summary of this drive",
  "insights": [
    { "title": "short label (max ~4 words)", "body": "one or two specific sentences referencing the numbers", "tone": "praise|improve|tip" }
  ]
}`;

  const message = await client.messages.create({
    model: COACH_MODEL,
    max_tokens: MAX_TOKENS,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
  });

  const block = message.content.find((b) => b.type === "text");
  const text = block && block.type === "text" ? block.text : "";
  const parsed = extractJsonObject(text);
  return TripCoachingModelOutput.parse(parsed);
}

async function generateWeeklyCoaching(
  input: z.infer<typeof WeeklyCoachingInput>,
): Promise<WeeklyCoaching> {
  const client = getAnthropic();
  if (!client) throw new Error("AI coach unavailable");

  const { aggregate, trips, units } = input;
  const sl = speedLabel(units);
  const dl = distanceLabel(units);

  const tripLines = trips
    .map(
      (t, i) =>
        `  ${i + 1}.${t.date ? ` ${t.date}` : ""} top ${kmhTo(t.topSpeedKmh, units)} ${sl}, ${distTo(t.distanceKm, units)} ${dl}, smoothness ${t.smoothness}, aggression ${t.aggression}, style ${t.drivingStyle}`,
    )
    .join("\n");

  const userPrompt = `Here is a driver's week of drives.
Aggregate:
- Total drives: ${aggregate.totalTrips}
- Total distance: ${distTo(aggregate.totalDistanceKm, units)} ${dl}
- Best top speed: ${kmhTo(aggregate.topSpeedKmh, units)} ${sl}
- Average smoothness: ${Math.round(aggregate.avgSmoothness)}/100
- Average aggression: ${Math.round(aggregate.avgAggression)}/100

Per drive (oldest to newest):
${tripLines || "  (no per-drive detail)"}

Summarize the week's trends: what improved, what to work on, and one concrete goal for next week. Reference real numbers and trends across the drives.

Return strict JSON:
{
  "headline": "short one-line summary of the week",
  "whatImproved": "one or two sentences on what got better",
  "workOn": "one or two sentences on what to improve",
  "goal": "one concrete, measurable goal for next week"
}`;

  const message = await client.messages.create({
    model: COACH_MODEL,
    max_tokens: MAX_TOKENS,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
  });

  const block = message.content.find((b) => b.type === "text");
  const text = block && block.type === "text" ? block.text : "";
  const parsed = extractJsonObject(text);
  return WeeklyCoachingModelOutput.parse(parsed);
}

export const coachRouter = createTRPCRouter({
  getTripCoaching: publicProcedure
    .input(TripCoachingInput)
    .query(async ({ input }) => {
      if (!isAnthropicConfigured()) {
        return { available: false as const, reason: "ai_unconfigured" as const };
      }

      const fingerprint = hashString(
        JSON.stringify({
          s: input.stats,
          m: input.metrics,
          u: input.units,
          c: input.carModel ?? "",
        }),
      );
      const cacheKey = `coach:trip:${input.tripId}:${fingerprint}`;

      try {
        const data = await cachedOrFetch(cacheKey, COACHING_TTL_MS, () =>
          generateTripCoaching(input),
        );
        return { available: true as const, ...data };
      } catch (err) {
        console.error("[COACH] getTripCoaching failed:", err instanceof Error ? err.message : String(err));
        // Throw so the client distinguishes a transient failure (retry) from a
        // genuine "unavailable" state.
        throw err;
      }
    }),

  getWeeklyCoaching: publicProcedure
    .input(WeeklyCoachingInput)
    .query(async ({ input }) => {
      if (!isAnthropicConfigured()) {
        return { available: false as const, reason: "ai_unconfigured" as const };
      }

      const fingerprint = hashString(
        JSON.stringify({
          a: input.aggregate,
          u: input.units,
          // Include the ordered per-trip payload so the key invalidates when any
          // trip's metrics/date/style/order changes — not just the aggregate.
          t: input.trips.map((tr) => [
            tr.date ?? "",
            tr.topSpeedKmh,
            tr.distanceKm,
            tr.smoothness,
            tr.aggression,
            tr.drivingStyle,
          ]),
        }),
      );
      const cacheKey = `coach:weekly:${input.weekKey}:${fingerprint}`;

      try {
        const data = await cachedOrFetch(cacheKey, COACHING_TTL_MS, () =>
          generateWeeklyCoaching(input),
        );
        return { available: true as const, ...data };
      } catch (err) {
        console.error("[COACH] getWeeklyCoaching failed:", err instanceof Error ? err.message : String(err));
        throw err;
      }
    }),
});
