import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, publicProcedure } from "../create-context";
import { isDbConfigured, getSupabaseHeaders, getSupabaseRestUrl } from "../db";
import { cachedOrFetch } from "../cache";
import { getActiveProCount, isUserPro } from "./subscription";
import { broadcastPushToAllUsers } from "./notifications";

/**
 * Pro-only, points-based challenges (2-week rounds).
 *
 * A round unlocks ("active") once the live Pro-member count reaches the round's
 * `required_pro_count`. While "pending", everyone (free + pro) can see the
 * unlock progress; once "active", free users see the live leaderboard read-only
 * and Pro users can join + earn points. Highest total points at `end_time` wins;
 * ties broken by who reached their total first (`reached_total_at`).
 *
 * Tables (see the SQL the user ran): challenges, challenge_tasks,
 * challenge_participants, challenge_task_progress, challenge_winners.
 */

const TABLE_CHALLENGES = "challenges";
const TABLE_TASKS = "challenge_tasks";
const TABLE_PARTICIPANTS = "challenge_participants";
const TABLE_WINNERS = "challenge_winners";

const TWO_WEEKS_MS = 14 * 24 * 60 * 60 * 1000;
const SCORE_CACHE_TTL_MS = 60 * 1000;

const REVENUECAT_ENTITLEMENT_ID = process.env.REVENUECAT_ENTITLEMENT_ID ?? "RedLine App Pro";

interface ChallengeRow {
  id: string;
  round_number: number;
  title: string;
  description?: string | null;
  status: "pending" | "active" | "completed";
  required_pro_count: number;
  start_time?: number | null;
  end_time?: number | null;
  cash_prize_amount: number;
  cash_prize_currency: string;
  created_at: number;
}

interface TaskRow {
  id: string;
  challenge_id: string;
  task_key: string;
  title: string;
  description?: string | null;
  scoring_type: "progressive" | "completion";
  unit_size?: number | null;
  points_per_unit?: number | null;
  points_cap?: number | null;
  target_value?: number | null;
  completion_points?: number | null;
  sort_order: number;
}

interface ParticipantRow {
  id: string;
  challenge_id: string;
  user_id: string;
  joined_at: number;
  total_points: number;
  reached_total_at?: number | null;
  final_rank?: number | null;
}

interface UserBriefRow {
  id: string;
  display_name?: string | null;
  profile_picture?: string | null;
  car_brand?: string | null;
  car_model?: string | null;
}

interface TripRow {
  user_id: string;
  distance?: number | null;
  duration?: number | null;
  start_time?: number | null;
}

interface FollowRow {
  follower_id?: string;
  following_id?: string;
  created_at?: number | null;
}

interface PostRow {
  user_id: string;
  image_url?: string | null;
  created_at?: number | null;
}

function newId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function ensureDb() {
  if (!isDbConfigured()) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Database is not configured." });
  }
}

async function getJson<T>(url: string): Promise<T | null> {
  const resp = await fetch(url, { method: "GET", headers: getSupabaseHeaders() });
  if (!resp.ok) {
    console.error("[CHALLENGES] GET failed", resp.status, url);
    return null;
  }
  return (await resp.json()) as T;
}

/** The current round (active first, else the most recent non-completed one). */
async function getCurrentChallenge(): Promise<ChallengeRow | null> {
  const activeUrl = `${getSupabaseRestUrl(TABLE_CHALLENGES)}?status=eq.active&order=round_number.desc&limit=1`;
  const active = await getJson<ChallengeRow[]>(activeUrl);
  if (active && active.length > 0) return active[0];
  const pendingUrl = `${getSupabaseRestUrl(TABLE_CHALLENGES)}?status=eq.pending&order=round_number.desc&limit=1`;
  const pending = await getJson<ChallengeRow[]>(pendingUrl);
  return pending && pending.length > 0 ? pending[0] : null;
}

async function getChallengeById(id: string): Promise<ChallengeRow | null> {
  const rows = await getJson<ChallengeRow[]>(
    `${getSupabaseRestUrl(TABLE_CHALLENGES)}?id=eq.${encodeURIComponent(id)}&limit=1`,
  );
  return rows && rows.length > 0 ? rows[0] : null;
}

async function getTasks(challengeId: string): Promise<TaskRow[]> {
  const rows = await getJson<TaskRow[]>(
    `${getSupabaseRestUrl(TABLE_TASKS)}?challenge_id=eq.${encodeURIComponent(challengeId)}&order=sort_order.asc`,
  );
  return rows ?? [];
}

async function getParticipants(challengeId: string): Promise<ParticipantRow[]> {
  const rows = await getJson<ParticipantRow[]>(
    `${getSupabaseRestUrl(TABLE_PARTICIPANTS)}?challenge_id=eq.${encodeURIComponent(challengeId)}`,
  );
  return rows ?? [];
}

async function getUserBriefs(ids: string[]): Promise<Map<string, UserBriefRow>> {
  const map = new Map<string, UserBriefRow>();
  if (ids.length === 0) return map;
  const idList = ids.map((id) => `"${id}"`).join(",");
  const rows = await getJson<UserBriefRow[]>(
    `${getSupabaseRestUrl("users")}?id=in.(${idList})&select=id,display_name,profile_picture,car_brand,car_model`,
  );
  for (const r of rows ?? []) map.set(r.id, r);
  return map;
}

/**
 * Broadcast a "challenge is live" push to ALL users the moment a round
 * activates. Called only by the instance that wins the activation mutex, so the
 * notification is sent exactly once across autoscale instances / ticker / cron.
 */
async function notifyChallengeLive(challenge: ChallengeRow): Promise<void> {
  const isFirst = (challenge.round_number ?? 1) <= 1;
  const title = isFirst
    ? "🏁 The first RedLine Challenge is LIVE!"
    : "🏁 A new RedLine Challenge is LIVE!";
  const body = isFirst
    ? "The community hit the milestone — the very first challenge has begun. Open RedLine, join the round, and start earning points!"
    : "A new challenge round just dropped. Open RedLine, join, and climb the leaderboard!";
  const result = await broadcastPushToAllUsers({
    title,
    body,
    data: { type: "challenge_live", challengeId: challenge.id },
    channelId: "default",
  });
  console.log(
    `[CHALLENGES] live broadcast: ${result.sent} sent, ${result.failed} failed, ${result.totalUsers} users`,
  );
}

/** Activate a pending round once the Pro threshold is reached. */
async function maybeActivate(challenge: ChallengeRow, proCount: number): Promise<ChallengeRow> {
  if (challenge.status !== "pending") return challenge;
  if (proCount < challenge.required_pro_count) return challenge;
  const now = Date.now();
  const update = { status: "active", start_time: now, end_time: now + TWO_WEEKS_MS };
  // Conditional PATCH on status=eq.pending is a mutex: across concurrent
  // autoscale instances / the ticker / cron, only ONE caller flips pending→active
  // and gets a non-empty representation back (getSupabaseHeaders already sends
  // Prefer: return=representation). The winner — and only the winner —
  // broadcasts the "challenge is live" push, so users are notified exactly once.
  const resp = await fetch(
    `${getSupabaseRestUrl(TABLE_CHALLENGES)}?id=eq.${encodeURIComponent(challenge.id)}&status=eq.pending`,
    { method: "PATCH", headers: getSupabaseHeaders(), body: JSON.stringify(update) },
  );
  if (!resp.ok) {
    console.error("[CHALLENGES] activation failed", resp.status);
    return challenge;
  }
  const rows = (await resp.json().catch(() => [])) as ChallengeRow[];
  if (!Array.isArray(rows) || rows.length === 0) {
    // Lost the activation race to another instance; it owns the broadcast.
    console.log("[CHALLENGES] activation race lost (already active)", challenge.id);
    return { ...challenge, ...update, status: "active" };
  }
  console.log("[CHALLENGES] Round activated", challenge.id);
  // Await the broadcast inside the winning request so the send completes before
  // we return (more reliable than fire-and-forget), but swallow errors so a push
  // failure never breaks getActiveChallenge. Activation is a one-time event per
  // round, so the extra latency on this single request is an acceptable tradeoff.
  try {
    await notifyChallengeLive(challenge);
  } catch (e) {
    console.error("[CHALLENGES] live broadcast failed", e);
  }
  return { ...challenge, ...update, status: "active" };
}

/**
 * Maximum points a single participant can possibly earn this round — the sum of
 * every task's ceiling (progressive tasks cap at `points_cap`, completion tasks
 * award `completion_points`). Used to end a round early the moment someone hits
 * the perfect score.
 *
 * Must stay in lockstep with scoreUser(), which treats a progressive task with
 * no positive `points_cap` as UNBOUNDED (`Number.MAX_SAFE_INTEGER`). If any
 * progressive task is uncapped, a perfect score is unreachable, so we return
 * `Infinity` to disable the max-points end condition (the 2-week timer still
 * applies). Returns 0 only when there are no scorable points at all.
 */
function maxPointsForTasks(tasks: TaskRow[]): number {
  let max = 0;
  for (const t of tasks) {
    if (t.scoring_type === "progressive") {
      const cap = t.points_cap ?? 0;
      if (cap <= 0) return Infinity; // uncapped → no perfect score possible
      max += cap;
    } else {
      max += t.completion_points ?? 0;
    }
  }
  return max;
}

type TaskBreakdown = {
  taskKey: string;
  title: string;
  description: string;
  scoringType: "progressive" | "completion";
  progress: number;
  target: number;
  points: number;
  completed: boolean;
};

/** Compute one user's per-task breakdown + total from raw activity within the window. */
function scoreUser(
  tasks: TaskRow[],
  data: {
    distanceKm: number;
    durationSec: number;
    activeDays: number;
    followersGained: number;
    followsMade: number;
    carPosts: number;
  },
): { total: number; breakdown: TaskBreakdown[] } {
  const breakdown: TaskBreakdown[] = [];
  let total = 0;
  for (const t of tasks) {
    let progress = 0;
    let target = 0;
    let points = 0;
    let completed = false;
    if (t.scoring_type === "progressive") {
      const unit = t.unit_size && t.unit_size > 0 ? t.unit_size : 1;
      const perUnit = t.points_per_unit ?? 0;
      const cap = t.points_cap ?? Number.MAX_SAFE_INTEGER;
      let raw = 0;
      if (t.task_key === "distance") raw = data.distanceKm;
      else if (t.task_key === "seat_time") raw = data.durationSec;
      progress = raw;
      target = unit * (cap / Math.max(perUnit, 1)); // value needed to hit the cap
      points = Math.min(cap, Math.floor(raw / unit) * perUnit);
      completed = points >= cap;
    } else {
      const tgt = t.target_value ?? 0;
      const cp = t.completion_points ?? 0;
      target = tgt;
      if (t.task_key === "daily_driver") progress = data.activeDays;
      else if (t.task_key === "crew_up") progress = data.followersGained;
      else if (t.task_key === "squad_builder") progress = data.followsMade;
      else if (t.task_key === "show_your_ride") progress = data.carPosts;
      completed = progress >= tgt;
      points = completed ? cp : 0;
    }
    total += points;
    breakdown.push({
      taskKey: t.task_key,
      title: t.title,
      description: t.description ?? "",
      scoringType: t.scoring_type,
      progress,
      target,
      points,
      completed,
    });
  }
  return { total, breakdown };
}

function utcDayKey(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`;
}

/** Raw activity aggregates for one user inside the window. */
async function fetchUserActivity(
  userId: string,
  start: number,
  end: number,
): Promise<{
  distanceKm: number;
  durationSec: number;
  activeDays: number;
  followersGained: number;
  followsMade: number;
  carPosts: number;
}> {
  const enc = encodeURIComponent(userId);
  const trips = (await getJson<TripRow[]>(
    `${getSupabaseRestUrl("trips")}?user_id=eq.${enc}&start_time=gte.${start}&start_time=lte.${end}&select=distance,duration,start_time`,
  )) ?? [];
  const followers = (await getJson<FollowRow[]>(
    `${getSupabaseRestUrl("follows")}?following_id=eq.${enc}&created_at=gte.${start}&created_at=lte.${end}&select=created_at`,
  )) ?? [];
  const following = (await getJson<FollowRow[]>(
    `${getSupabaseRestUrl("follows")}?follower_id=eq.${enc}&created_at=gte.${start}&created_at=lte.${end}&select=created_at`,
  )) ?? [];
  const posts = (await getJson<PostRow[]>(
    `${getSupabaseRestUrl("posts")}?user_id=eq.${enc}&created_at=gte.${start}&created_at=lte.${end}&select=image_url,created_at`,
  )) ?? [];

  let distanceKm = 0;
  let durationSec = 0;
  const days = new Set<string>();
  for (const t of trips) {
    distanceKm += t.distance ?? 0;
    durationSec += t.duration ?? 0;
    if (t.start_time) days.add(utcDayKey(t.start_time));
  }
  const carPosts = posts.filter((p) => !!p.image_url).length;
  return {
    distanceKm,
    durationSec,
    activeDays: days.size,
    followersGained: followers.length,
    followsMade: following.length,
    carPosts,
  };
}

type LeaderboardEntry = {
  userId: string;
  displayName: string;
  profilePicture: string | null;
  carBrand: string | null;
  carModel: string | null;
  totalPoints: number;
  reachedTotalAt: number | null;
  rank: number;
};

/** Recompute every participant's score, persist changes, return ranked leaderboard. Cached. */
async function computeLeaderboard(challenge: ChallengeRow): Promise<LeaderboardEntry[]> {
  return cachedOrFetch(`challenge_lb_${challenge.id}`, SCORE_CACHE_TTL_MS, async () => {
    const tasks = await getTasks(challenge.id);
    const participants = await getParticipants(challenge.id);
    if (participants.length === 0) return [];
    const start = challenge.start_time ?? 0;
    const end = challenge.end_time ?? Date.now();

    const scored = await Promise.all(
      participants.map(async (p) => {
        const activity = await fetchUserActivity(p.user_id, start, end);
        const { total } = scoreUser(tasks, activity);
        return { p, total };
      }),
    );

    const now = Date.now();
    // Tiebreaker = who reached their (final) total first. Only stamp
    // `reached_total_at` when the total INCREASES — preserve the earlier
    // timestamp when it's unchanged, and don't let a transient dip (e.g. a
    // deleted trip) reset a user's "reached first" standing.
    const reachedFor = (p: ParticipantRow, total: number): number =>
      total > p.total_points ? now : p.reached_total_at ?? p.joined_at ?? now;

    // Persist changed totals + tiebreaker timestamp.
    await Promise.all(
      scored
        .filter(({ p, total }) => total !== p.total_points)
        .map(({ p, total }) =>
          fetch(`${getSupabaseRestUrl(TABLE_PARTICIPANTS)}?id=eq.${encodeURIComponent(p.id)}`, {
            method: "PATCH",
            headers: getSupabaseHeaders(),
            body: JSON.stringify({ total_points: total, reached_total_at: reachedFor(p, total) }),
          }).catch((err) => console.error("[CHALLENGES] persist score failed", err)),
        ),
    );

    const briefs = await getUserBriefs(participants.map((p) => p.user_id));
    const entries = scored.map(({ p, total }) => {
      const reachedTotalAt = reachedFor(p, total);
      const u = briefs.get(p.user_id);
      return {
        userId: p.user_id,
        displayName: u?.display_name ?? "Driver",
        profilePicture: u?.profile_picture ?? null,
        carBrand: u?.car_brand ?? null,
        carModel: u?.car_model ?? null,
        totalPoints: total,
        reachedTotalAt,
        rank: 0,
      } as LeaderboardEntry;
    });

    entries.sort((a, b) => {
      if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
      return (a.reachedTotalAt ?? 0) - (b.reachedTotalAt ?? 0); // earliest to the total wins
    });
    entries.forEach((e, i) => (e.rank = i + 1));
    return entries;
  });
}

async function grantPromoEntitlement(userId: string, duration: "yearly" | "three_month"): Promise<void> {
  const key = process.env.REVENUECAT_SECRET_API_KEY;
  if (!key) {
    console.warn("[CHALLENGES] REVENUECAT_SECRET_API_KEY not set; skipping promo grant", { userId, duration });
    return;
  }
  try {
    const url = `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(userId)}/entitlements/${encodeURIComponent(REVENUECAT_ENTITLEMENT_ID)}/promotional`;
    const resp = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ duration }),
    });
    if (!resp.ok) {
      console.error("[CHALLENGES] promo grant failed", userId, resp.status, await resp.text());
    } else {
      console.log("[CHALLENGES] granted promo entitlement", { userId, duration });
    }
  } catch (err) {
    console.error("[CHALLENGES] promo grant error", err);
  }
}

/** Finalize an ended round: crown top 3, grant rewards, mark completed. Idempotent. */
async function finalizeChallenge(challenge: ChallengeRow): Promise<void> {
  // Atomically claim finalization by flipping status active -> completed, but
  // ONLY if it's still active. Supabase returns the updated rows with
  // `Prefer: return=representation`; an empty array means another concurrent
  // caller (or cron tick) already claimed it, so we bail. This is our mutex:
  // it guarantees the winner-write + promo-grant path below runs exactly once,
  // preventing duplicate reward grants.
  const claimResp = await fetch(
    `${getSupabaseRestUrl(TABLE_CHALLENGES)}?id=eq.${encodeURIComponent(challenge.id)}&status=eq.active`,
    {
      method: "PATCH",
      headers: { ...getSupabaseHeaders(), Prefer: "return=representation" },
      body: JSON.stringify({ status: "completed" }),
    },
  );
  if (!claimResp.ok) {
    console.error("[CHALLENGES] finalize claim failed", challenge.id, claimResp.status);
    return;
  }
  const claimed = (await claimResp.json().catch(() => [])) as unknown[];
  if (!Array.isArray(claimed) || claimed.length === 0) {
    // Lost the race / already completed — winners are (being) written elsewhere.
    return;
  }

  const leaderboard = await computeLeaderboard(challenge);
  const top3 = leaderboard.filter((e) => e.totalPoints > 0).slice(0, 3);
  const rewardByPlace: Record<number, string> = { 1: "cash", 2: "yearly_sub", 3: "quarterly_sub" };
  const now = Date.now();

  for (const entry of top3) {
    const place = entry.rank;
    const reward = rewardByPlace[place];
    if (!reward) continue;
    await fetch(getSupabaseRestUrl(TABLE_WINNERS), {
      method: "POST",
      headers: { ...getSupabaseHeaders(), Prefer: "resolution=ignore-duplicates" },
      body: JSON.stringify({
        id: newId("winner"),
        challenge_id: challenge.id,
        user_id: entry.userId,
        place,
        points: entry.totalPoints,
        reward_type: reward,
        reward_status: "pending",
        awarded_at: now,
      }),
    }).catch((err) => console.error("[CHALLENGES] winner insert failed", err));

    if (place === 2) await grantPromoEntitlement(entry.userId, "yearly");
    if (place === 3) await grantPromoEntitlement(entry.userId, "three_month");
  }

  // Status was already flipped to "completed" by the atomic claim above.
  console.log("[CHALLENGES] Round finalized", challenge.id, "winners:", top3.length);
}

function serializeChallenge(c: ChallengeRow) {
  return {
    id: c.id,
    roundNumber: c.round_number,
    title: c.title,
    description: c.description ?? "",
    status: c.status,
    requiredProCount: c.required_pro_count,
    startTime: c.start_time ?? null,
    endTime: c.end_time ?? null,
    cashPrizeAmount: Number(c.cash_prize_amount ?? 0),
    cashPrizeCurrency: c.cash_prize_currency ?? "USD",
  };
}

function serializeTasks(tasks: TaskRow[]) {
  return tasks.map((t) => ({
    taskKey: t.task_key,
    title: t.title,
    description: t.description ?? "",
    scoringType: t.scoring_type,
    unitSize: t.unit_size ?? null,
    pointsPerUnit: t.points_per_unit ?? null,
    pointsCap: t.points_cap ?? null,
    targetValue: t.target_value ?? null,
    completionPoints: t.completion_points ?? null,
  }));
}

export const challengesRouter = createTRPCRouter({
  // Current round + tasks + Pro progress + live leaderboard + caller's state.
  getActiveChallenge: publicProcedure
    .input(z.object({ userId: z.string().optional() }))
    .query(async ({ input }) => {
      ensureDb();
      let challenge = await getCurrentChallenge();
      const proCount = await getActiveProCount();
      if (!challenge) {
        return { challenge: null, proCount, tasks: [], leaderboard: [], me: null };
      }

      // Lifecycle transitions.
      challenge = await maybeActivate(challenge, proCount);

      const tasks = await getTasks(challenge.id);

      let leaderboard: LeaderboardEntry[] = [];
      if (challenge.status === "active") {
        leaderboard = await computeLeaderboard(challenge);
        // End conditions (whichever comes first):
        //   (a) someone has earned every available point (perfect score), or
        //   (b) the 2-week window has elapsed.
        // Either one finalizes the round (crown winners + grant rewards).
        const maxPoints = maxPointsForTasks(tasks);
        const someoneMaxed =
          maxPoints > 0 && leaderboard.some((e) => e.totalPoints >= maxPoints);
        const windowElapsed = !!challenge.end_time && Date.now() > challenge.end_time;
        if (someoneMaxed || windowElapsed) {
          await finalizeChallenge(challenge);
          challenge = (await getChallengeById(challenge.id)) ?? challenge;
        }
      }

      let me: {
        isPro: boolean;
        joined: boolean;
        rank: number | null;
        totalPoints: number;
      } | null = null;
      if (input.userId) {
        const pro = await isUserPro(input.userId);
        const myEntry = leaderboard.find((e) => e.userId === input.userId);
        let joined = !!myEntry;
        if (!joined) {
          const rows = await getJson<{ id: string }[]>(
            `${getSupabaseRestUrl(TABLE_PARTICIPANTS)}?challenge_id=eq.${encodeURIComponent(challenge.id)}&user_id=eq.${encodeURIComponent(input.userId)}&limit=1`,
          );
          joined = !!(rows && rows.length > 0);
        }
        me = {
          isPro: pro,
          joined,
          rank: myEntry?.rank ?? null,
          totalPoints: myEntry?.totalPoints ?? 0,
        };
      }

      return {
        challenge: serializeChallenge(challenge),
        proCount,
        tasks: serializeTasks(tasks),
        leaderboard: leaderboard.slice(0, 50),
        me,
      };
    }),

  // Pro users join the active round.
  join: publicProcedure
    .input(z.object({ userId: z.string().min(1) }))
    .mutation(async ({ input }) => {
      ensureDb();
      const challenge = await getCurrentChallenge();
      if (!challenge || challenge.status !== "active") {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "No active challenge to join." });
      }
      const pro = await isUserPro(input.userId);
      if (!pro) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Challenges are for Pro members only." });
      }
      const existing = await getJson<{ id: string }[]>(
        `${getSupabaseRestUrl(TABLE_PARTICIPANTS)}?challenge_id=eq.${encodeURIComponent(challenge.id)}&user_id=eq.${encodeURIComponent(input.userId)}&limit=1`,
      );
      if (existing && existing.length > 0) {
        return { success: true, alreadyJoined: true };
      }
      const resp = await fetch(getSupabaseRestUrl(TABLE_PARTICIPANTS), {
        method: "POST",
        headers: { ...getSupabaseHeaders(), Prefer: "resolution=ignore-duplicates" },
        body: JSON.stringify({
          id: newId("part"),
          challenge_id: challenge.id,
          user_id: input.userId,
          joined_at: Date.now(),
          total_points: 0,
        }),
      });
      if (!resp.ok) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to join challenge." });
      }
      return { success: true, alreadyJoined: false };
    }),

  getLeaderboard: publicProcedure
    .input(z.object({ challengeId: z.string().min(1) }))
    .query(async ({ input }) => {
      ensureDb();
      const challenge = await getChallengeById(input.challengeId);
      if (!challenge) return { leaderboard: [] };
      const leaderboard = await computeLeaderboard(challenge);
      return { leaderboard };
    }),

  // Caller's transparent per-task breakdown.
  getMyProgress: publicProcedure
    .input(z.object({ challengeId: z.string().min(1), userId: z.string().min(1) }))
    .query(async ({ input }) => {
      ensureDb();
      const challenge = await getChallengeById(input.challengeId);
      if (!challenge) return { total: 0, breakdown: [] };
      const tasks = await getTasks(challenge.id);
      const start = challenge.start_time ?? 0;
      const end = challenge.end_time ?? Date.now();
      const activity = await fetchUserActivity(input.userId, start, end);
      const { total, breakdown } = scoreUser(tasks, activity);
      return { total, breakdown };
    }),

  // Past winners (Hall of Fame).
  getHallOfFame: publicProcedure.query(async () => {
    ensureDb();
    const winners = (await getJson<
      {
        challenge_id: string;
        user_id: string;
        place: number;
        points: number;
        reward_type: string;
        awarded_at: number;
      }[]
    >(`${getSupabaseRestUrl(TABLE_WINNERS)}?order=awarded_at.desc,place.asc`)) ?? [];

    if (winners.length === 0) return { entries: [] };

    const challengeIds = Array.from(new Set(winners.map((w) => w.challenge_id)));
    const cList = challengeIds.map((id) => `"${id}"`).join(",");
    const challenges =
      (await getJson<ChallengeRow[]>(
        `${getSupabaseRestUrl(TABLE_CHALLENGES)}?id=in.(${cList})&select=id,round_number,title`,
      )) ?? [];
    const cMap = new Map(challenges.map((c) => [c.id, c]));
    const briefs = await getUserBriefs(winners.map((w) => w.user_id));

    return {
      entries: winners.map((w) => {
        const c = cMap.get(w.challenge_id);
        const u = briefs.get(w.user_id);
        return {
          challengeId: w.challenge_id,
          roundNumber: c?.round_number ?? 0,
          challengeTitle: c?.title ?? "Challenge",
          userId: w.user_id,
          displayName: u?.display_name ?? "Driver",
          profilePicture: u?.profile_picture ?? null,
          carBrand: u?.car_brand ?? null,
          carModel: u?.car_model ?? null,
          place: w.place,
          points: w.points,
          rewardType: w.reward_type,
          awardedAt: w.awarded_at,
        };
      }),
    };
  }),
});
