import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "../create-context";
import { isDbConfigured, getSupabaseHeaders, getSupabaseRestUrl, getDbConfig } from "../db";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

interface PostRow {
  id: string;
  user_id: string;
  text?: string;
  image_url?: string;
  created_at: number;
}

interface PostRevRow {
  id: string;
  post_id: string;
  user_id: string;
  created_at: number;
}

interface CommentRow {
  id: string;
  post_id: string;
  user_id: string;
  text: string;
  created_at: number;
}

interface NotificationRow {
  id: string;
  user_id: string;
  type: string;
  from_user_id?: string;
  post_id?: string;
  message: string;
  read: boolean;
  created_at: number;
}

async function sendRevPushNotification(
  fromUserId: string,
  postOwnerId: string,
  postId: string
): Promise<void> {
  if (!isDbConfigured()) return;

  try {
    const fromUserUrl = `${getSupabaseRestUrl("users")}?id=eq.${encodeURIComponent(fromUserId)}&select=display_name&limit=1`;
    const ownerUrl = `${getSupabaseRestUrl("users")}?id=eq.${encodeURIComponent(postOwnerId)}&select=push_token&limit=1`;

    const [fromResp, ownerResp] = await Promise.all([
      fetch(fromUserUrl, { method: "GET", headers: getSupabaseHeaders() }),
      fetch(ownerUrl, { method: "GET", headers: getSupabaseHeaders() }),
    ]);

    if (!fromResp.ok || !ownerResp.ok) return;

    const fromData = await fromResp.json();
    const ownerData = await ownerResp.json();

    const fromUser = fromData[0];
    const owner = ownerData[0];

    if (!fromUser || !owner?.push_token) return;

    const fromName = fromUser.display_name || "Someone";

    console.log("[POSTS] Sending rev push notification to:", postOwnerId);

    await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        to: owner.push_token,
        title: "🏎️ New Rev!",
        body: `${fromName} revved your post!`,
        sound: "default",
        data: { type: "post_rev", fromUserId, postId },
        channelId: "default",
        priority: "high",
      }),
    });

    console.log("[POSTS] Rev push notification sent");
  } catch (error) {
    console.error("[POSTS] Rev push notification error:", error);
  }
}

export const postsRouter = createTRPCRouter({
  uploadPostImage: publicProcedure
    .input(
      z.object({
        userId: z.string(),
        postId: z.string(),
        base64: z.string(),
        mimeType: z.string().optional().default('image/jpeg'),
      })
    )
    .mutation(async ({ input }) => {
      console.log("[POSTS] Uploading post image for user:", input.userId, "postId:", input.postId);
      if (!isDbConfigured()) {
        console.error("[POSTS] DB not configured for upload");
        return { success: false, url: null, error: "Database not configured" };
      }

      try {
        const dbConfig = getDbConfig();
        const supabaseUrl = dbConfig.url;
        const serviceRoleKey = dbConfig.serviceRoleKey;
        const anonKey = dbConfig.anonKey;

        console.log("[POSTS] Upload config check - URL:", !!supabaseUrl, "serviceKey:", !!serviceRoleKey, "anonKey:", !!anonKey);

        if (!supabaseUrl || !serviceRoleKey) {
          console.error("[POSTS] Supabase not configured for image upload. URL:", supabaseUrl, "serviceKey length:", serviceRoleKey?.length);
          return { success: false, url: null, error: "Storage not configured" };
        }

        const BUCKET_NAME = 'user-images';
        const timestamp = Date.now();
        const fileName = `${input.userId}/posts/${input.postId}_${timestamp}.jpg`;
        const uploadUrl = `${supabaseUrl}/storage/v1/object/${BUCKET_NAME}/${fileName}`;

        console.log("[POSTS] Base64 input length:", input.base64.length);

        let bytes: Uint8Array;
        try {
          if (typeof Buffer !== 'undefined') {
            bytes = new Uint8Array(Buffer.from(input.base64, 'base64'));
          } else {
            const binaryString = atob(input.base64);
            bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
              bytes[i] = binaryString.charCodeAt(i);
            }
          }
        } catch (decodeError: any) {
          console.error("[POSTS] Base64 decode failed:", decodeError?.message);
          return { success: false, url: null, error: "Failed to decode image data" };
        }

        console.log("[POSTS] Uploading to Supabase Storage:", uploadUrl.substring(0, 80));
        console.log("[POSTS] Image size:", bytes.length, "bytes");

        const uploadResponse = await fetch(uploadUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${serviceRoleKey}`,
            'apikey': anonKey || serviceRoleKey,
            'Content-Type': input.mimeType,
            'x-upsert': 'true',
          },
          body: bytes as any,
        });

        console.log("[POSTS] Upload response status:", uploadResponse.status);

        if (!uploadResponse.ok) {
          const errorText = await uploadResponse.text();
          console.error("[POSTS] Image upload failed:", uploadResponse.status, errorText);
          return { success: false, url: null, error: `Upload failed (${uploadResponse.status}): ${errorText}` };
        }

        const publicUrl = `${supabaseUrl}/storage/v1/object/public/${BUCKET_NAME}/${fileName}`;
        console.log("[POSTS] Image uploaded successfully:", publicUrl.substring(0, 80));
        return { success: true, url: publicUrl, error: null };
      } catch (error: any) {
        console.error("[POSTS] Image upload error:", error?.message, error?.stack);
        return { success: false, url: null, error: `Upload error: ${error?.message || 'Unknown'}` };
      }
    }),

  createPost: publicProcedure
    .input(
      z.object({
        userId: z.string(),
        text: z.string().optional(),
        imageUrl: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      console.log("[POSTS] Creating post for user:", input.userId);
      console.log("[POSTS] Input text:", input.text, "imageUrl:", input.imageUrl);
      
      if (!isDbConfigured()) {
        console.error("[POSTS] DB not configured");
        throw new Error("Database not configured");
      }

      if (!input.text?.trim() && !input.imageUrl) {
        throw new Error("Post must have text or an image");
      }

      const id = `post_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const row = {
        id,
        user_id: input.userId,
        text: input.text?.trim() || null,
        image_url: input.imageUrl || null,
        created_at: Date.now(),
      };

      console.log("[POSTS] Inserting post row:", JSON.stringify(row));

      const resp = await fetch(getSupabaseRestUrl("posts"), {
        method: "POST",
        headers: getSupabaseHeaders(),
        body: JSON.stringify(row),
      });

      if (!resp.ok) {
        const err = await resp.text();
        console.error("[POSTS] Post insert failed:", resp.status, err);
        throw new Error(`Failed to create post: ${err}`);
      }

      console.log("[POSTS] Post created:", id);
      return { success: true, postId: id };
    }),

  getFeedPosts: publicProcedure
    .input(
      z.object({
        userId: z.string(),
        limit: z.number().optional().default(30),
        offset: z.number().optional().default(0),
      })
    )
    .query(async ({ input }) => {
      console.log("[POSTS] Fetching feed posts for user:", input.userId);
      if (!isDbConfigured()) return [];

      try {
        const followingUrl = `${getSupabaseRestUrl("follows")}?follower_id=eq.${encodeURIComponent(input.userId)}&select=following_id`;
        const followResp = await fetch(followingUrl, { method: "GET", headers: getSupabaseHeaders() });
        const followRows: { following_id: string }[] = followResp.ok ? await followResp.json() : [];
        const followingIds = followRows.map((r) => r.following_id);
        followingIds.push(input.userId);

        const postsUserFilter = followingIds.map((id) => `"${id}"`).join(",");
        const postsUrl = `${getSupabaseRestUrl("posts")}?user_id=in.(${postsUserFilter})&order=created_at.desc&limit=${input.limit}&offset=${input.offset}`;

        const postsResp = await fetch(postsUrl, { method: "GET", headers: getSupabaseHeaders() });
        if (!postsResp.ok) return [];

        let postRows: PostRow[] = await postsResp.json();
        console.log("[POSTS] Feed posts fetched (following):", postRows.length);

        if (postRows.length === 0) {
          const globalUrl = `${getSupabaseRestUrl("posts")}?order=created_at.desc&limit=${input.limit}&offset=${input.offset}`;
          const globalResp = await fetch(globalUrl, { method: "GET", headers: getSupabaseHeaders() });
          if (globalResp.ok) {
            postRows = await globalResp.json();
            console.log("[POSTS] Feed posts fallback global fetched:", postRows.length);
          }
        }

        const postUserIds = [...new Set(postRows.map(r => r.user_id))];
        const userMap = new Map<string, { displayName: string; carBrand?: string; carModel?: string; profilePicture?: string }>();

        if (postUserIds.length > 0) {
          const idsParam = postUserIds.map(id => `"${id}"`).join(',');
          const usersUrl = `${getSupabaseRestUrl("users")}?id=in.(${idsParam})&select=id,display_name,email,car_brand,car_model,profile_picture`;
          const usersResp = await fetch(usersUrl, { method: "GET", headers: getSupabaseHeaders() });
          const allUsers: Record<string, any>[] = usersResp.ok ? await usersResp.json() : [];

          for (const u of allUsers) {
            userMap.set(u.id, {
              displayName: u.display_name || u.email?.split('@')[0] || 'Driver',
              carBrand: u.car_brand,
              carModel: u.car_model,
              profilePicture: u.profile_picture,
            });
          }
        }

        const postIds = postRows.map((p) => p.id);
        let revCounts: Record<string, number> = {};
        let userRevs: Set<string> = new Set();

        if (postIds.length > 0) {
          const postIdFilter = postIds.map((id) => `"${id}"`).join(",");
          const revsUrl = `${getSupabaseRestUrl("post_revs")}?post_id=in.(${postIdFilter})&select=post_id,user_id`;
          const revsResp = await fetch(revsUrl, { method: "GET", headers: getSupabaseHeaders() });
          if (revsResp.ok) {
            const revRows: PostRevRow[] = await revsResp.json();
            for (const rev of revRows) {
              revCounts[rev.post_id] = (revCounts[rev.post_id] || 0) + 1;
              if (rev.user_id === input.userId) {
                userRevs.add(rev.post_id);
              }
            }
          }
        }

        return postRows.map((row) => ({
          id: row.id,
          userId: row.user_id,
          userName: userMap.get(row.user_id)?.displayName ?? "Driver",
          userProfilePicture: userMap.get(row.user_id)?.profilePicture,
          userCarBrand: userMap.get(row.user_id)?.carBrand,
          userCarModel: userMap.get(row.user_id)?.carModel,
          text: row.text,
          imageUrl: row.image_url,
          revCount: revCounts[row.id] || 0,
          isRevved: userRevs.has(row.id),
          createdAt: row.created_at,
        }));
      } catch (error) {
        console.error("[POSTS] Feed posts error:", error);
        return [];
      }
    }),

  getUserPosts: publicProcedure
    .input(
      z.object({
        userId: z.string(),
        limit: z.number().optional().default(50),
        offset: z.number().optional().default(0),
      })
    )
    .query(async ({ input }) => {
      console.log("[POSTS] Fetching user posts:", input.userId);
      if (!isDbConfigured()) return [];

      try {
        const postsUrl = `${getSupabaseRestUrl("posts")}?user_id=eq.${encodeURIComponent(input.userId)}&order=created_at.desc&limit=${input.limit}&offset=${input.offset}`;
        const postsResp = await fetch(postsUrl, { method: "GET", headers: getSupabaseHeaders() });
        if (!postsResp.ok) return [];

        const postRows: PostRow[] = await postsResp.json();

        const postIds = postRows.map((p) => p.id);
        let revCounts: Record<string, number> = {};

        if (postIds.length > 0) {
          const postIdFilter = postIds.map((id) => `"${id}"`).join(",");
          const revsUrl = `${getSupabaseRestUrl("post_revs")}?post_id=in.(${postIdFilter})&select=post_id`;
          const revsResp = await fetch(revsUrl, { method: "GET", headers: getSupabaseHeaders() });
          if (revsResp.ok) {
            const revRows: { post_id: string }[] = await revsResp.json();
            for (const rev of revRows) {
              revCounts[rev.post_id] = (revCounts[rev.post_id] || 0) + 1;
            }
          }
        }

        return postRows.map((row) => ({
          id: row.id,
          text: row.text,
          imageUrl: row.image_url,
          revCount: revCounts[row.id] || 0,
          createdAt: row.created_at,
        }));
      } catch (error) {
        console.error("[POSTS] User posts error:", error);
        return [];
      }
    }),

  revPost: publicProcedure
    .input(
      z.object({
        postId: z.string(),
        userId: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      console.log("[POSTS] Rev post:", input.postId, "by user:", input.userId);
      if (!isDbConfigured()) return { success: false, error: "Database not configured" };

      try {
        const checkUrl = `${getSupabaseRestUrl("post_revs")}?post_id=eq.${encodeURIComponent(input.postId)}&user_id=eq.${encodeURIComponent(input.userId)}&limit=1`;
        const checkResp = await fetch(checkUrl, { method: "GET", headers: getSupabaseHeaders() });
        if (checkResp.ok) {
          const existing = await checkResp.json();
          if (existing.length > 0) {
            return { success: true, alreadyRevved: true };
          }
        }

        const id = `rev_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const row = {
          id,
          post_id: input.postId,
          user_id: input.userId,
          created_at: Date.now(),
        };

        const resp = await fetch(getSupabaseRestUrl("post_revs"), {
          method: "POST",
          headers: getSupabaseHeaders(),
          body: JSON.stringify(row),
        });

        if (!resp.ok) {
          const err = await resp.text();
          console.error("[POSTS] Rev insert failed:", err);
          return { success: false, error: "Failed to rev post" };
        }

        const postUrl = `${getSupabaseRestUrl("posts")}?id=eq.${encodeURIComponent(input.postId)}&select=user_id&limit=1`;
        const postResp = await fetch(postUrl, { method: "GET", headers: getSupabaseHeaders() });
        if (postResp.ok) {
          const postData = await postResp.json();
          const postOwnerId = postData[0]?.user_id;
          if (postOwnerId && postOwnerId !== input.userId) {
            const userUrl = `${getSupabaseRestUrl("users")}?id=eq.${encodeURIComponent(input.userId)}&select=display_name&limit=1`;
            const userResp = await fetch(userUrl, { method: "GET", headers: getSupabaseHeaders() });
            let fromName = "Someone";
            if (userResp.ok) {
              const userData = await userResp.json();
              fromName = userData[0]?.display_name || "Someone";
            }

            const notifId = `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            const notifRow = {
              id: notifId,
              user_id: postOwnerId,
              type: "post_rev",
              from_user_id: input.userId,
              post_id: input.postId,
              message: `${fromName} revved your post`,
              read: false,
              created_at: Date.now(),
            };

            fetch(getSupabaseRestUrl("notifications"), {
              method: "POST",
              headers: getSupabaseHeaders(),
              body: JSON.stringify(notifRow),
            }).catch((err) => console.error("[POSTS] Notification insert error:", err));

            sendRevPushNotification(input.userId, postOwnerId, input.postId).catch((err) =>
              console.error("[POSTS] Rev push notification failed:", err)
            );
          }
        }

        console.log("[POSTS] Rev created:", id);
        return { success: true };
      } catch (error) {
        console.error("[POSTS] Rev error:", error);
        return { success: false, error: "Network error" };
      }
    }),

  unrevPost: publicProcedure
    .input(
      z.object({
        postId: z.string(),
        userId: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      console.log("[POSTS] Unrev post:", input.postId, "by user:", input.userId);
      if (!isDbConfigured()) return { success: false, error: "Database not configured" };

      try {
        const url = `${getSupabaseRestUrl("post_revs")}?post_id=eq.${encodeURIComponent(input.postId)}&user_id=eq.${encodeURIComponent(input.userId)}`;
        const resp = await fetch(url, { method: "DELETE", headers: getSupabaseHeaders() });

        if (!resp.ok) {
          const err = await resp.text();
          console.error("[POSTS] Unrev failed:", err);
          return { success: false, error: "Failed to unrev post" };
        }

        console.log("[POSTS] Unrevved");
        return { success: true };
      } catch (error) {
        console.error("[POSTS] Unrev error:", error);
        return { success: false, error: "Network error" };
      }
    }),

  getNotifications: publicProcedure
    .input(
      z.object({
        userId: z.string(),
        limit: z.number().optional().default(50),
      })
    )
    .query(async ({ input }) => {
      console.log("[POSTS] Fetching notifications for user:", input.userId);
      if (!isDbConfigured()) return [];

      try {
        const url = `${getSupabaseRestUrl("notifications")}?user_id=eq.${encodeURIComponent(input.userId)}&order=created_at.desc&limit=${input.limit}`;
        const resp = await fetch(url, { method: "GET", headers: getSupabaseHeaders() });
        if (!resp.ok) return [];

        const rows: NotificationRow[] = await resp.json();

        const fromUserIds = [...new Set(rows.filter((r) => r.from_user_id).map((r) => r.from_user_id as string))];
        let userMap = new Map<string, { displayName: string; profilePicture?: string }>();

        if (fromUserIds.length > 0) {
          const idFilter = fromUserIds.map((id) => `"${id}"`).join(",");
          const usersUrl = `${getSupabaseRestUrl("users")}?id=in.(${idFilter})&select=id,display_name,profile_picture`;
          const usersResp = await fetch(usersUrl, { method: "GET", headers: getSupabaseHeaders() });
          if (usersResp.ok) {
            const users: Record<string, any>[] = await usersResp.json();
            for (const u of users) {
              userMap.set(u.id, { displayName: u.display_name, profilePicture: u.profile_picture });
            }
          }
        }

        return rows.map((row) => ({
          id: row.id,
          type: row.type,
          fromUserId: row.from_user_id,
          fromUserName: row.from_user_id ? userMap.get(row.from_user_id)?.displayName : undefined,
          fromUserPicture: row.from_user_id ? userMap.get(row.from_user_id)?.profilePicture : undefined,
          postId: row.post_id,
          message: row.message,
          read: row.read,
          createdAt: row.created_at,
        }));
      } catch (error) {
        console.error("[POSTS] Notifications error:", error);
        return [];
      }
    }),

  getUnreadNotificationCount: publicProcedure
    .input(z.object({ userId: z.string() }))
    .query(async ({ input }) => {
      if (!isDbConfigured()) return { count: 0 };

      try {
        const url = `${getSupabaseRestUrl("notifications")}?user_id=eq.${encodeURIComponent(input.userId)}&read=eq.false&select=id`;
        const resp = await fetch(url, { method: "GET", headers: getSupabaseHeaders() });
        if (!resp.ok) return { count: 0 };
        const rows = await resp.json();
        return { count: rows.length };
      } catch {
        return { count: 0 };
      }
    }),

  markNotificationsRead: publicProcedure
    .input(z.object({ userId: z.string() }))
    .mutation(async ({ input }) => {
      console.log("[POSTS] Marking notifications read for user:", input.userId);
      if (!isDbConfigured()) return { success: false };

      try {
        const url = `${getSupabaseRestUrl("notifications")}?user_id=eq.${encodeURIComponent(input.userId)}&read=eq.false`;
        const resp = await fetch(url, {
          method: "PATCH",
          headers: getSupabaseHeaders(),
          body: JSON.stringify({ read: true }),
        });

        if (!resp.ok) {
          const err = await resp.text();
          console.error("[POSTS] Mark read failed:", err);
          return { success: false };
        }

        return { success: true };
      } catch (error) {
        console.error("[POSTS] Mark read error:", error);
        return { success: false };
      }
    }),

  getDiscoverPosts: publicProcedure
    .input(
      z.object({
        userId: z.string(),
        limit: z.number().optional().default(20),
      })
    )
    .query(async ({ input }) => {
      console.log("[POSTS] Fetching discover posts for user:", input.userId);
      if (!isDbConfigured()) return [];

      try {
        const followingUrl = `${getSupabaseRestUrl("follows")}?follower_id=eq.${encodeURIComponent(input.userId)}&select=following_id`;
        const followResp = await fetch(followingUrl, { method: "GET", headers: getSupabaseHeaders() });
        const followRows: { following_id: string }[] = followResp.ok ? await followResp.json() : [];
        const followingIds = new Set(followRows.map((r) => r.following_id));
        followingIds.add(input.userId);

        const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
        const postsUrl = `${getSupabaseRestUrl("posts")}?order=created_at.desc&limit=200&created_at=gte.${thirtyDaysAgo}`;
        const postsResp = await fetch(postsUrl, { method: "GET", headers: getSupabaseHeaders() });
        if (!postsResp.ok) return [];

        const allPosts: PostRow[] = await postsResp.json();
        const discoverPosts = allPosts.filter((p) => !followingIds.has(p.user_id));

        const userCounts = new Map<string, number>();
        const uniquePosts: PostRow[] = [];
        for (const post of discoverPosts) {
          const count = userCounts.get(post.user_id) ?? 0;
          if (count < 3) {
            userCounts.set(post.user_id, count + 1);
            uniquePosts.push(post);
          }
        }

        for (let i = uniquePosts.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [uniquePosts[i], uniquePosts[j]] = [uniquePosts[j], uniquePosts[i]];
        }
        const selected = uniquePosts.slice(0, input.limit);

        if (selected.length === 0) return [];

        const userIds = [...new Set(selected.map((p) => p.user_id))];
        const idsParam = userIds.map((id) => `"${id}"`).join(",");
        const usersUrl = `${getSupabaseRestUrl("users")}?id=in.(${idsParam})&select=id,display_name,email,car_brand,car_model,profile_picture`;
        const usersResp = await fetch(usersUrl, { method: "GET", headers: getSupabaseHeaders() });
        const allUsers: Record<string, any>[] = usersResp.ok ? await usersResp.json() : [];

        const userMap = new Map<string, { displayName: string; carBrand?: string; carModel?: string; profilePicture?: string }>();
        for (const u of allUsers) {
          userMap.set(u.id, {
            displayName: u.display_name || u.email?.split('@')[0] || 'Driver',
            carBrand: u.car_brand,
            carModel: u.car_model,
            profilePicture: u.profile_picture,
          });
        }

        const postIds = selected.map((p) => p.id);
        let revCounts: Record<string, number> = {};
        let userRevs: Set<string> = new Set();

        if (postIds.length > 0) {
          const postIdFilter = postIds.map((id) => `"${id}"`).join(",");
          const revsUrl = `${getSupabaseRestUrl("post_revs")}?post_id=in.(${postIdFilter})&select=post_id,user_id`;
          const revsResp = await fetch(revsUrl, { method: "GET", headers: getSupabaseHeaders() });
          if (revsResp.ok) {
            const revRows: PostRevRow[] = await revsResp.json();
            for (const rev of revRows) {
              revCounts[rev.post_id] = (revCounts[rev.post_id] || 0) + 1;
              if (rev.user_id === input.userId) {
                userRevs.add(rev.post_id);
              }
            }
          }
        }

        console.log("[POSTS] Discover posts found:", selected.length);
        return selected.map((row) => ({
          id: row.id,
          userId: row.user_id,
          userName: userMap.get(row.user_id)?.displayName ?? "Driver",
          userProfilePicture: userMap.get(row.user_id)?.profilePicture,
          userCarBrand: userMap.get(row.user_id)?.carBrand,
          userCarModel: userMap.get(row.user_id)?.carModel,
          text: row.text,
          imageUrl: row.image_url,
          revCount: revCounts[row.id] || 0,
          isRevved: userRevs.has(row.id),
          createdAt: row.created_at,
        }));
      } catch (error) {
        console.error("[POSTS] Discover posts error:", error);
        return [];
      }
    }),

  getComments: publicProcedure
    .input(
      z.object({
        postId: z.string(),
        limit: z.number().optional().default(50),
      })
    )
    .query(async ({ input }) => {
      console.log("[POSTS] Fetching comments for post:", input.postId);
      if (!isDbConfigured()) return [];

      try {
        const commentsUrl = `${getSupabaseRestUrl("post_comments")}?post_id=eq.${encodeURIComponent(input.postId)}&order=created_at.asc&limit=${input.limit}`;
        const commentsResp = await fetch(commentsUrl, { method: "GET", headers: getSupabaseHeaders() });
        if (!commentsResp.ok) return [];

        const commentRows: CommentRow[] = await commentsResp.json();
        console.log("[POSTS] Comments fetched:", commentRows.length);

        const userIds = [...new Set(commentRows.map((c) => c.user_id))];
        let userMap = new Map<string, { displayName: string; profilePicture?: string }>();

        if (userIds.length > 0) {
          const idFilter = userIds.map((id) => `"${id}"`).join(",");
          const usersUrl = `${getSupabaseRestUrl("users")}?id=in.(${idFilter})&select=id,display_name,profile_picture`;
          const usersResp = await fetch(usersUrl, { method: "GET", headers: getSupabaseHeaders() });
          if (usersResp.ok) {
            const users: Record<string, any>[] = await usersResp.json();
            for (const u of users) {
              userMap.set(u.id, { displayName: u.display_name, profilePicture: u.profile_picture });
            }
          }
        }

        return commentRows.map((row) => ({
          id: row.id,
          postId: row.post_id,
          userId: row.user_id,
          userName: userMap.get(row.user_id)?.displayName ?? "Driver",
          userProfilePicture: userMap.get(row.user_id)?.profilePicture,
          text: row.text,
          createdAt: row.created_at,
        }));
      } catch (error) {
        console.error("[POSTS] Comments error:", error);
        return [];
      }
    }),

  addComment: publicProcedure
    .input(
      z.object({
        postId: z.string(),
        userId: z.string(),
        text: z.string().min(1).max(500),
      })
    )
    .mutation(async ({ input }) => {
      console.log("[POSTS] Adding comment to post:", input.postId, "by user:", input.userId);
      if (!isDbConfigured()) return { success: false, error: "Database not configured" };

      try {
        const id = `comment_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const row = {
          id,
          post_id: input.postId,
          user_id: input.userId,
          text: input.text.trim(),
          created_at: Date.now(),
        };

        const resp = await fetch(getSupabaseRestUrl("post_comments"), {
          method: "POST",
          headers: getSupabaseHeaders(),
          body: JSON.stringify(row),
        });

        if (!resp.ok) {
          const err = await resp.text();
          console.error("[POSTS] Comment insert failed:", err);
          return { success: false, error: "Failed to add comment" };
        }

        const postUrl = `${getSupabaseRestUrl("posts")}?id=eq.${encodeURIComponent(input.postId)}&select=user_id&limit=1`;
        const postResp = await fetch(postUrl, { method: "GET", headers: getSupabaseHeaders() });
        if (postResp.ok) {
          const postData = await postResp.json();
          const postOwnerId = postData[0]?.user_id;
          if (postOwnerId && postOwnerId !== input.userId) {
            const userUrl = `${getSupabaseRestUrl("users")}?id=eq.${encodeURIComponent(input.userId)}&select=display_name&limit=1`;
            const userResp = await fetch(userUrl, { method: "GET", headers: getSupabaseHeaders() });
            let fromName = "Someone";
            if (userResp.ok) {
              const userData = await userResp.json();
              fromName = userData[0]?.display_name || "Someone";
            }

            const notifId = `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            const notifRow = {
              id: notifId,
              user_id: postOwnerId,
              type: "post_comment",
              from_user_id: input.userId,
              post_id: input.postId,
              message: `${fromName} commented on your post`,
              read: false,
              created_at: Date.now(),
            };

            fetch(getSupabaseRestUrl("notifications"), {
              method: "POST",
              headers: getSupabaseHeaders(),
              body: JSON.stringify(notifRow),
            }).catch((err) => console.error("[POSTS] Comment notification insert error:", err));

            const ownerUrl = `${getSupabaseRestUrl("users")}?id=eq.${encodeURIComponent(postOwnerId)}&select=push_token&limit=1`;
            fetch(ownerUrl, { method: "GET", headers: getSupabaseHeaders() })
              .then(async (ownerResp) => {
                if (!ownerResp.ok) return;
                const ownerData = await ownerResp.json();
                const pushToken = ownerData[0]?.push_token;
                if (!pushToken) return;

                await fetch(EXPO_PUSH_URL, {
                  method: "POST",
                  headers: {
                    Accept: "application/json",
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify({
                    to: pushToken,
                    title: "💬 New Comment",
                    body: `${fromName} commented on your post`,
                    sound: "default",
                    data: { type: "post_comment", fromUserId: input.userId, postId: input.postId },
                    channelId: "default",
                    priority: "high",
                  }),
                });
              })
              .catch((err) => console.error("[POSTS] Comment push notification error:", err));
          }
        }

        console.log("[POSTS] Comment created:", id);
        return { success: true, commentId: id };
      } catch (error) {
        console.error("[POSTS] Add comment error:", error);
        return { success: false, error: "Network error" };
      }
    }),

  deleteComment: publicProcedure
    .input(
      z.object({
        commentId: z.string(),
        userId: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      console.log("[POSTS] Deleting comment:", input.commentId);
      if (!isDbConfigured()) return { success: false, error: "Database not configured" };

      try {
        const url = `${getSupabaseRestUrl("post_comments")}?id=eq.${encodeURIComponent(input.commentId)}&user_id=eq.${encodeURIComponent(input.userId)}`;
        const resp = await fetch(url, { method: "DELETE", headers: getSupabaseHeaders() });

        if (!resp.ok) {
          const err = await resp.text();
          console.error("[POSTS] Comment delete failed:", err);
          return { success: false, error: "Failed to delete comment" };
        }

        console.log("[POSTS] Comment deleted");
        return { success: true };
      } catch (error) {
        console.error("[POSTS] Delete comment error:", error);
        return { success: false, error: "Network error" };
      }
    }),

  getCommentCount: publicProcedure
    .input(
      z.object({
        postIds: z.array(z.string()),
      })
    )
    .query(async ({ input }) => {
      if (!isDbConfigured() || input.postIds.length === 0) return {};

      try {
        const postIdFilter = input.postIds.map((id) => `"${id}"`).join(",");
        const url = `${getSupabaseRestUrl("post_comments")}?post_id=in.(${postIdFilter})&select=post_id`;
        const resp = await fetch(url, { method: "GET", headers: getSupabaseHeaders() });
        if (!resp.ok) return {};

        const rows: { post_id: string }[] = await resp.json();
        const counts: Record<string, number> = {};
        for (const row of rows) {
          counts[row.post_id] = (counts[row.post_id] || 0) + 1;
        }
        return counts;
      } catch (error) {
        console.error("[POSTS] Comment count error:", error);
        return {};
      }
    }),

  deletePost: publicProcedure
    .input(
      z.object({
        postId: z.string(),
        userId: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      console.log("[POSTS] Deleting post:", input.postId);
      if (!isDbConfigured()) return { success: false, error: "Database not configured" };

      try {
        const revsUrl = `${getSupabaseRestUrl("post_revs")}?post_id=eq.${encodeURIComponent(input.postId)}`;
        await fetch(revsUrl, { method: "DELETE", headers: getSupabaseHeaders() });

        const commentsUrl = `${getSupabaseRestUrl("post_comments")}?post_id=eq.${encodeURIComponent(input.postId)}`;
        await fetch(commentsUrl, { method: "DELETE", headers: getSupabaseHeaders() });

        const notifsUrl = `${getSupabaseRestUrl("notifications")}?post_id=eq.${encodeURIComponent(input.postId)}`;
        await fetch(notifsUrl, { method: "DELETE", headers: getSupabaseHeaders() });

        const url = `${getSupabaseRestUrl("posts")}?id=eq.${encodeURIComponent(input.postId)}&user_id=eq.${encodeURIComponent(input.userId)}`;
        const resp = await fetch(url, { method: "DELETE", headers: getSupabaseHeaders() });

        if (!resp.ok) {
          const err = await resp.text();
          console.error("[POSTS] Delete failed:", err);
          return { success: false, error: "Failed to delete post" };
        }

        console.log("[POSTS] Post deleted");
        return { success: true };
      } catch (error) {
        console.error("[POSTS] Delete error:", error);
        return { success: false, error: "Network error" };
      }
    }),
});
