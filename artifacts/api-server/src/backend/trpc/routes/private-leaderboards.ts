import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, publicProcedure } from "../create-context";
import { isDbConfigured, getSupabaseHeaders, getSupabaseRestUrl } from "../db";

const CategoryEnum = z.enum([
  "topSpeed",
  "distance",
  "duration",
  "avgSpeed",
  "acceleration",
  "maxGForce",
]);
type Category = z.infer<typeof CategoryEnum>;

interface PrivateLeaderboardRow {
  id: string;
  name: string;
  owner_id: string;
  category: string;
  created_at: number;
}

interface PrivateLeaderboardMemberRow {
  id: string;
  leaderboard_id: string;
  user_id: string;
  joined_at: number;
}

interface UserBriefRow {
  id: string;
  display_name?: string;
  car_brand?: string;
  car_model?: string;
}

interface TripStatRow {
  user_id: string;
  top_speed?: number | null;
  distance?: number | null;
  duration?: number | null;
  avg_speed?: number | null;
  acceleration?: number | null;
  max_g_force?: number | null;
}

const TABLE_BOARDS = "private_leaderboards";
const TABLE_MEMBERS = "private_leaderboard_members";
const TABLE_CHALLENGES = "private_leaderboard_challenges";

interface ChallengeRow {
  id: string;
  leaderboard_id: string;
  name: string;
  metric: string;
  target_value: number;
  end_at: number;
  created_at: number;
}

async function getChallengeRow(leaderboardId: string): Promise<ChallengeRow | null> {
  const url = `${getSupabaseRestUrl(TABLE_CHALLENGES)}?leaderboard_id=eq.${encodeURIComponent(leaderboardId)}&limit=1`;
  const resp = await fetch(url, { method: "GET", headers: getSupabaseHeaders() });
  if (!resp.ok) return null;
  const rows = (await resp.json()) as ChallengeRow[];
  return rows[0] ?? null;
}

async function sendInvitePush(opts: {
  toUserId: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
}): Promise<void> {
  try {
    const resp = await fetch(
      `${getSupabaseRestUrl("users")}?id=eq.${encodeURIComponent(opts.toUserId)}&select=push_token&limit=1`,
      { method: "GET", headers: getSupabaseHeaders() },
    );
    if (!resp.ok) return;
    const rows = (await resp.json()) as { push_token?: string | null }[];
    const pushToken = rows[0]?.push_token;
    if (!pushToken) return;
    await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Accept-Encoding": "gzip, deflate",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        to: pushToken,
        title: opts.title,
        body: opts.body,
        sound: "default",
        priority: "high",
        channelId: "default",
        data: opts.data,
      }),
    });
  } catch (err) {
    console.error("[PUSH] Failed to send private board push:", err);
  }
}

function newId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function ensureDb() {
  if (!isDbConfigured()) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Database is not configured.",
    });
  }
}

async function getBoard(id: string): Promise<PrivateLeaderboardRow | null> {
  const url = `${getSupabaseRestUrl(TABLE_BOARDS)}?id=eq.${encodeURIComponent(id)}&limit=1`;
  const resp = await fetch(url, { method: "GET", headers: getSupabaseHeaders() });
  if (!resp.ok) return null;
  const rows = (await resp.json()) as PrivateLeaderboardRow[];
  return rows[0] ?? null;
}

async function getMembers(leaderboardId: string): Promise<PrivateLeaderboardMemberRow[]> {
  const url = `${getSupabaseRestUrl(TABLE_MEMBERS)}?leaderboard_id=eq.${encodeURIComponent(leaderboardId)}&select=id,leaderboard_id,user_id,joined_at`;
  const resp = await fetch(url, { method: "GET", headers: getSupabaseHeaders() });
  if (!resp.ok) return [];
  return (await resp.json()) as PrivateLeaderboardMemberRow[];
}

function categoryToTripsParams(category: Category): { selectExtra: string; orderBy: string } {
  switch (category) {
    case "topSpeed":
      return { selectExtra: "top_speed", orderBy: "top_speed.desc.nullslast" };
    case "distance":
      return { selectExtra: "distance", orderBy: "distance.desc.nullslast" };
    case "duration":
      return { selectExtra: "duration", orderBy: "duration.desc.nullslast" };
    case "avgSpeed":
      return { selectExtra: "avg_speed", orderBy: "avg_speed.desc.nullslast" };
    case "acceleration":
      return { selectExtra: "acceleration", orderBy: "acceleration.desc.nullslast" };
    case "maxGForce":
      return { selectExtra: "max_g_force", orderBy: "max_g_force.desc.nullslast" };
  }
}

function pickStat(row: TripStatRow, category: Category): number {
  switch (category) {
    case "topSpeed":
      return row.top_speed ?? 0;
    case "distance":
      return row.distance ?? 0;
    case "duration":
      return row.duration ?? 0;
    case "avgSpeed":
      return row.avg_speed ?? 0;
    case "acceleration":
      return row.acceleration ?? 0;
    case "maxGForce":
      return row.max_g_force ?? 0;
  }
}

async function fetchUsersBrief(userIds: string[]): Promise<UserBriefRow[]> {
  if (userIds.length === 0) return [];
  const idList = userIds.map(encodeURIComponent).join(",");
  const url = `${getSupabaseRestUrl("users")}?id=in.(${idList})&select=id,display_name,car_brand,car_model`;
  const resp = await fetch(url, { method: "GET", headers: getSupabaseHeaders() });
  if (!resp.ok) return [];
  return (await resp.json()) as UserBriefRow[];
}

async function fetchBestStatPerMember(
  userIds: string[],
  category: Category,
): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  if (userIds.length === 0) return result;
  const { selectExtra, orderBy } = categoryToTripsParams(category);
  const idList = userIds.map(encodeURIComponent).join(",");
  const select = `select=user_id,${selectExtra}`;
  const url = `${getSupabaseRestUrl("trips")}?user_id=in.(${idList})&${select}&order=${orderBy}&limit=1000`;
  const resp = await fetch(url, { method: "GET", headers: getSupabaseHeaders() });
  if (!resp.ok) return result;
  const rows = (await resp.json()) as TripStatRow[];
  for (const row of rows) {
    if (!row.user_id) continue;
    const value = pickStat(row, category);
    const prev = result.get(row.user_id) ?? 0;
    if (value > prev) result.set(row.user_id, value);
  }
  return result;
}

export const privateLeaderboardsRouter = createTRPCRouter({
  create: publicProcedure
    .input(
      z.object({
        ownerId: z.string().min(1),
        name: z.string().min(1).max(60),
        category: CategoryEnum,
      }),
    )
    .mutation(async ({ input }) => {
      ensureDb();

      const id = newId("plb");
      const now = Date.now();
      const boardRow: PrivateLeaderboardRow = {
        id,
        name: input.name.trim(),
        owner_id: input.ownerId,
        category: input.category,
        created_at: now,
      };

      const insertResp = await fetch(getSupabaseRestUrl(TABLE_BOARDS), {
        method: "POST",
        headers: getSupabaseHeaders(),
        body: JSON.stringify(boardRow),
      });

      if (!insertResp.ok) {
        const text = await insertResp.text();
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to create board: ${text}`,
        });
      }

      const memberRow: PrivateLeaderboardMemberRow = {
        id: newId("plm"),
        leaderboard_id: id,
        user_id: input.ownerId,
        joined_at: now,
      };
      const memberInsertResp = await fetch(getSupabaseRestUrl(TABLE_MEMBERS), {
        method: "POST",
        headers: getSupabaseHeaders(),
        body: JSON.stringify(memberRow),
      });

      if (!memberInsertResp.ok) {
        await fetch(`${getSupabaseRestUrl(TABLE_BOARDS)}?id=eq.${encodeURIComponent(id)}`, {
          method: "DELETE",
          headers: getSupabaseHeaders(),
        });
        const text = await memberInsertResp.text();
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to add owner as member: ${text}`,
        });
      }

      return { id, name: boardRow.name, category: boardRow.category, createdAt: now };
    }),

  listMine: publicProcedure
    .input(z.object({ userId: z.string().min(1) }))
    .query(async ({ input }) => {
      if (!isDbConfigured()) return { boards: [] };

      const memberUrl = `${getSupabaseRestUrl(TABLE_MEMBERS)}?user_id=eq.${encodeURIComponent(input.userId)}&select=leaderboard_id`;
      const memberResp = await fetch(memberUrl, { method: "GET", headers: getSupabaseHeaders() });
      if (!memberResp.ok) return { boards: [] };
      const memberRows = (await memberResp.json()) as Pick<PrivateLeaderboardMemberRow, "leaderboard_id">[];
      const ids = memberRows.map((r) => r.leaderboard_id);
      if (ids.length === 0) return { boards: [] };

      const idList = ids.map(encodeURIComponent).join(",");
      const boardsUrl = `${getSupabaseRestUrl(TABLE_BOARDS)}?id=in.(${idList})&order=created_at.desc`;
      const boardsResp = await fetch(boardsUrl, { method: "GET", headers: getSupabaseHeaders() });
      if (!boardsResp.ok) return { boards: [] };
      const boards = (await boardsResp.json()) as PrivateLeaderboardRow[];

      return {
        boards: boards.map((b) => ({
          id: b.id,
          name: b.name,
          category: b.category,
          ownerId: b.owner_id,
          isOwner: b.owner_id === input.userId,
          createdAt: b.created_at,
        })),
      };
    }),

  getDetails: publicProcedure
    .input(z.object({ leaderboardId: z.string().min(1), userId: z.string().min(1) }))
    .query(async ({ input }) => {
      ensureDb();

      const board = await getBoard(input.leaderboardId);
      if (!board) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Board not found." });
      }

      const memberRows = await getMembers(board.id);
      const memberIds = memberRows.map((m) => m.user_id);

      if (!memberIds.includes(input.userId)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You are not a member of this board.",
        });
      }
      const [users, bestByUser, challengeRow] = await Promise.all([
        fetchUsersBrief(memberIds),
        fetchBestStatPerMember(memberIds, board.category as Category),
        getChallengeRow(board.id),
      ]);

      const userById = new Map(users.map((u) => [u.id, u] as const));
      const ranked = memberIds
        .map((uid) => {
          const u = userById.get(uid);
          return {
            userId: uid,
            displayName: u?.display_name ?? "Unknown",
            carBrand: u?.car_brand,
            carModel: u?.car_model,
            value: bestByUser.get(uid) ?? 0,
          };
        })
        .sort((a, b) => b.value - a.value)
        .map((entry, idx) => ({ ...entry, rank: idx + 1 }));

      let challenge: {
        id: string;
        name: string;
        metric: string;
        targetValue: number;
        endAt: number;
        completedUserIds: string[];
      } | null = null;
      if (challengeRow) {
        const challengeBest =
          challengeRow.metric === board.category
            ? bestByUser
            : await fetchBestStatPerMember(memberIds, challengeRow.metric as Category);
        const completedUserIds: string[] = [];
        for (const uid of memberIds) {
          if ((challengeBest.get(uid) ?? 0) >= challengeRow.target_value) {
            completedUserIds.push(uid);
          }
        }
        challenge = {
          id: challengeRow.id,
          name: challengeRow.name,
          metric: challengeRow.metric,
          targetValue: challengeRow.target_value,
          endAt: challengeRow.end_at,
          completedUserIds,
        };
      }

      return {
        board: {
          id: board.id,
          name: board.name,
          category: board.category,
          ownerId: board.owner_id,
          createdAt: board.created_at,
        },
        members: ranked,
        challenge,
      };
    }),

  inviteByUsername: publicProcedure
    .input(
      z.object({
        leaderboardId: z.string().min(1),
        ownerId: z.string().min(1),
        displayName: z.string().min(1),
      }),
    )
    .mutation(async ({ input }) => {
      ensureDb();

      const board = await getBoard(input.leaderboardId);
      if (!board) throw new TRPCError({ code: "NOT_FOUND", message: "Board not found." });
      if (board.owner_id !== input.ownerId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only the board owner can invite members." });
      }

      const lookupUrl = `${getSupabaseRestUrl("users")}?display_name=eq.${encodeURIComponent(input.displayName.trim())}&select=id,display_name&limit=1`;
      const lookupResp = await fetch(lookupUrl, { method: "GET", headers: getSupabaseHeaders() });
      if (!lookupResp.ok) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "User lookup failed." });
      }
      const found = (await lookupResp.json()) as UserBriefRow[];
      const target = found[0];
      if (!target) {
        throw new TRPCError({ code: "NOT_FOUND", message: `No user named "${input.displayName}".` });
      }

      const existingUrl = `${getSupabaseRestUrl(TABLE_MEMBERS)}?leaderboard_id=eq.${encodeURIComponent(board.id)}&user_id=eq.${encodeURIComponent(target.id)}&limit=1`;
      const existingResp = await fetch(existingUrl, { method: "GET", headers: getSupabaseHeaders() });
      if (existingResp.ok) {
        const rows = (await existingResp.json()) as PrivateLeaderboardMemberRow[];
        if (rows.length > 0) {
          return { added: false, userId: target.id, displayName: target.display_name ?? input.displayName };
        }
      }

      const memberRow: PrivateLeaderboardMemberRow = {
        id: newId("plm"),
        leaderboard_id: board.id,
        user_id: target.id,
        joined_at: Date.now(),
      };
      const insertResp = await fetch(getSupabaseRestUrl(TABLE_MEMBERS), {
        method: "POST",
        headers: getSupabaseHeaders(),
        body: JSON.stringify(memberRow),
      });
      if (!insertResp.ok) {
        const text = await insertResp.text();
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `Failed to add member: ${text}` });
      }

      void (async () => {
        try {
          const ownerResp = await fetch(
            `${getSupabaseRestUrl("users")}?id=eq.${encodeURIComponent(input.ownerId)}&select=display_name&limit=1`,
            { method: "GET", headers: getSupabaseHeaders() },
          );
          let inviterName = "Someone";
          if (ownerResp.ok) {
            const ownerRows = (await ownerResp.json()) as { display_name?: string | null }[];
            if (ownerRows[0]?.display_name) inviterName = ownerRows[0].display_name;
          }
          await sendInvitePush({
            toUserId: target.id,
            title: "👥 Friends Board Invite",
            body: `${inviterName} added you to "${board.name}"`,
            data: {
              type: "private_board_invite",
              leaderboardId: board.id,
              boardName: board.name,
              inviterName,
            },
          });
        } catch (err) {
          console.error("[PUSH] Failed to send private board invite notification:", err);
        }
      })();

      return { added: true, userId: target.id, displayName: target.display_name ?? input.displayName };
    }),

  leave: publicProcedure
    .input(z.object({ leaderboardId: z.string().min(1), userId: z.string().min(1) }))
    .mutation(async ({ input }) => {
      ensureDb();

      const board = await getBoard(input.leaderboardId);
      if (!board) throw new TRPCError({ code: "NOT_FOUND", message: "Board not found." });
      if (board.owner_id === input.userId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Owner cannot leave their own board. Delete it instead.",
        });
      }

      const url = `${getSupabaseRestUrl(TABLE_MEMBERS)}?leaderboard_id=eq.${encodeURIComponent(input.leaderboardId)}&user_id=eq.${encodeURIComponent(input.userId)}`;
      const resp = await fetch(url, { method: "DELETE", headers: getSupabaseHeaders() });
      if (!resp.ok) {
        const text = await resp.text();
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to leave board: ${text}`,
        });
      }

      void (async () => {
        try {
          const leaverResp = await fetch(
            `${getSupabaseRestUrl("users")}?id=eq.${encodeURIComponent(input.userId)}&select=display_name&limit=1`,
            { method: "GET", headers: getSupabaseHeaders() },
          );
          let leaverName = "A member";
          if (leaverResp.ok) {
            const rows = (await leaverResp.json()) as { display_name?: string | null }[];
            if (rows[0]?.display_name) leaverName = rows[0].display_name;
          }
          await sendInvitePush({
            toUserId: board.owner_id,
            title: "👋 Friends Board update",
            body: `${leaverName} left "${board.name}"`,
            data: {
              type: "private_board_leave",
              leaderboardId: board.id,
              boardName: board.name,
              leaverName,
            },
          });
        } catch (err) {
          console.error("[PUSH] Failed to send leave notification:", err);
        }
      })();

      return { success: true };
    }),

  setChallenge: publicProcedure
    .input(
      z.object({
        leaderboardId: z.string().min(1),
        ownerId: z.string().min(1),
        name: z.string().min(1).max(60),
        metric: CategoryEnum,
        targetValue: z.number().positive(),
        durationDays: z.number().int().min(1).max(90),
      }),
    )
    .mutation(async ({ input }) => {
      ensureDb();
      const board = await getBoard(input.leaderboardId);
      if (!board) throw new TRPCError({ code: "NOT_FOUND", message: "Board not found." });
      if (board.owner_id !== input.ownerId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only the owner can set a challenge." });
      }

      const now = Date.now();
      const endAt = now + input.durationDays * 24 * 60 * 60 * 1000;

      await fetch(
        `${getSupabaseRestUrl(TABLE_CHALLENGES)}?leaderboard_id=eq.${encodeURIComponent(board.id)}`,
        { method: "DELETE", headers: getSupabaseHeaders() },
      );

      const row: ChallengeRow = {
        id: newId("plc"),
        leaderboard_id: board.id,
        name: input.name.trim(),
        metric: input.metric,
        target_value: input.targetValue,
        end_at: endAt,
        created_at: now,
      };
      const insertResp = await fetch(getSupabaseRestUrl(TABLE_CHALLENGES), {
        method: "POST",
        headers: getSupabaseHeaders(),
        body: JSON.stringify(row),
      });
      if (!insertResp.ok) {
        const text = await insertResp.text();
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `Failed to set challenge: ${text}` });
      }

      void (async () => {
        try {
          const memberRows = await getMembers(board.id);
          for (const m of memberRows) {
            if (m.user_id === input.ownerId) continue;
            await sendInvitePush({
              toUserId: m.user_id,
              title: "🏁 New Challenge",
              body: `"${row.name}" started in "${board.name}"`,
              data: {
                type: "private_board_challenge",
                leaderboardId: board.id,
                boardName: board.name,
                challengeName: row.name,
              },
            });
          }
        } catch (err) {
          console.error("[PUSH] Failed to broadcast challenge:", err);
        }
      })();

      return { success: true, challengeId: row.id, endAt };
    }),

  clearChallenge: publicProcedure
    .input(z.object({ leaderboardId: z.string().min(1), ownerId: z.string().min(1) }))
    .mutation(async ({ input }) => {
      ensureDb();
      const board = await getBoard(input.leaderboardId);
      if (!board) throw new TRPCError({ code: "NOT_FOUND", message: "Board not found." });
      if (board.owner_id !== input.ownerId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only the owner can clear the challenge." });
      }
      await fetch(
        `${getSupabaseRestUrl(TABLE_CHALLENGES)}?leaderboard_id=eq.${encodeURIComponent(board.id)}`,
        { method: "DELETE", headers: getSupabaseHeaders() },
      );
      return { success: true };
    }),

  delete: publicProcedure
    .input(z.object({ leaderboardId: z.string().min(1), ownerId: z.string().min(1) }))
    .mutation(async ({ input }) => {
      ensureDb();

      const board = await getBoard(input.leaderboardId);
      if (!board) throw new TRPCError({ code: "NOT_FOUND", message: "Board not found." });
      if (board.owner_id !== input.ownerId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only the owner can delete this board." });
      }

      const membersResp = await fetch(
        `${getSupabaseRestUrl(TABLE_MEMBERS)}?leaderboard_id=eq.${encodeURIComponent(input.leaderboardId)}`,
        { method: "DELETE", headers: getSupabaseHeaders() },
      );
      if (!membersResp.ok) {
        const text = await membersResp.text();
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to delete board members: ${text}`,
        });
      }

      const boardResp = await fetch(
        `${getSupabaseRestUrl(TABLE_BOARDS)}?id=eq.${encodeURIComponent(input.leaderboardId)}`,
        { method: "DELETE", headers: getSupabaseHeaders() },
      );
      if (!boardResp.ok) {
        const text = await boardResp.text();
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to delete board: ${text}`,
        });
      }
      return { success: true };
    }),
});
