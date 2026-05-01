import * as z from "zod";
import { createTRPCRouter, publicProcedure } from "../create-context";
import type { DriveMeetup } from "../../../types/meetup";

import { getSupabaseRestUrl, getSupabaseHeaders, isDbConfigured } from "../db";

interface StoredUserWithLocation {
  id: string;
  displayName: string;
  pushToken: string;
  country?: string;
  carBrand?: string;
  carModel?: string;
  latitude?: number | null;
  longitude?: number | null;
}

function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

const MAX_PING_DISTANCE_KM = 100;

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

interface UserWithToken {
  id: string;
  displayName: string;
  pushToken: string;
  country?: string;
  carBrand?: string;
  carModel?: string;
}

interface TripData {
  id: string;
  userId: string;
  startTime: number;
  distance: number;
  duration: number;
  topSpeed: number;
  avgSpeed: number;
  corners: number;
}

interface WeeklyStats {
  totalTrips: number;
  totalDistance: number;
  topSpeed: number;
  totalDuration: number;
  corners: number;
}

interface ExpoPushMessage {
  to: string;
  title: string;
  body: string;
  sound?: string;
  data?: Record<string, unknown>;
  channelId?: string;
  priority?: 'default' | 'normal' | 'high';
}

interface ExpoPushTicket {
  status: "ok" | "error";
  id?: string;
  message?: string;
  details?: { error?: string };
}

async function sendExpoPushNotification(message: ExpoPushMessage): Promise<boolean> {
  console.log("[PUSH] Sending notification to:", message.to.substring(0, 30) + "...");
  
  try {
    const response = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Accept-Encoding": "gzip, deflate",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        to: message.to,
        title: message.title,
        body: message.body,
        sound: message.sound || "default",
        data: message.data || {},
        channelId: message.channelId || "default",
        priority: message.priority || "high",
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[PUSH] API error:", response.status, errorText);
      return false;
    }

    const result = await response.json();
    console.log("[PUSH] API response:", JSON.stringify(result));
    
    const ticket = result.data?.[0] as ExpoPushTicket | undefined;
    if (ticket?.status === "error") {
      console.error("[PUSH] Ticket error:", ticket.message, ticket.details);
      return false;
    }
    
    return true;
  } catch (error) {
    console.error("[PUSH] Network error:", error);
    return false;
  }
}

async function sendBatchNotifications(messages: ExpoPushMessage[]): Promise<{ sent: number; failed: number }> {
  let sent = 0;
  let failed = 0;

  const chunks: ExpoPushMessage[][] = [];
  const chunkSize = 100;
  
  for (let i = 0; i < messages.length; i += chunkSize) {
    chunks.push(messages.slice(i, i + chunkSize));
  }

  for (const chunk of chunks) {
    try {
      const response = await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: {
          "Accept": "application/json",
          "Accept-Encoding": "gzip, deflate",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(chunk.map(msg => ({
          to: msg.to,
          title: msg.title,
          body: msg.body,
          sound: msg.sound || "default",
          data: msg.data || {},
          channelId: msg.channelId || "default",
          priority: msg.priority || "high",
        }))),
      });

      if (response.ok) {
        const result = await response.json();
        const tickets = (result.data || []) as ExpoPushTicket[];
        sent += tickets.filter(t => t.status === "ok").length;
        failed += tickets.filter(t => t.status !== "ok").length;
      } else {
        failed += chunk.length;
      }
    } catch (error) {
      console.error("[PUSH] Batch error:", error);
      failed += chunk.length;
    }
  }

  return { sent, failed };
}

async function getUsersWithPushTokens(): Promise<UserWithToken[]> {
  if (!isDbConfigured()) {
    console.log("[PUSH] Database not configured");
    return [];
  }

  try {
    const response = await fetch(getSupabaseRestUrl("users"), {
      method: "GET",
      headers: getSupabaseHeaders(),
    });

    if (!response.ok) {
      console.error("[PUSH] Failed to fetch users");
      return [];
    }

    const data = await response.json();
    const users = data.items || data || [];
    
    return users
      .filter((u: any) => u.push_token)
      .map((u: any) => ({
        id: u.id,
        displayName: u.display_name,
        pushToken: u.push_token,
        country: u.country,
        carBrand: u.car_brand,
        carModel: u.car_model,
      }));
  } catch (error) {
    console.error("[PUSH] Error fetching users:", error);
    return [];
  }
}

async function getUsersWithLocationsByIds(ids: string[]): Promise<StoredUserWithLocation[]> {
  if (!isDbConfigured()) {
    console.log("[PUSH] Database not configured");
    return [];
  }
  const uniqueIds = Array.from(new Set(ids.filter(Boolean)));
  if (uniqueIds.length === 0) return [];

  try {
    const idsParam = uniqueIds.map(id => `"${id}"`).join(",");
    const url = `${getSupabaseRestUrl("users")}?select=id,display_name,push_token,country,car_brand,car_model,latitude,longitude&id=in.(${encodeURIComponent(idsParam)})&limit=${uniqueIds.length}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    let response: Response;
    try {
      response = await fetch(url, {
        method: "GET",
        headers: getSupabaseHeaders(),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      const text = await response.text();
      console.error("[PUSH] Failed to fetch users by ids:", response.status, text);
      return [];
    }

    const data = (await response.json()) as any;
    const users = (Array.isArray(data) ? data : (data?.items ?? [])) as any[];

    return users.map((u: any) => ({
      id: u.id,
      displayName: u.display_name,
      pushToken: u.push_token,
      country: u.country,
      carBrand: u.car_brand,
      carModel: u.car_model,
      latitude: u.latitude ?? null,
      longitude: u.longitude ?? null,
    }));
  } catch (error) {
    console.error("[PUSH] Error fetching users by ids:", error);
    return [];
  }
}

function meetupToDbRow(meetup: DriveMeetup): Record<string, unknown> {
  return {
    id: meetup.id,
    fromUserId: meetup.fromUserId,
    fromUserName: meetup.fromUserName,
    fromUserCar: meetup.fromUserCar ?? null,
    toUserId: meetup.toUserId,
    toUserName: meetup.toUserName,
    toUserCar: meetup.toUserCar ?? null,
    status: meetup.status,
    createdAt: meetup.createdAt,
    expiresAt: meetup.expiresAt,
    respondedAt: meetup.respondedAt ?? null,
    fromUserLocation: meetup.fromUserLocation ? JSON.stringify(meetup.fromUserLocation) : null,
    toUserLocation: meetup.toUserLocation ? JSON.stringify(meetup.toUserLocation) : null,
  };
}

function partialMeetupToDbRow(updates: Partial<DriveMeetup>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  if (updates.status !== undefined) result.status = updates.status;
  if (updates.respondedAt !== undefined) result.respondedAt = updates.respondedAt;
  if (updates.fromUserLocation !== undefined) result.fromUserLocation = updates.fromUserLocation ? JSON.stringify(updates.fromUserLocation) : null;
  if (updates.toUserLocation !== undefined) result.toUserLocation = updates.toUserLocation ? JSON.stringify(updates.toUserLocation) : null;
  if (updates.fromUserName !== undefined) result.fromUserName = updates.fromUserName;
  if (updates.toUserName !== undefined) result.toUserName = updates.toUserName;
  if (updates.fromUserCar !== undefined) result.fromUserCar = updates.fromUserCar;
  if (updates.toUserCar !== undefined) result.toUserCar = updates.toUserCar;
  if (updates.expiresAt !== undefined) result.expiresAt = updates.expiresAt;
  if (updates.createdAt !== undefined) result.createdAt = updates.createdAt;
  return result;
}

function parseJsonField(val: unknown): any {
  if (!val) return null;
  if (typeof val === 'object') return val;
  if (typeof val === 'string') {
    try { return JSON.parse(val); } catch { return null; }
  }
  return null;
}

function rowToMeetup(m: any): DriveMeetup {
  return {
    id: m.id,
    fromUserId: m.fromUserId,
    fromUserName: m.fromUserName,
    fromUserCar: m.fromUserCar ?? null,
    toUserId: m.toUserId,
    toUserName: m.toUserName,
    toUserCar: m.toUserCar ?? null,
    status: m.status,
    createdAt: m.createdAt,
    expiresAt: m.expiresAt,
    respondedAt: m.respondedAt ?? null,
    fromUserLocation: parseJsonField(m.fromUserLocation),
    toUserLocation: parseJsonField(m.toUserLocation),
  };
}

async function getAllMeetups(userId?: string): Promise<DriveMeetup[]> {
  if (!isDbConfigured()) {
    console.log("[PUSH] DB not configured, returning empty meetups");
    return [];
  }

  try {
    let url = getSupabaseRestUrl("meetups");
    if (userId) {
      url += `?status=in.(pending,accepted)&or=(fromUserId.eq.${userId},toUserId.eq.${userId})&order=createdAt.desc`;
    } else {
      url += `?order=createdAt.desc&limit=100`;
    }
    console.log("[PUSH] Fetching meetups with URL:", url);

    const response = await fetch(url, {
      method: "GET",
      headers: getSupabaseHeaders(),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      console.error("[PUSH] Failed to fetch meetups:", response.status, errText);
      
      if (userId) {
        console.log("[PUSH] Retrying with simple query...");
        const fallbackUrl = getSupabaseRestUrl("meetups") + "?order=createdAt.desc&limit=50";
        const fallbackResp = await fetch(fallbackUrl, { method: "GET", headers: getSupabaseHeaders() });
        if (fallbackResp.ok) {
          const fallbackData = await fallbackResp.json();
          const allRows = fallbackData.items || fallbackData || [];
          console.log("[PUSH] Fallback fetched rows:", allRows.length);
          const mapped = allRows.map(rowToMeetup);
          return mapped.filter((m: DriveMeetup) =>
            (m.status === 'pending' || m.status === 'accepted') &&
            (m.fromUserId === userId || m.toUserId === userId)
          );
        } else {
          const fallbackErr = await fallbackResp.text().catch(() => '');
          console.error("[PUSH] Fallback also failed:", fallbackResp.status, fallbackErr);
        }
      }
      return [];
    }

    const data = await response.json();
    const rows = data.items || data || [];
    console.log("[PUSH] Fetched meetups count:", rows.length);
    return rows.map(rowToMeetup);
  } catch (error) {
    console.error("[PUSH] Error fetching meetups:", error);
    return [];
  }
}

async function storeMeetup(meetup: DriveMeetup): Promise<boolean> {
  if (!isDbConfigured()) return false;

  try {
    const dbRow = meetupToDbRow(meetup);
    console.log("[PUSH] Storing meetup:", JSON.stringify(dbRow));
    const response = await fetch(getSupabaseRestUrl("meetups"), {
      method: "POST",
      headers: getSupabaseHeaders(),
      body: JSON.stringify(dbRow),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      console.error("[PUSH] Failed to store meetup:", response.status, errText);
      return false;
    }
    console.log("[PUSH] Meetup stored successfully:", meetup.id);
    return true;
  } catch (error) {
    console.error("[PUSH] Error storing meetup:", error);
    return false;
  }
}

async function updateMeetup(meetupId: string, updates: Partial<DriveMeetup>): Promise<boolean> {
  if (!isDbConfigured()) return false;

  try {
    const dbUpdates = partialMeetupToDbRow(updates);
    console.log("[PUSH] Updating meetup:", meetupId, JSON.stringify(dbUpdates));
    const response = await fetch(`${getSupabaseRestUrl("meetups")}?id=eq.${meetupId}`, {
      method: "PATCH",
      headers: getSupabaseHeaders(),
      body: JSON.stringify(dbUpdates),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      console.error("[PUSH] Failed to update meetup:", response.status, errText);
      return false;
    }
    console.log("[PUSH] Meetup updated successfully:", meetupId);
    return true;
  } catch (error) {
    console.error("[PUSH] Error updating meetup:", error);
    return false;
  }
}

async function getAllTrips(): Promise<TripData[]> {
  if (!isDbConfigured()) return [];

  try {
    const response = await fetch(getSupabaseRestUrl("trips"), {
      method: "GET",
      headers: getSupabaseHeaders(),
    });

    if (!response.ok) return [];

    const data = await response.json();
    return data.items || data || [];
  } catch (error) {
    console.error("[PUSH] Error fetching trips:", error);
    return [];
  }
}

function getWeekRange(): { start: Date; end: Date } {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const daysToLastMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  
  const lastMonday = new Date(now);
  lastMonday.setDate(now.getDate() - daysToLastMonday - 7);
  lastMonday.setHours(0, 0, 0, 0);
  
  const lastSunday = new Date(lastMonday);
  lastSunday.setDate(lastMonday.getDate() + 6);
  lastSunday.setHours(23, 59, 59, 999);
  
  return { start: lastMonday, end: lastSunday };
}

function calculateUserWeeklyStats(trips: TripData[], userId: string, weekStart: Date, weekEnd: Date): WeeklyStats {
  const userTrips = trips.filter(trip => {
    const tripDate = new Date(trip.startTime);
    return trip.userId === userId && tripDate >= weekStart && tripDate <= weekEnd;
  });

  if (userTrips.length === 0) {
    return { totalTrips: 0, totalDistance: 0, topSpeed: 0, totalDuration: 0, corners: 0 };
  }

  return {
    totalTrips: userTrips.length,
    totalDistance: userTrips.reduce((sum, t) => sum + t.distance, 0),
    topSpeed: Math.max(...userTrips.map(t => t.topSpeed)),
    totalDuration: userTrips.reduce((sum, t) => sum + t.duration, 0),
    corners: userTrips.reduce((sum, t) => sum + t.corners, 0),
  };
}

function generateNotificationContent(displayName: string, stats: WeeklyStats): { title: string; body: string } {
  if (stats.totalTrips === 0) {
    return {
      title: "📊 Weekly Recap Ready",
      body: `Hey ${displayName}! No trips this week? Time to hit the road! 🛣️`,
    };
  }

  const highlights: string[] = [];
  
  if (stats.totalTrips >= 5) {
    highlights.push(`🔥 ${stats.totalTrips} trips`);
  } else {
    highlights.push(`${stats.totalTrips} trip${stats.totalTrips > 1 ? 's' : ''}`);
  }
  
  highlights.push(`${stats.totalDistance.toFixed(1)} km`);
  
  if (stats.topSpeed >= 150) {
    highlights.push(`⚡ ${Math.round(stats.topSpeed)} km/h top`);
  }

  return {
    title: "📊 Your Weekly Recap is Ready!",
    body: `Hey ${displayName}! This week: ${highlights.join(' • ')}. Tap to see full stats!`,
  };
}

export const notificationsRouter = createTRPCRouter({
  sendTestNotification: publicProcedure
    .input(z.object({
      pushToken: z.string(),
      title: z.string().optional(),
      body: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      console.log("[PUSH] sendTestNotification called");
      console.log("[PUSH] Token:", input.pushToken.substring(0, 30) + "...");
      
      const title = input.title || "🚗 Test Notification";
      const body = input.body || "Push notifications are working! You'll receive weekly recaps here.";

      const success = await sendExpoPushNotification({
        to: input.pushToken,
        title,
        body,
        data: { type: "test" },
      });

      console.log("[PUSH] sendTestNotification result:", success);
      return { success };
    }),

  sendWeeklyRecapNotifications: publicProcedure
    .input(z.object({
      userId: z.string().optional(),
    }).optional())
    .mutation(async ({ input }) => {
      console.log("[PUSH] Starting weekly recap notifications...");

      const users = await getUsersWithPushTokens();
      const trips = await getAllTrips();
      const { start, end } = getWeekRange();

      const usersToNotify = input?.userId
        ? users.filter(u => u.id === input.userId)
        : users;

      if (usersToNotify.length === 0) {
        return { success: true, message: "No users with push tokens", sent: 0, failed: 0 };
      }

      const messages: ExpoPushMessage[] = usersToNotify.map(user => {
        const stats = calculateUserWeeklyStats(trips, user.id, start, end);
        const { title, body } = generateNotificationContent(user.displayName, stats);
        return {
          to: user.pushToken,
          title,
          body,
          data: { type: "weekly_recap", stats },
          channelId: "weekly-recap",
        };
      });

      const { sent, failed } = await sendBatchNotifications(messages);

      console.log(`[PUSH] Weekly recap: ${sent} sent, ${failed} failed`);
      return { success: true, totalUsers: usersToNotify.length, sent, failed };
    }),

  sendCustomNotification: publicProcedure
    .input(z.object({
      userId: z.string().optional(),
      title: z.string(),
      body: z.string(),
      data: z.record(z.string(), z.unknown()).optional(),
    }))
    .mutation(async ({ input }) => {
      const users = await getUsersWithPushTokens();
      
      const usersToNotify = input.userId
        ? users.filter(u => u.id === input.userId)
        : users;

      if (usersToNotify.length === 0) {
        return { success: false, message: "No users with push tokens", sent: 0 };
      }

      const messages: ExpoPushMessage[] = usersToNotify.map(user => ({
        to: user.pushToken,
        title: input.title,
        body: input.body,
        data: input.data,
      }));

      const { sent, failed } = await sendBatchNotifications(messages);
      return { success: true, sent, failed };
    }),

  sendDrivePing: publicProcedure
    .input(z.object({
      fromUserId: z.string(),
      fromUserName: z.string(),
      fromUserCar: z.string().optional(),
      fromUserIsPro: z.boolean().optional(),
      toUserId: z.string(),
      toUserName: z.string(),
      toUserCar: z.string().optional(),
      message: z.string().trim().max(140).optional(),
    }))
    .mutation(async ({ input }) => {
      console.log("[PUSH] Drive ping from", input.fromUserName, "to", input.toUserId);

      if (input.fromUserId === input.toUserId) {
        return { success: false, message: "You cannot ping yourself" };
      }

      const lookupUsers = await getUsersWithLocationsByIds([input.fromUserId, input.toUserId]);
      const fromUser = lookupUsers.find(u => u.id === input.fromUserId);
      const toUser = lookupUsers.find(u => u.id === input.toUserId);

      if (!toUser || !toUser.pushToken) {
        return { success: false, message: "User not found or notifications not enabled" };
      }

      if (!fromUser) {
        console.log("[PUSH] Sender row not found in DB:", input.fromUserId);
        return { success: false, message: "Your account couldn't be found. Try restarting the app." };
      }

      if (fromUser.latitude == null || fromUser.longitude == null) {
        console.log("[PUSH] Sender has no stored location");
        return { success: false, message: "Your location is not set. Please enable location services and try again." };
      }

      if (toUser.latitude == null || toUser.longitude == null) {
        console.log("[PUSH] Target user has no stored location");
        return { success: false, message: "This user has no location set. They need to open the app with location enabled." };
      }

      const distance = haversineDistance(
        fromUser.latitude,
        fromUser.longitude,
        toUser.latitude,
        toUser.longitude
      );
      console.log("[PUSH] Distance between users:", Math.round(distance), "km");

      if (distance > MAX_PING_DISTANCE_KM) {
        return { success: false, message: `This user is ${Math.round(distance)} km away. Pings only work within ${MAX_PING_DISTANCE_KM} km.` };
      }

      const meetupId = `meetup_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const now = Date.now();

      const meetup: DriveMeetup = {
        id: meetupId,
        fromUserId: input.fromUserId,
        fromUserName: input.fromUserName,
        fromUserCar: input.fromUserCar,
        fromUserIsPro: input.fromUserIsPro,
        toUserId: input.toUserId,
        toUserName: input.toUserName,
        toUserCar: input.toUserCar,
        message: input.message,
        status: 'pending',
        createdAt: now,
        expiresAt: now + 60 * 60 * 1000,
        fromUserLocation: {
          latitude: fromUser.latitude,
          longitude: fromUser.longitude,
          timestamp: now,
        },
        toUserLocation: {
          latitude: toUser.latitude,
          longitude: toUser.longitude,
          timestamp: now,
        },
      };

      await storeMeetup(meetup);

      const carInfo = input.fromUserCar ? ` (${input.fromUserCar})` : '';
      const distanceText = Math.round(distance) > 0 ? ` (~${Math.round(distance)} km away)` : '';
      const proPrefix = input.fromUserIsPro ? '👑 ' : '';
      const messageLine = input.message ? `\n"${input.message}"` : '';
      const success = await sendExpoPushNotification({
        to: toUser.pushToken,
        title: "🚗 Drive Invite!",
        body: `${proPrefix}${input.fromUserName}${carInfo} wants to go for a drive with you!${distanceText}${messageLine}`,
        sound: "default",
        priority: "high",
        data: {
          type: "drive_ping",
          meetupId,
          fromUserId: input.fromUserId,
          fromUserName: input.fromUserName,
          fromUserIsPro: input.fromUserIsPro ?? false,
          message: input.message ?? null,
        },
      });

      return { success, meetupId };
    }),

  respondToPing: publicProcedure
    .input(z.object({
      meetupId: z.string(),
      response: z.enum(['accepted', 'declined']),
      responderId: z.string(),
      responderName: z.string(),
    }))
    .mutation(async ({ input }) => {
      console.log("[PUSH] respondToPing called:", input.meetupId, input.response, "by", input.responderId);
      const meetups = await getAllMeetups(input.responderId);
      console.log("[PUSH] Found meetups for responder:", meetups.length, meetups.map(m => ({ id: m.id, status: m.status })));
      const meetup = meetups.find(m => m.id === input.meetupId);

      if (!meetup) {
        console.error("[PUSH] Meetup not found:", input.meetupId, "among", meetups.map(m => m.id));
        return { success: false, message: "Meetup not found" };
      }
      if (meetup.toUserId !== input.responderId) {
        console.error("[PUSH] Not authorized: meetup.toUserId=", meetup.toUserId, "responderId=", input.responderId);
        return { success: false, message: "Not authorized" };
      }

      const now = Date.now();
      const expiry = meetup.expiresAt || (meetup.createdAt + 60 * 60 * 1000);
      if (now > expiry) {
        await updateMeetup(input.meetupId, { status: 'expired' as any });
        return { success: false, message: "This ping has expired." };
      }

      const updateData: Partial<DriveMeetup> = {
        status: input.response,
        respondedAt: now,
      };

      if (input.response === 'accepted') {
        const lookupUsers = await getUsersWithLocationsByIds([input.responderId, meetup.fromUserId]);
        const responder = lookupUsers.find(u => u.id === input.responderId);
        if (responder?.latitude != null && responder?.longitude != null) {
          updateData.toUserLocation = {
            latitude: responder.latitude,
            longitude: responder.longitude,
            timestamp: now,
          };
        }
        const sender = lookupUsers.find(u => u.id === meetup.fromUserId);
        if (sender?.latitude != null && sender?.longitude != null) {
          updateData.fromUserLocation = {
            latitude: sender.latitude,
            longitude: sender.longitude,
            timestamp: now,
          };
        }
      }

      const updated = await updateMeetup(input.meetupId, updateData);

      if (!updated) return { success: false, message: "Failed to update meetup" };

      const users = await getUsersWithPushTokens();
      const pinger = users.find(u => u.id === meetup.fromUserId);

      if (pinger) {
        const title = input.response === 'accepted' ? "✅ Drive Accepted!" : "❌ Drive Declined";
        const body = input.response === 'accepted'
          ? `${input.responderName} accepted your drive invite! Open the app to navigate.`
          : `${input.responderName} declined your drive invite.`;

        await sendExpoPushNotification({
          to: pinger.pushToken,
          title,
          body,
          sound: "default",
          priority: "high",
          data: {
            type: input.response === 'accepted' ? 'ping_accepted' : 'ping_declined',
            meetupId: input.meetupId,
            fromUserId: input.responderId,
            fromUserName: input.responderName,
          },
        });
      }

      const fromLocation = updateData.fromUserLocation || meetup.fromUserLocation || null;
      const toLocation = updateData.toUserLocation || meetup.toUserLocation || null;
      return {
        success: true,
        status: input.response,
        fromUserLocation: fromLocation,
        toUserLocation: toLocation,
      };
    }),

  shareLocation: publicProcedure
    .input(z.object({
      meetupId: z.string(),
      userId: z.string(),
      userName: z.string(),
      latitude: z.number(),
      longitude: z.number(),
    }))
    .mutation(async ({ input }) => {
      const meetups = await getAllMeetups(input.userId);
      const meetup = meetups.find(m => m.id === input.meetupId);

      if (!meetup) return { success: false, message: "Meetup not found" };
      if (meetup.status !== 'accepted') return { success: false, message: "Meetup not accepted" };

      const isFromUser = meetup.fromUserId === input.userId;
      const isToUser = meetup.toUserId === input.userId;

      if (!isFromUser && !isToUser) return { success: false, message: "Not authorized" };

      const locationData = {
        latitude: input.latitude,
        longitude: input.longitude,
        timestamp: Date.now(),
      };

      const updateField = isToUser ? 'toUserLocation' : 'fromUserLocation';
      const updated = await updateMeetup(input.meetupId, { [updateField]: locationData });

      if (!updated) return { success: false, message: "Failed to share location" };

      const users = await getUsersWithPushTokens();
      const otherUserId = isToUser ? meetup.fromUserId : meetup.toUserId;
      const otherUser = users.find(u => u.id === otherUserId);

      if (otherUser) {
        await sendExpoPushNotification({
          to: otherUser.pushToken,
          title: "📍 Location Shared!",
          body: `${input.userName} shared their location for the meetup.`,
          sound: "default",
          priority: "high",
          data: {
            type: 'location_shared',
            meetupId: input.meetupId,
            fromUserId: input.userId,
            latitude: input.latitude,
            longitude: input.longitude,
          },
        });
      }

      return { success: true };
    }),

  getMeetups: publicProcedure
    .input(z.object({ userId: z.string() }))
    .query(async ({ input }) => {
      const meetups = await getAllMeetups(input.userId);
      const now = Date.now();
      
      const userMeetups = meetups.filter(m => 
        (m.fromUserId === input.userId || m.toUserId === input.userId) &&
        (m.status === 'pending' || m.status === 'accepted')
      );

      const expiredIds: string[] = [];
      const activeMeetups = userMeetups.filter(m => {
        const expiry = m.expiresAt || (m.createdAt + 60 * 60 * 1000);
        if (now > expiry) {
          expiredIds.push(m.id);
          return false;
        }
        return true;
      });

      for (const id of expiredIds) {
        updateMeetup(id, { status: 'expired' as any }).catch(() => {});
      }

      return activeMeetups;
    }),

  sendDriveReminderNotifications: publicProcedure
    .input(z.object({
      userId: z.string().optional(),
    }).optional())
    .mutation(async ({ input }) => {
      console.log("[PUSH] Starting Friday drive reminder notifications...");

      const users = await getUsersWithPushTokens();
      if (users.length === 0) {
        return { success: true, message: "No users with push tokens", sent: 0, failed: 0, skipped: 0 };
      }

      const now = new Date();
      const dayOfWeek = now.getDay();
      const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() - daysToMonday);
      weekStart.setHours(0, 0, 0, 0);
      const weekStartTs = weekStart.getTime();

      console.log("[PUSH] Week start:", weekStart.toISOString(), "ts:", weekStartTs);

      const trips = await getAllTrips();

      const usersToNotify = input?.userId
        ? users.filter(u => u.id === input.userId)
        : users;

      const messages: ExpoPushMessage[] = [];
      let skipped = 0;

      for (const user of usersToNotify) {
        const userTripsThisWeek = trips.filter(
          t => t.userId === user.id && t.startTime >= weekStartTs
        );

        if (userTripsThisWeek.length > 0) {
          console.log(`[PUSH] User ${user.displayName} has ${userTripsThisWeek.length} trips this week, skipping reminder`);
          skipped++;
          continue;
        }

        const carInfo = user.carBrand
          ? user.carModel
            ? `${user.carBrand} ${user.carModel}`
            : user.carBrand
          : null;

        const carText = carInfo ? ` Your ${carInfo} misses you!` : "";

        messages.push({
          to: user.pushToken,
          title: "🛣️ Time to hit the road!",
          body: `Hey ${user.displayName}, you haven't logged a drive this week.${carText} Get out there before the weekend!`,
          data: { type: "drive_reminder" },
          channelId: "reminders",
          priority: "default",
        });
      }

      if (messages.length === 0) {
        console.log("[PUSH] No users need a drive reminder");
        return { success: true, message: "All users already drove this week", sent: 0, failed: 0, skipped };
      }

      console.log(`[PUSH] Sending drive reminders to ${messages.length} users (${skipped} skipped)`);
      const { sent, failed } = await sendBatchNotifications(messages);

      console.log(`[PUSH] Drive reminders: ${sent} sent, ${failed} failed, ${skipped} skipped`);
      return { success: true, totalUsers: usersToNotify.length, sent, failed, skipped };
    }),

  cancelMeetup: publicProcedure
    .input(z.object({
      meetupId: z.string(),
      userId: z.string(),
      userName: z.string(),
    }))
    .mutation(async ({ input }) => {
      const meetups = await getAllMeetups(input.userId);
      const meetup = meetups.find(m => m.id === input.meetupId);

      if (!meetup) return { success: false, message: "Meetup not found" };

      const isParticipant = meetup.fromUserId === input.userId || meetup.toUserId === input.userId;
      if (!isParticipant) return { success: false, message: "Not authorized" };

      await updateMeetup(input.meetupId, { status: 'cancelled' });

      const users = await getUsersWithPushTokens();
      const otherUserId = meetup.fromUserId === input.userId ? meetup.toUserId : meetup.fromUserId;
      const otherUser = users.find(u => u.id === otherUserId);

      if (otherUser) {
        await sendExpoPushNotification({
          to: otherUser.pushToken,
          title: "❌ Meetup Cancelled",
          body: `${input.userName} cancelled the drive meetup.`,
          sound: "default",
          priority: "high",
          data: { type: 'meetup_cancelled', meetupId: input.meetupId },
        });
      }

      return { success: true };
    }),
});
