import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "../create-context";
import { isDbConfigured, getSupabaseHeaders, getSupabaseRestUrl } from "../db";
import { cachedOrFetch } from "../cache";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

async function sendFollowNotification(followerId: string, followingId: string): Promise<void> {
  if (!isDbConfigured()) return;

  try {
    const followerUrl = `${getSupabaseRestUrl("users")}?id=eq.${encodeURIComponent(followerId)}&select=display_name,car_brand,car_model&limit=1`;
    const followingUrl = `${getSupabaseRestUrl("users")}?id=eq.${encodeURIComponent(followingId)}&select=push_token&limit=1`;

    const [followerResp, followingResp] = await Promise.all([
      fetch(followerUrl, { method: "GET", headers: getSupabaseHeaders() }),
      fetch(followingUrl, { method: "GET", headers: getSupabaseHeaders() }),
    ]);

    if (!followerResp.ok || !followingResp.ok) return;

    const followerData = await followerResp.json();
    const followingData = await followingResp.json();

    const follower = followerData[0];
    const following = followingData[0];

    if (!follower || !following?.push_token) return;

    const followerName = follower.display_name || "Someone";
    const carInfo = follower.car_brand
      ? follower.car_model
        ? `${follower.car_brand} ${follower.car_model}`
        : follower.car_brand
      : null;
    const carText = carInfo ? ` (${carInfo})` : "";

    console.log("[SOCIAL] Sending follow notification to:", followingId);

    const notifId = `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const notifRow = {
      id: notifId,
      user_id: followingId,
      type: "new_follower",
      from_user_id: followerId,
      post_id: null,
      message: `${followerName}${carText} started following you`,
      read: false,
      created_at: Date.now(),
    };

    fetch(getSupabaseRestUrl("notifications"), {
      method: "POST",
      headers: getSupabaseHeaders(),
      body: JSON.stringify(notifRow),
    }).catch(err => console.error("[SOCIAL] Follow in-app notification error:", err));

    if (following.push_token) {
      await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: {
          "Accept": "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          to: following.push_token,
          title: "New Follower!",
          body: `${followerName}${carText} just started following you!`,
          sound: "default",
          data: { type: "new_follower", fromUserId: followerId },
          channelId: "default",
          priority: "high",
        }),
      });
    }

    console.log("[SOCIAL] Follow notification sent (in-app + push)");
  } catch (error) {
    console.error("[SOCIAL] Follow notification error:", error);
  }
}

interface FollowRow {
  id: string;
  follower_id: string;
  following_id: string;
  created_at: number;
}

interface ActivityFeedRow {
  id: string;
  user_id: string;
  type: string;
  trip_id?: string;
  car_model?: string;
  top_speed?: number;
  distance?: number;
  duration?: number;
  country?: string;
  city?: string;
  created_at: number;
}

interface ActivityRevRow {
  id: string;
  activity_id: string;
  user_id: string;
  created_at: number;
}

console.log("[SOCIAL] Social router module loaded v2.0");

export const socialRouter = createTRPCRouter({
  follow: publicProcedure
    .input(z.object({
      followerId: z.string(),
      followingId: z.string(),
    }))
    .mutation(async ({ input }) => {
      console.log("[SOCIAL] Follow:", input.followerId, "->", input.followingId);
      if (!isDbConfigured()) return { success: false, error: "Database not configured" };
      if (input.followerId === input.followingId) return { success: false, error: "Cannot follow yourself" };

      try {
        const checkUrl = `${getSupabaseRestUrl("follows")}?follower_id=eq.${encodeURIComponent(input.followerId)}&following_id=eq.${encodeURIComponent(input.followingId)}`;
        const checkResp = await fetch(checkUrl, { method: "GET", headers: getSupabaseHeaders() });
        if (checkResp.ok) {
          const existing = await checkResp.json();
          if (existing.length > 0) {
            console.log("[SOCIAL] Already following");
            return { success: true, alreadyFollowing: true };
          }
        }

        const id = `follow_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const row = {
          id,
          follower_id: input.followerId,
          following_id: input.followingId,
          created_at: Date.now(),
        };

        const resp = await fetch(getSupabaseRestUrl("follows"), {
          method: "POST",
          headers: getSupabaseHeaders(),
          body: JSON.stringify(row),
        });

        if (!resp.ok) {
          const err = await resp.text();
          console.error("[SOCIAL] Follow insert failed:", err);
          return { success: false, error: "Failed to follow" };
        }

        console.log("[SOCIAL] Follow created:", id);

        sendFollowNotification(input.followerId, input.followingId).catch(err =>
          console.error("[SOCIAL] Follow notification failed:", err)
        );

        return { success: true };
      } catch (error) {
        console.error("[SOCIAL] Follow error:", error);
        return { success: false, error: "Network error" };
      }
    }),

  unfollow: publicProcedure
    .input(z.object({
      followerId: z.string(),
      followingId: z.string(),
    }))
    .mutation(async ({ input }) => {
      console.log("[SOCIAL] Unfollow:", input.followerId, "->", input.followingId);
      if (!isDbConfigured()) return { success: false, error: "Database not configured" };

      try {
        const url = `${getSupabaseRestUrl("follows")}?follower_id=eq.${encodeURIComponent(input.followerId)}&following_id=eq.${encodeURIComponent(input.followingId)}`;
        const resp = await fetch(url, { method: "DELETE", headers: getSupabaseHeaders() });

        if (!resp.ok) {
          const err = await resp.text();
          console.error("[SOCIAL] Unfollow failed:", err);
          return { success: false, error: "Failed to unfollow" };
        }

        console.log("[SOCIAL] Unfollowed");
        return { success: true };
      } catch (error) {
        console.error("[SOCIAL] Unfollow error:", error);
        return { success: false, error: "Network error" };
      }
    }),

  isFollowing: publicProcedure
    .input(z.object({
      followerId: z.string(),
      followingId: z.string(),
    }))
    .query(async ({ input }) => {
      if (!isDbConfigured()) return { following: false };
      if (input.followerId === input.followingId) return { following: false };

      try {
        const url = `${getSupabaseRestUrl("follows")}?follower_id=eq.${encodeURIComponent(input.followerId)}&following_id=eq.${encodeURIComponent(input.followingId)}&limit=1`;
        const resp = await fetch(url, { method: "GET", headers: getSupabaseHeaders() });
        if (!resp.ok) return { following: false };
        const data = await resp.json();
        return { following: data.length > 0 };
      } catch {
        return { following: false };
      }
    }),

  getFollowCounts: publicProcedure
    .input(z.object({ userId: z.string() }))
    .query(async ({ input }) => {
      if (!isDbConfigured()) return { followers: 0, following: 0 };

      try {
        const followersUrl = `${getSupabaseRestUrl("follows")}?following_id=eq.${encodeURIComponent(input.userId)}&select=id`;
        const followingUrl = `${getSupabaseRestUrl("follows")}?follower_id=eq.${encodeURIComponent(input.userId)}&select=id`;

        const [followersResp, followingResp] = await Promise.all([
          fetch(followersUrl, { method: "GET", headers: getSupabaseHeaders() }),
          fetch(followingUrl, { method: "GET", headers: getSupabaseHeaders() }),
        ]);

        const followers = followersResp.ok ? (await followersResp.json()).length : 0;
        const following = followingResp.ok ? (await followingResp.json()).length : 0;

        return { followers, following };
      } catch {
        return { followers: 0, following: 0 };
      }
    }),

  getFollowers: publicProcedure
    .input(z.object({ userId: z.string() }))
    .query(async ({ input }) => {
      if (!isDbConfigured()) return [];

      try {
        const url = `${getSupabaseRestUrl("follows")}?following_id=eq.${encodeURIComponent(input.userId)}&select=follower_id,created_at&order=created_at.desc`;
        const resp = await fetch(url, { method: "GET", headers: getSupabaseHeaders() });
        if (!resp.ok) return [];
        const rows: FollowRow[] = await resp.json();
        const followerUserIds = rows.map(r => r.follower_id);

        if (followerUserIds.length === 0) return [];

        const usersUrl = `${getSupabaseRestUrl("users")}?select=id,display_name,car_brand,car_model,country,city`;
        const usersResp = await fetch(usersUrl, { method: "GET", headers: getSupabaseHeaders() });
        if (!usersResp.ok) return [];
        const allUsers: Record<string, any>[] = await usersResp.json();

        return followerUserIds
          .map(uid => {
            const u = allUsers.find((au: any) => au.id === uid);
            if (!u) return null;
            return {
              id: u.id,
              displayName: u.display_name,
              carBrand: u.car_brand,
              carModel: u.car_model,
              country: u.country,
              city: u.city,
            };
          })
          .filter(Boolean);
      } catch {
        return [];
      }
    }),

  getFollowing: publicProcedure
    .input(z.object({ userId: z.string() }))
    .query(async ({ input }) => {
      if (!isDbConfigured()) return [];

      try {
        const url = `${getSupabaseRestUrl("follows")}?follower_id=eq.${encodeURIComponent(input.userId)}&select=following_id,created_at&order=created_at.desc`;
        const resp = await fetch(url, { method: "GET", headers: getSupabaseHeaders() });
        if (!resp.ok) return [];
        const rows: FollowRow[] = await resp.json();
        const followedUserIds = rows.map(r => r.following_id);

        if (followedUserIds.length === 0) return [];

        const usersUrl = `${getSupabaseRestUrl("users")}?select=id,display_name,car_brand,car_model,country,city`;
        const usersResp = await fetch(usersUrl, { method: "GET", headers: getSupabaseHeaders() });
        if (!usersResp.ok) return [];
        const allUsers: Record<string, any>[] = await usersResp.json();

        return followedUserIds
          .map(uid => {
            const u = allUsers.find((au: any) => au.id === uid);
            if (!u) return null;
            return {
              id: u.id,
              displayName: u.display_name,
              carBrand: u.car_brand,
              carModel: u.car_model,
              country: u.country,
              city: u.city,
            };
          })
          .filter(Boolean);
      } catch {
        return [];
      }
    }),

  createActivityEntry: publicProcedure
    .input(z.object({
      userId: z.string(),
      type: z.string().default("trip"),
      tripId: z.string().optional(),
      carModel: z.string().optional(),
      topSpeed: z.number().optional(),
      distance: z.number().optional(),
      duration: z.number().optional(),
      country: z.string().optional(),
      city: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      console.log("[SOCIAL] Creating activity entry for user:", input.userId, "type:", input.type);
      if (!isDbConfigured()) return { success: false };

      try {
        if (input.tripId) {
          const checkUrl = `${getSupabaseRestUrl("activity_feed")}?trip_id=eq.${encodeURIComponent(input.tripId)}&limit=1`;
          const checkResp = await fetch(checkUrl, { method: "GET", headers: getSupabaseHeaders() });
          if (checkResp.ok) {
            const existing = await checkResp.json();
            if (existing.length > 0) {
              console.log("[SOCIAL] Activity entry already exists for trip:", input.tripId);
              return { success: true, alreadyExists: true };
            }
          }
        }

        const id = `activity_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const row = {
          id,
          user_id: input.userId,
          type: input.type,
          trip_id: input.tripId,
          car_model: input.carModel,
          top_speed: input.topSpeed ?? 0,
          distance: input.distance ?? 0,
          duration: input.duration ?? 0,
          country: input.country,
          city: input.city,
          created_at: Date.now(),
        };

        const resp = await fetch(getSupabaseRestUrl("activity_feed"), {
          method: "POST",
          headers: getSupabaseHeaders(),
          body: JSON.stringify(row),
        });

        if (!resp.ok) {
          const err = await resp.text();
          console.error("[SOCIAL] Activity entry insert failed:", err);
          return { success: false };
        }

        console.log("[SOCIAL] Activity entry created:", id);
        return { success: true };
      } catch (error) {
        console.error("[SOCIAL] Activity entry error:", error);
        return { success: false };
      }
    }),

  getFeed: publicProcedure
    .input(z.object({
      userId: z.string(),
      limit: z.number().optional().default(30),
      offset: z.number().optional().default(0),
    }))
    .query(async ({ input }) => {
      console.log("[SOCIAL] Fetching feed for user:", input.userId, "limit:", input.limit, "offset:", input.offset);
      if (!isDbConfigured()) return [];

      try {
        const followingUrl = `${getSupabaseRestUrl("follows")}?follower_id=eq.${encodeURIComponent(input.userId)}&select=following_id`;
        const followResp = await fetch(followingUrl, { method: "GET", headers: getSupabaseHeaders() });
        const followRows: { following_id: string }[] = followResp.ok ? await followResp.json() : [];
        const followingIds = followRows.map(r => r.following_id);
        followingIds.push(input.userId);

        const feedFilterIds = followingIds.map(id => `"${id}"`).join(",");
        const feedUrl = `${getSupabaseRestUrl("activity_feed")}?user_id=in.(${feedFilterIds})&order=created_at.desc&limit=${input.limit}&offset=${input.offset}`;

        const feedResp = await fetch(feedUrl, { method: "GET", headers: getSupabaseHeaders() });
        if (!feedResp.ok) {
          const err = await feedResp.text();
          console.error("[SOCIAL] Feed fetch failed:", err);
          return [];
        }

        let feedRows: ActivityFeedRow[] = await feedResp.json();
        console.log("[SOCIAL] Feed rows fetched (following):", feedRows.length);

        if (feedRows.length === 0) {
          const globalUrl = `${getSupabaseRestUrl("activity_feed")}?order=created_at.desc&limit=${input.limit}&offset=${input.offset}`;
          const globalResp = await fetch(globalUrl, { method: "GET", headers: getSupabaseHeaders() });
          if (globalResp.ok) {
            feedRows = await globalResp.json();
            console.log("[SOCIAL] Feed fallback global rows fetched:", feedRows.length);
          }
        }

        const feedUserIds = [...new Set(feedRows.map(r => r.user_id))];
        const userMap = new Map<string, { displayName: string; carBrand?: string; carModel?: string; profilePicture?: string }>();

        if (feedUserIds.length > 0) {
          const idsParam = feedUserIds.map(id => `"${id}"`).join(',');
          const usersUrl = `${getSupabaseRestUrl("users")}?id=in.(${idsParam})&select=id,display_name,car_brand,car_model,country,city,profile_picture`;
          const usersResp = await fetch(usersUrl, { method: "GET", headers: getSupabaseHeaders() });
          const allUsers: Record<string, any>[] = usersResp.ok ? await usersResp.json() : [];

          for (const u of allUsers) {
            userMap.set(u.id, {
              displayName: u.display_name,
              carBrand: u.car_brand,
              carModel: u.car_model,
              profilePicture: u.profile_picture,
            });
          }
        }

        const activityIds = feedRows.map(r => r.id);
        const activityRevCounts: Record<string, number> = {};
        const userActivityRevs: Set<string> = new Set();

        if (activityIds.length > 0) {
          const actIdFilter = activityIds.map(id => `"${id}"`).join(",");
          const revsUrl = `${getSupabaseRestUrl("activity_revs")}?activity_id=in.(${actIdFilter})&select=activity_id,user_id`;
          const revsResp = await fetch(revsUrl, { method: "GET", headers: getSupabaseHeaders() });
          if (revsResp.ok) {
            const revRows: ActivityRevRow[] = await revsResp.json();
            for (const rev of revRows) {
              activityRevCounts[rev.activity_id] = (activityRevCounts[rev.activity_id] || 0) + 1;
              if (rev.user_id === input.userId) {
                userActivityRevs.add(rev.activity_id);
              }
            }
          }
        }

        return feedRows.map(row => ({
          id: row.id,
          userId: row.user_id,
          userName: userMap.get(row.user_id)?.displayName ?? "Driver",
          userProfilePicture: userMap.get(row.user_id)?.profilePicture,
          type: row.type,
          tripId: row.trip_id,
          carModel: row.car_model,
          topSpeed: row.top_speed ?? 0,
          distance: row.distance ?? 0,
          duration: row.duration ?? 0,
          country: row.country,
          city: row.city,
          revCount: activityRevCounts[row.id] || 0,
          isRevved: userActivityRevs.has(row.id),
          createdAt: row.created_at,
        }));
      } catch (error) {
        console.error("[SOCIAL] Feed error:", error);
        return [];
      }
    }),

  batchIsFollowing: publicProcedure
    .input(z.object({
      followerId: z.string(),
      followingIds: z.array(z.string()),
    }))
    .query(async ({ input }) => {
      if (!isDbConfigured()) return { followingMap: {} as Record<string, boolean> };
      if (input.followingIds.length === 0) return { followingMap: {} as Record<string, boolean> };

      try {
        const ids = input.followingIds.filter(id => id !== input.followerId);
        if (ids.length === 0) return { followingMap: {} as Record<string, boolean> };

        const idFilter = ids.map(id => `"${id}"`).join(",");
        const url = `${getSupabaseRestUrl("follows")}?follower_id=eq.${encodeURIComponent(input.followerId)}&following_id=in.(${idFilter})&select=following_id`;
        const resp = await fetch(url, { method: "GET", headers: getSupabaseHeaders() });
        if (!resp.ok) return { followingMap: {} as Record<string, boolean> };

        const rows: { following_id: string }[] = await resp.json();
        const followingMap: Record<string, boolean> = {};
        for (const id of ids) {
          followingMap[id] = rows.some(r => r.following_id === id);
        }
        return { followingMap };
      } catch {
        return { followingMap: {} as Record<string, boolean> };
      }
    }),

  syncAchievements: publicProcedure
    .input(z.object({
      userId: z.string(),
      achievements: z.array(z.object({
        achievementId: z.string(),
        unlockedAt: z.number(),
      })),
    }))
    .mutation(async ({ input }) => {
      console.log("[SOCIAL] Syncing achievements for user:", input.userId, "count:", input.achievements.length);
      if (!isDbConfigured()) return { success: false, error: "Database not configured" };

      try {
        const deleteUrl = `${getSupabaseRestUrl("user_achievements")}?user_id=eq.${encodeURIComponent(input.userId)}`;
        await fetch(deleteUrl, { method: "DELETE", headers: getSupabaseHeaders() });

        if (input.achievements.length === 0) {
          return { success: true };
        }

        const rows = input.achievements.map(a => ({
          id: `ach_${input.userId}_${a.achievementId}`,
          user_id: input.userId,
          achievement_id: a.achievementId,
          unlocked_at: a.unlockedAt,
        }));

        const resp = await fetch(getSupabaseRestUrl("user_achievements"), {
          method: "POST",
          headers: getSupabaseHeaders(),
          body: JSON.stringify(rows),
        });

        if (!resp.ok) {
          const err = await resp.text();
          console.error("[SOCIAL] Achievements sync insert failed:", err);
          return { success: false, error: "Failed to sync achievements" };
        }

        console.log("[SOCIAL] Achievements synced:", rows.length);
        return { success: true };
      } catch (error) {
        console.error("[SOCIAL] Achievements sync error:", error);
        return { success: false, error: "Network error" };
      }
    }),

  getUserAchievements: publicProcedure
    .input(z.object({ userId: z.string() }))
    .query(async ({ input }) => {
      if (!isDbConfigured()) return [];

      try {
        const url = `${getSupabaseRestUrl("user_achievements")}?user_id=eq.${encodeURIComponent(input.userId)}&select=achievement_id,unlocked_at`;
        const resp = await fetch(url, { method: "GET", headers: getSupabaseHeaders() });
        if (!resp.ok) return [];
        const rows: { achievement_id: string; unlocked_at: number }[] = await resp.json();
        return rows.map(r => ({
          achievementId: r.achievement_id,
          unlockedAt: r.unlocked_at,
        }));
      } catch {
        return [];
      }
    }),

  getUserAchievementCount: publicProcedure
    .input(z.object({ userId: z.string() }))
    .query(async ({ input }) => {
      if (!isDbConfigured()) return { count: 0 };

      try {
        const url = `${getSupabaseRestUrl("user_achievements")}?user_id=eq.${encodeURIComponent(input.userId)}&select=id`;
        const resp = await fetch(url, { method: "GET", headers: getSupabaseHeaders() });
        if (!resp.ok) return { count: 0 };
        const rows = await resp.json();
        return { count: rows.length };
      } catch {
        return { count: 0 };
      }
    }),

  getChallengesLeaderboard: publicProcedure
    .input(z.object({
      limit: z.number().optional().default(10),
    }))
    .query(async ({ input }) => {
      if (!isDbConfigured()) return [];
      return cachedOrFetch(`challenges-leaderboard:${input.limit}`, 60_000, async () => {
      console.log("[SOCIAL] Fetching challenges leaderboard");
      try {
        const achUrl = `${getSupabaseRestUrl("user_achievements")}?select=user_id,achievement_id`;
        const achResp = await fetch(achUrl, { method: "GET", headers: getSupabaseHeaders() });
        if (!achResp.ok) return [];

        const achRows: { user_id: string; achievement_id: string }[] = await achResp.json();

        const userCounts = new Map<string, number>();
        for (const row of achRows) {
          userCounts.set(row.user_id, (userCounts.get(row.user_id) || 0) + 1);
        }

        const sorted = [...userCounts.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, input.limit);

        if (sorted.length === 0) return [];

        const sortedUserIds = sorted.map(([uid]) => uid);
        const idsParam = sortedUserIds.map(id => `"${id}"`).join(',');
        const usersUrl = `${getSupabaseRestUrl("users")}?id=in.(${idsParam})&select=id,display_name,profile_picture`;
        const usersResp = await fetch(usersUrl, { method: "GET", headers: getSupabaseHeaders() });
        const allUsers: { id: string; display_name: string; profile_picture?: string }[] = usersResp.ok ? await usersResp.json() : [];

        const userMap = new Map(allUsers.map(u => [u.id, u]));
        const totalAchievements = 23;

        return sorted.map(([visitorId, count]) => {
          const u = userMap.get(visitorId);
          return {
            userId: visitorId,
            userName: u?.display_name || 'Driver',
            userProfilePicture: u?.profile_picture,
            achievementCount: count,
            totalAchievements,
            completionPercent: Math.round((count / totalAchievements) * 100),
          };
        });
      } catch (error) {
        console.error("[SOCIAL] Challenges leaderboard error:", error);
        return [];
      }
      });
    }),

  revActivity: publicProcedure
    .input(z.object({
      activityId: z.string(),
      userId: z.string(),
    }))
    .mutation(async ({ input }) => {
      console.log("[SOCIAL] Rev activity:", input.activityId, "by user:", input.userId);
      if (!isDbConfigured()) return { success: false, error: "Database not configured" };

      try {
        const checkUrl = `${getSupabaseRestUrl("activity_revs")}?activity_id=eq.${encodeURIComponent(input.activityId)}&user_id=eq.${encodeURIComponent(input.userId)}&limit=1`;
        const checkResp = await fetch(checkUrl, { method: "GET", headers: getSupabaseHeaders() });
        if (checkResp.ok) {
          const existing = await checkResp.json();
          if (existing.length > 0) {
            return { success: true, alreadyRevved: true };
          }
        }

        const id = `actrev_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const row = {
          id,
          activity_id: input.activityId,
          user_id: input.userId,
          created_at: Date.now(),
        };

        const resp = await fetch(getSupabaseRestUrl("activity_revs"), {
          method: "POST",
          headers: getSupabaseHeaders(),
          body: JSON.stringify(row),
        });

        if (!resp.ok) {
          const err = await resp.text();
          console.error("[SOCIAL] Activity rev insert failed:", err);
          return { success: false, error: "Failed to rev activity" };
        }

        const activityUrl = `${getSupabaseRestUrl("activity_feed")}?id=eq.${encodeURIComponent(input.activityId)}&select=user_id&limit=1`;
        const actResp = await fetch(activityUrl, { method: "GET", headers: getSupabaseHeaders() });
        if (actResp.ok) {
          const actData = await actResp.json();
          const actOwnerId = actData[0]?.user_id;
          if (actOwnerId && actOwnerId !== input.userId) {
            const revUserUrl = `${getSupabaseRestUrl("users")}?id=eq.${encodeURIComponent(input.userId)}&select=display_name&limit=1`;
            const revUserResp = await fetch(revUserUrl, { method: "GET", headers: getSupabaseHeaders() });
            let fromName = "Someone";
            if (revUserResp.ok) {
              const revUserData = await revUserResp.json();
              fromName = revUserData[0]?.display_name || "Someone";
            }

            const notifId = `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            const notifRow = {
              id: notifId,
              user_id: actOwnerId,
              type: "activity_rev",
              from_user_id: input.userId,
              post_id: null,
              message: `${fromName} revved your drive log`,
              read: false,
              created_at: Date.now(),
            };

            fetch(getSupabaseRestUrl("notifications"), {
              method: "POST",
              headers: getSupabaseHeaders(),
              body: JSON.stringify(notifRow),
            }).catch(err => console.error("[SOCIAL] Activity rev notification error:", err));

            const ownerUrl = `${getSupabaseRestUrl("users")}?id=eq.${encodeURIComponent(actOwnerId)}&select=push_token&limit=1`;
            fetch(ownerUrl, { method: "GET", headers: getSupabaseHeaders() })
              .then(async r => {
                if (!r.ok) return;
                const data = await r.json();
                const pushToken = data[0]?.push_token;
                if (!pushToken) return;
                await fetch(EXPO_PUSH_URL, {
                  method: "POST",
                  headers: { Accept: "application/json", "Content-Type": "application/json" },
                  body: JSON.stringify({
                    to: pushToken,
                    title: "New Rev!",
                    body: `${fromName} revved your drive log!`,
                    sound: "default",
                    data: { type: "activity_rev", fromUserId: input.userId },
                    channelId: "default",
                    priority: "high",
                  }),
                });
              })
              .catch(err => console.error("[SOCIAL] Activity rev push error:", err));
          }
        }

        console.log("[SOCIAL] Activity rev created:", id);
        return { success: true };
      } catch (error) {
        console.error("[SOCIAL] Activity rev error:", error);
        return { success: false, error: "Network error" };
      }
    }),

  unrevActivity: publicProcedure
    .input(z.object({
      activityId: z.string(),
      userId: z.string(),
    }))
    .mutation(async ({ input }) => {
      console.log("[SOCIAL] Unrev activity:", input.activityId, "by user:", input.userId);
      if (!isDbConfigured()) return { success: false, error: "Database not configured" };

      try {
        const url = `${getSupabaseRestUrl("activity_revs")}?activity_id=eq.${encodeURIComponent(input.activityId)}&user_id=eq.${encodeURIComponent(input.userId)}`;
        const resp = await fetch(url, { method: "DELETE", headers: getSupabaseHeaders() });

        if (!resp.ok) {
          const err = await resp.text();
          console.error("[SOCIAL] Activity unrev failed:", err);
          return { success: false, error: "Failed to unrev activity" };
        }

        console.log("[SOCIAL] Activity unrevved");
        return { success: true };
      } catch (error) {
        console.error("[SOCIAL] Activity unrev error:", error);
        return { success: false, error: "Network error" };
      }
    }),

  getDiscoverDrives: publicProcedure
    .input(z.object({
      userId: z.string(),
      limit: z.number().optional().default(20),
    }))
    .query(async ({ input }) => {
      console.log("[SOCIAL] Fetching discover drives for user:", input.userId);
      if (!isDbConfigured()) return [];

      try {
        const followingUrl = `${getSupabaseRestUrl("follows")}?follower_id=eq.${encodeURIComponent(input.userId)}&select=following_id`;
        const followResp = await fetch(followingUrl, { method: "GET", headers: getSupabaseHeaders() });
        const followRows: { following_id: string }[] = followResp.ok ? await followResp.json() : [];
        const followingIds = new Set(followRows.map(r => r.following_id));
        followingIds.add(input.userId);

        const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
        const feedUrl = `${getSupabaseRestUrl("activity_feed")}?order=created_at.desc&limit=200&created_at=gte.${thirtyDaysAgo}`;
        const feedResp = await fetch(feedUrl, { method: "GET", headers: getSupabaseHeaders() });
        if (!feedResp.ok) return [];

        const allRows: ActivityFeedRow[] = await feedResp.json();
        const discoverRows = allRows.filter(r => !followingIds.has(r.user_id) && (r.top_speed ?? 0) > 0);

        const userCounts = new Map<string, number>();
        const uniqueRows: ActivityFeedRow[] = [];
        for (const row of discoverRows) {
          const count = userCounts.get(row.user_id) ?? 0;
          if (count < 3) {
            userCounts.set(row.user_id, count + 1);
            uniqueRows.push(row);
          }
        }

        for (let i = uniqueRows.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [uniqueRows[i], uniqueRows[j]] = [uniqueRows[j], uniqueRows[i]];
        }
        const selected = uniqueRows.slice(0, input.limit);

        if (selected.length === 0) return [];

        const discoverUserIds = [...new Set(selected.map(r => r.user_id))];
        const idsParam = discoverUserIds.map(id => `"${id}"`).join(',');
        const usersUrl = `${getSupabaseRestUrl("users")}?id=in.(${idsParam})&select=id,display_name,email,car_brand,car_model,country,city,profile_picture`;
        const usersResp = await fetch(usersUrl, { method: "GET", headers: getSupabaseHeaders() });
        const allUsers: Record<string, any>[] = usersResp.ok ? await usersResp.json() : [];

        const userMap = new Map<string, { displayName: string; carBrand?: string; carModel?: string; profilePicture?: string; country?: string; city?: string }>();
        for (const u of allUsers) {
          userMap.set(u.id, {
            displayName: u.display_name || u.email?.split('@')[0] || 'Driver',
            carBrand: u.car_brand,
            carModel: u.car_model,
            profilePicture: u.profile_picture,
            country: u.country,
            city: u.city,
          });
        }

        const activityIds = selected.map(r => r.id);
        const activityRevCounts: Record<string, number> = {};
        const userActivityRevs: Set<string> = new Set();

        if (activityIds.length > 0) {
          const actIdFilter = activityIds.map(id => `"${id}"`).join(",");
          const revsUrl = `${getSupabaseRestUrl("activity_revs")}?activity_id=in.(${actIdFilter})&select=activity_id,user_id`;
          const revsResp = await fetch(revsUrl, { method: "GET", headers: getSupabaseHeaders() });
          if (revsResp.ok) {
            const revRows: ActivityRevRow[] = await revsResp.json();
            for (const rev of revRows) {
              activityRevCounts[rev.activity_id] = (activityRevCounts[rev.activity_id] || 0) + 1;
              if (rev.user_id === input.userId) {
                userActivityRevs.add(rev.activity_id);
              }
            }
          }
        }

        console.log("[SOCIAL] Discover drives found:", selected.length);
        return selected.map(row => ({
          id: row.id,
          userId: row.user_id,
          userName: userMap.get(row.user_id)?.displayName ?? "Driver",
          userProfilePicture: userMap.get(row.user_id)?.profilePicture,
          type: row.type,
          tripId: row.trip_id,
          carModel: row.car_model,
          topSpeed: row.top_speed ?? 0,
          distance: row.distance ?? 0,
          duration: row.duration ?? 0,
          country: row.country,
          city: row.city,
          revCount: activityRevCounts[row.id] || 0,
          isRevved: userActivityRevs.has(row.id),
          createdAt: row.created_at,
        }));
      } catch (error) {
        console.error("[SOCIAL] Discover drives error:", error);
        return [];
      }
    }),

  searchUsers: publicProcedure
    .input(z.object({
      query: z.string().min(1),
      currentUserId: z.string(),
      limit: z.number().optional().default(20),
    }))
    .query(async ({ input }) => {
      console.log("[SOCIAL] Searching users:", input.query);
      if (!isDbConfigured()) return [];

      try {
        const url = `${getSupabaseRestUrl("users")}?display_name=ilike.*${encodeURIComponent(input.query)}*&select=id,display_name,car_brand,car_model,country,city&limit=${input.limit}`;
        const resp = await fetch(url, { method: "GET", headers: getSupabaseHeaders() });
        if (!resp.ok) return [];

        const users: Record<string, any>[] = await resp.json();
        return users
          .filter((u: any) => u.id !== input.currentUserId)
          .map((u: any) => ({
            id: u.id,
            displayName: u.display_name,
            carBrand: u.car_brand,
            carModel: u.car_model,
            country: u.country,
            city: u.city,
          }));
      } catch {
        return [];
      }
    }),
});
