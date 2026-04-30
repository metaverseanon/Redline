import * as z from "zod";
import { createTRPCRouter, publicProcedure } from "../create-context";

import { getSupabaseRestUrl, getSupabaseHeaders, isDbConfigured } from "../db";

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

interface WeeklyStats {
  totalTrips: number;
  totalDistance: number;
  topSpeed: number;
  avgSpeed: number;
  totalDuration: number;
  maxGForce: number;
  best0to100: number | null;
  corners: number;
}

interface PersonalRecord {
  type: 'topSpeed' | 'distance' | 'gForce' | '0to100' | 'longestTrip' | 'corners';
  label: string;
  value: string;
  previousValue?: string;
  icon: string;
}

interface Milestone {
  label: string;
  description: string;
  icon: string;
}

interface LeaderboardEntry {
  rank: number;
  displayName: string;
  value: number;
  isCurrentUser: boolean;
}

interface UserTripData {
  id: string;
  email: string;
  displayName: string;
  country?: string;
  city?: string;
  pushToken?: string;
  timezone?: string;
  weeklyRecapEnabled?: boolean;
  trips: {
    id: string;
    startTime: number;
    distance: number;
    duration: number;
    topSpeed: number;
    avgSpeed: number;
    maxGForce?: number;
    time0to100?: number;
    corners: number;
    location?: {
      country?: string;
      city?: string;
    };
  }[];
}

const getWeeklyEmailHtml = (
  displayName: string,
  stats: WeeklyStats,
  leaderboard: LeaderboardEntry[],
  userRank: number | null,
  country: string,
  weekRange: string,
  personalRecords: PersonalRecord[],
  milestones: Milestone[]
) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your Weekly RedLine Recap</title>
</head>
<body style="margin: 0; padding: 0; background-color: #0a0a0a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" style="width: 100%; max-width: 600px; border-collapse: collapse;">
          
          <!-- Header -->
          <tr>
            <td style="padding: 40px 40px 30px; background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); border-radius: 16px 16px 0 0;">
              <img src="https://pub-e001eb4506b145aa938b5d3badbff6a5.r2.dev/attachments/pnnoj3a6b358u5apkxo4m" alt="RedLine" style="height: 36px; margin-bottom: 20px;" />
              <h1 style="margin: 0; font-size: 26px; font-weight: 700; color: #ffffff;">
                Weekly Recap 📊
              </h1>
              <p style="margin: 10px 0 0; font-size: 14px; color: #888888;">
                ${weekRange}
              </p>
            </td>
          </tr>
          
          <!-- Greeting -->
          <tr>
            <td style="padding: 30px 40px 20px; background-color: #1a1a1a;">
              <p style="margin: 0; font-size: 18px; line-height: 1.6; color: #ffffff;">
                Hey ${displayName}! 👋
              </p>
              <p style="margin: 10px 0 0; font-size: 15px; line-height: 1.6; color: #888888;">
                Here's how you performed this week on the road.
              </p>
            </td>
          </tr>
          
          <!-- Stats Section -->
          <tr>
            <td style="padding: 0 40px 30px; background-color: #1a1a1a;">
              <h2 style="margin: 0 0 20px; font-size: 18px; font-weight: 600; color: #ffffff; border-bottom: 1px solid #333; padding-bottom: 10px;">
                📈 Your Week in Numbers
              </h2>
              
              <!-- Stats Grid -->
              <table role="presentation" style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="width: 50%; padding: 12px; background: linear-gradient(135deg, #1e3a5f 0%, #1a2d47 100%); border-radius: 12px; vertical-align: top;">
                    <p style="margin: 0; font-size: 12px; color: #60a5fa; text-transform: uppercase; letter-spacing: 0.5px;">Total Trips</p>
                    <p style="margin: 5px 0 0; font-size: 28px; font-weight: 700; color: #ffffff;">${stats.totalTrips}</p>
                  </td>
                  <td style="width: 8px;"></td>
                  <td style="width: 50%; padding: 12px; background: linear-gradient(135deg, #1e3a5f 0%, #1a2d47 100%); border-radius: 12px; vertical-align: top;">
                    <p style="margin: 0; font-size: 12px; color: #4ade80; text-transform: uppercase; letter-spacing: 0.5px;">Distance</p>
                    <p style="margin: 5px 0 0; font-size: 28px; font-weight: 700; color: #ffffff;">${stats.totalDistance.toFixed(1)} <span style="font-size: 14px; color: #888;">km</span></p>
                  </td>
                </tr>
                <tr><td colspan="3" style="height: 8px;"></td></tr>
                <tr>
                  <td style="width: 50%; padding: 12px; background: linear-gradient(135deg, #5f1e1e 0%, #471a1a 100%); border-radius: 12px; vertical-align: top;">
                    <p style="margin: 0; font-size: 12px; color: #f87171; text-transform: uppercase; letter-spacing: 0.5px;">Top Speed</p>
                    <p style="margin: 5px 0 0; font-size: 28px; font-weight: 700; color: #ffffff;">${Math.round(stats.topSpeed)} <span style="font-size: 14px; color: #888;">km/h</span></p>
                  </td>
                  <td style="width: 8px;"></td>
                  <td style="width: 50%; padding: 12px; background: linear-gradient(135deg, #4a1e5f 0%, #371a47 100%); border-radius: 12px; vertical-align: top;">
                    <p style="margin: 0; font-size: 12px; color: #c084fc; text-transform: uppercase; letter-spacing: 0.5px;">Avg Speed</p>
                    <p style="margin: 5px 0 0; font-size: 28px; font-weight: 700; color: #ffffff;">${Math.round(stats.avgSpeed)} <span style="font-size: 14px; color: #888;">km/h</span></p>
                  </td>
                </tr>
                <tr><td colspan="3" style="height: 8px;"></td></tr>
                <tr>
                  <td style="width: 50%; padding: 12px; background: linear-gradient(135deg, #1e5f3a 0%, #1a4730 100%); border-radius: 12px; vertical-align: top;">
                    <p style="margin: 0; font-size: 12px; color: #34d399; text-transform: uppercase; letter-spacing: 0.5px;">Drive Time</p>
                    <p style="margin: 5px 0 0; font-size: 28px; font-weight: 700; color: #ffffff;">${formatDuration(stats.totalDuration)}</p>
                  </td>
                  <td style="width: 8px;"></td>
                  <td style="width: 50%; padding: 12px; background: linear-gradient(135deg, #5f4a1e 0%, #47371a 100%); border-radius: 12px; vertical-align: top;">
                    <p style="margin: 0; font-size: 12px; color: #fbbf24; text-transform: uppercase; letter-spacing: 0.5px;">Corners</p>
                    <p style="margin: 5px 0 0; font-size: 28px; font-weight: 700; color: #ffffff;">${stats.corners}</p>
                  </td>
                </tr>
                ${stats.maxGForce > 0 || stats.best0to100 ? `
                <tr><td colspan="3" style="height: 8px;"></td></tr>
                <tr>
                  ${stats.maxGForce > 0 ? `
                  <td style="width: 50%; padding: 12px; background: linear-gradient(135deg, #5f1e4a 0%, #471a37 100%); border-radius: 12px; vertical-align: top;">
                    <p style="margin: 0; font-size: 12px; color: #f472b6; text-transform: uppercase; letter-spacing: 0.5px;">Max G-Force</p>
                    <p style="margin: 5px 0 0; font-size: 28px; font-weight: 700; color: #ffffff;">${stats.maxGForce.toFixed(2)} <span style="font-size: 14px; color: #888;">G</span></p>
                  </td>
                  ` : '<td style="width: 50%;"></td>'}
                  <td style="width: 8px;"></td>
                  ${stats.best0to100 ? `
                  <td style="width: 50%; padding: 12px; background: linear-gradient(135deg, #1e4a5f 0%, #1a3747 100%); border-radius: 12px; vertical-align: top;">
                    <p style="margin: 0; font-size: 12px; color: #22d3ee; text-transform: uppercase; letter-spacing: 0.5px;">Best 0-100</p>
                    <p style="margin: 5px 0 0; font-size: 28px; font-weight: 700; color: #ffffff;">${stats.best0to100.toFixed(1)} <span style="font-size: 14px; color: #888;">sec</span></p>
                  </td>
                  ` : '<td style="width: 50%;"></td>'}
                </tr>
                ` : ''}
              </table>
            </td>
          </tr>
          
          <!-- Personal Records Section -->
          ${personalRecords.length > 0 ? `
          <tr>
            <td style="padding: 0 40px 30px; background-color: #1a1a1a;">
              <h2 style="margin: 0 0 20px; font-size: 18px; font-weight: 600; color: #ffffff; border-bottom: 1px solid #333; padding-bottom: 10px;">
                🏅 New Personal Records!
              </h2>
              
              <table role="presentation" style="width: 100%; border-collapse: collapse;">
                ${personalRecords.map((record, index) => `
                <tr>
                  <td style="padding: 14px 16px; background: linear-gradient(135deg, #2d1f1f 0%, #1f1a1a 100%); border-radius: ${index === 0 ? '12px 12px' : '0'} ${index === 0 ? '12px 12px' : '0'} ${index === personalRecords.length - 1 ? '12px 12px' : '0 0'}; ${index < personalRecords.length - 1 ? 'border-bottom: 1px solid #333;' : ''}">
                    <table role="presentation" style="width: 100%; border-collapse: collapse;">
                      <tr>
                        <td style="width: 40px; font-size: 24px;">${record.icon}</td>
                        <td>
                          <p style="margin: 0; font-size: 14px; color: #f87171; font-weight: 600;">${record.label}</p>
                          <p style="margin: 4px 0 0; font-size: 13px; color: #888;">${record.previousValue ? `Previous: ${record.previousValue}` : 'First record!'}</p>
                        </td>
                        <td style="text-align: right;">
                          <p style="margin: 0; font-size: 20px; font-weight: 700; color: #ffffff;">${record.value}</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                `).join('')}
              </table>
            </td>
          </tr>
          ` : ''}
          
          <!-- Milestones Section -->
          ${milestones.length > 0 ? `
          <tr>
            <td style="padding: 0 40px 30px; background-color: #1a1a1a;">
              <h2 style="margin: 0 0 20px; font-size: 18px; font-weight: 600; color: #ffffff; border-bottom: 1px solid #333; padding-bottom: 10px;">
                🎯 Milestones Unlocked!
              </h2>
              
              <table role="presentation" style="width: 100%; border-collapse: collapse;">
                ${milestones.map((milestone, index) => `
                <tr>
                  <td style="padding: 16px; background: linear-gradient(135deg, #1f2d1f 0%, #1a1f1a 100%); border-radius: ${index === 0 ? '12px 12px' : '0'} ${index === 0 ? '12px 12px' : '0'} ${index === milestones.length - 1 ? '12px 12px' : '0 0'}; ${index < milestones.length - 1 ? 'border-bottom: 1px solid #333;' : ''}">
                    <table role="presentation" style="width: 100%; border-collapse: collapse;">
                      <tr>
                        <td style="width: 50px; font-size: 28px; text-align: center;">${milestone.icon}</td>
                        <td>
                          <p style="margin: 0; font-size: 15px; color: #4ade80; font-weight: 600;">${milestone.label}</p>
                          <p style="margin: 4px 0 0; font-size: 13px; color: #888;">${milestone.description}</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                `).join('')}
              </table>
            </td>
          </tr>
          ` : ''}
          
          <!-- Leaderboard Section -->
          ${leaderboard.length > 0 ? `
          <tr>
            <td style="padding: 0 40px 30px; background-color: #1a1a1a;">
              <h2 style="margin: 0 0 20px; font-size: 18px; font-weight: 600; color: #ffffff; border-bottom: 1px solid #333; padding-bottom: 10px;">
                🏆 ${country} Leaderboard - Top Speed
              </h2>
              
              <table role="presentation" style="width: 100%; border-collapse: collapse;">
                ${leaderboard.map((entry, index) => `
                <tr>
                  <td style="padding: 12px 15px; background-color: ${entry.isCurrentUser ? '#2a2a4a' : '#252525'}; border-radius: ${index === 0 ? '12px 12px 0 0' : index === leaderboard.length - 1 ? '0 0 12px 12px' : '0'}; ${index < leaderboard.length - 1 ? 'border-bottom: 1px solid #333;' : ''}">
                    <table role="presentation" style="width: 100%; border-collapse: collapse;">
                      <tr>
                        <td style="width: 40px;">
                          <span style="display: inline-block; width: 28px; height: 28px; line-height: 28px; text-align: center; border-radius: 50%; background-color: ${entry.rank === 1 ? '#FFD700' : entry.rank === 2 ? '#C0C0C0' : entry.rank === 3 ? '#CD7F32' : '#444'}; color: ${entry.rank <= 3 ? '#000' : '#fff'}; font-weight: 700; font-size: 12px;">
                            ${entry.rank}
                          </span>
                        </td>
                        <td style="color: ${entry.isCurrentUser ? '#60a5fa' : '#ffffff'}; font-size: 15px; font-weight: ${entry.isCurrentUser ? '600' : '400'};">
                          ${entry.displayName} ${entry.isCurrentUser ? '(You)' : ''}
                        </td>
                        <td style="text-align: right; color: #fbbf24; font-size: 15px; font-weight: 600;">
                          ${Math.round(entry.value)} km/h
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                `).join('')}
              </table>
              
              ${userRank && userRank > 10 ? `
              <p style="margin: 15px 0 0; font-size: 14px; color: #888888; text-align: center;">
                You're currently ranked <strong style="color: #60a5fa;">#${userRank}</strong> in ${country}. Keep pushing! 🚀
              </p>
              ` : ''}
            </td>
          </tr>
          ` : `
          <tr>
            <td style="padding: 0 40px 30px; background-color: #1a1a1a;">
              <div style="padding: 20px; background-color: #252525; border-radius: 12px; text-align: center;">
                <p style="margin: 0; font-size: 14px; color: #888888;">
                  No regional leaderboard available yet. Complete more trips to see how you rank! 🏎️
                </p>
              </div>
            </td>
          </tr>
          `}
          
          <!-- Motivational CTA -->
          <tr>
            <td style="padding: 0 40px 30px; background-color: #1a1a1a;">
              <div style="padding: 25px; background: linear-gradient(135deg, #CC0000 0%, #8B0000 100%); border-radius: 12px; text-align: center;">
                <p style="margin: 0; font-size: 16px; font-weight: 600; color: #ffffff;">
                  ${stats.totalTrips === 0 ? "No trips this week? Time to hit the road! 🛣️" : stats.totalTrips >= 5 ? "Amazing week! You're on fire! 🔥" : "Good progress! Keep pushing those limits! 💪"}
                </p>
              </div>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding: 30px 40px; background-color: #141414; border-radius: 0 0 16px 16px; text-align: center;">
              <img src="https://pub-e001eb4506b145aa938b5d3badbff6a5.r2.dev/attachments/pnnoj3a6b358u5apkxo4m" alt="RedLine" style="height: 32px; margin-bottom: 15px;" />
              <p style="margin: 0; font-size: 13px; color: #666;">
                Drive safe and enjoy the journey! 🛣️
              </p>
              <p style="margin: 15px 0 0; font-size: 11px; color: #444;">
                © ${new Date().getFullYear()} RedLine. All rights reserved.
              </p>
            </td>
          </tr>
          
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;

function formatDuration(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (hrs > 0) {
    return `${hrs}h ${mins}m`;
  }
  return `${mins}m`;
}

function getWeekRange(): { start: Date; end: Date; label: string } {
  const now = new Date();
  const dayOfWeek = now.getDay();

  let mondayOffset: number;
  if (dayOfWeek === 0) {
    mondayOffset = 6;
  } else {
    mondayOffset = dayOfWeek - 1 + 7;
  }

  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - mondayOffset);
  weekStart.setHours(0, 0, 0, 0);

  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  weekEnd.setHours(23, 59, 59, 999);

  console.log(`[WEEKLY] Week range: ${weekStart.toISOString()} to ${weekEnd.toISOString()} (today is day ${dayOfWeek})`);

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  return {
    start: weekStart,
    end: weekEnd,
    label: `${formatDate(weekStart)} - ${formatDate(weekEnd)}, ${weekEnd.getFullYear()}`
  };
}

function mapSupabaseUser(row: Record<string, unknown>): Omit<UserTripData, 'trips'> {
  return {
    id: row.id as string,
    email: row.email as string,
    displayName: (row.display_name as string) || 'Driver',
    country: row.country as string | undefined,
    city: row.city as string | undefined,
    pushToken: row.push_token as string | undefined,
    timezone: row.timezone as string | undefined,
    weeklyRecapEnabled: row.weekly_recap_enabled as boolean | undefined,
  };
}

function mapSupabaseTrip(row: Record<string, unknown>): UserTripData['trips'][number] {
  return {
    id: row.id as string,
    startTime: row.start_time as number,
    distance: (row.distance as number) || 0,
    duration: (row.duration as number) || 0,
    topSpeed: (row.top_speed as number) || 0,
    avgSpeed: (row.avg_speed as number) || 0,
    maxGForce: row.max_g_force as number | undefined,
    time0to100: row.time_0_to_100 as number | undefined,
    corners: (row.corners as number) || 0,
    location: (row.country || row.city) ? {
      country: row.country as string | undefined,
      city: row.city as string | undefined,
    } : undefined,
  };
}

async function getAllUsersWithTrips(): Promise<UserTripData[]> {
  if (!isDbConfigured()) {
    console.log("Database not configured");
    return [];
  }

  try {
    const usersResponse = await fetch(getSupabaseRestUrl("users"), {
      method: "GET",
      headers: getSupabaseHeaders(),
    });

    if (!usersResponse.ok) {
      console.error("Failed to fetch users:", usersResponse.status);
      return [];
    }

    const usersRaw = await usersResponse.json();
    const usersArray = Array.isArray(usersRaw) ? usersRaw : (usersRaw.items || []);

    const tripsResponse = await fetch(getSupabaseRestUrl("trips"), {
      method: "GET",
      headers: getSupabaseHeaders(),
    });

    let allTripsRaw: Record<string, unknown>[] = [];
    if (tripsResponse.ok) {
      const tripsData = await tripsResponse.json();
      allTripsRaw = Array.isArray(tripsData) ? tripsData : (tripsData.items || []);
    }

    const tripsByUserId = new Map<string, UserTripData['trips']>();
    for (const raw of allTripsRaw) {
      const userId = raw.user_id as string;
      if (!userId) continue;
      const mapped = mapSupabaseTrip(raw);
      const existing = tripsByUserId.get(userId) || [];
      existing.push(mapped);
      tripsByUserId.set(userId, existing);
    }

    console.log(`[WEEKLY] Fetched ${usersArray.length} users and ${allTripsRaw.length} trips across ${tripsByUserId.size} users`);

    return usersArray.map((row: Record<string, unknown>) => {
      const user = mapSupabaseUser(row);
      const userTrips = tripsByUserId.get(user.id) || [];
      console.log(`[WEEKLY] User ${user.displayName} (${user.id}): ${userTrips.length} trips`);
      return { ...user, trips: userTrips };
    });
  } catch (error) {
    console.error("Error fetching users with trips:", error);
    return [];
  }
}

function calculateWeeklyStats(trips: UserTripData['trips'], weekStart: Date, weekEnd: Date): WeeklyStats {
  const weeklyTrips = trips.filter(trip => {
    const tripDate = new Date(trip.startTime);
    return tripDate >= weekStart && tripDate <= weekEnd;
  });

  if (weeklyTrips.length === 0) {
    return {
      totalTrips: 0,
      totalDistance: 0,
      topSpeed: 0,
      avgSpeed: 0,
      totalDuration: 0,
      maxGForce: 0,
      best0to100: null,
      corners: 0,
    };
  }

  const totalDistance = weeklyTrips.reduce((sum, t) => sum + t.distance, 0);
  const totalDuration = weeklyTrips.reduce((sum, t) => sum + t.duration, 0);
  const topSpeed = Math.max(...weeklyTrips.map(t => t.topSpeed));
  const avgSpeed = totalDuration > 0 ? (totalDistance / totalDuration) * 3600 : 0;
  const maxGForce = Math.max(...weeklyTrips.map(t => t.maxGForce || 0));
  const times0to100 = weeklyTrips.map(t => t.time0to100).filter((t): t is number => t !== undefined && t > 0);
  const best0to100 = times0to100.length > 0 ? Math.min(...times0to100) : null;
  const corners = weeklyTrips.reduce((sum, t) => sum + t.corners, 0);

  return {
    totalTrips: weeklyTrips.length,
    totalDistance,
    topSpeed,
    avgSpeed,
    totalDuration,
    maxGForce,
    best0to100,
    corners,
  };
}

function calculatePersonalRecords(
  allTrips: UserTripData['trips'],
  weeklyTrips: UserTripData['trips'],
  weekStart: Date
): PersonalRecord[] {
  const records: PersonalRecord[] = [];
  
  if (weeklyTrips.length === 0) return records;
  
  const tripsBeforeThisWeek = allTrips.filter(t => new Date(t.startTime) < weekStart);
  
  const weekTopSpeed = Math.max(...weeklyTrips.map(t => t.topSpeed));
  const prevTopSpeed = tripsBeforeThisWeek.length > 0 ? Math.max(...tripsBeforeThisWeek.map(t => t.topSpeed)) : 0;
  if (weekTopSpeed > prevTopSpeed && weekTopSpeed > 0) {
    records.push({
      type: 'topSpeed',
      label: 'Top Speed',
      value: `${Math.round(weekTopSpeed)} km/h`,
      previousValue: prevTopSpeed > 0 ? `${Math.round(prevTopSpeed)} km/h` : undefined,
      icon: '⚡',
    });
  }
  
  const weekLongestTrip = Math.max(...weeklyTrips.map(t => t.distance));
  const prevLongestTrip = tripsBeforeThisWeek.length > 0 ? Math.max(...tripsBeforeThisWeek.map(t => t.distance)) : 0;
  if (weekLongestTrip > prevLongestTrip && weekLongestTrip > 0) {
    records.push({
      type: 'longestTrip',
      label: 'Longest Trip',
      value: `${weekLongestTrip.toFixed(1)} km`,
      previousValue: prevLongestTrip > 0 ? `${prevLongestTrip.toFixed(1)} km` : undefined,
      icon: '🛣️',
    });
  }
  
  const weekMaxGForce = Math.max(...weeklyTrips.map(t => t.maxGForce || 0));
  const prevMaxGForce = tripsBeforeThisWeek.length > 0 ? Math.max(...tripsBeforeThisWeek.map(t => t.maxGForce || 0)) : 0;
  if (weekMaxGForce > prevMaxGForce && weekMaxGForce > 0) {
    records.push({
      type: 'gForce',
      label: 'Max G-Force',
      value: `${weekMaxGForce.toFixed(2)} G`,
      previousValue: prevMaxGForce > 0 ? `${prevMaxGForce.toFixed(2)} G` : undefined,
      icon: '🎢',
    });
  }
  
  const weekTimes0to100 = weeklyTrips.map(t => t.time0to100).filter((t): t is number => t !== undefined && t > 0);
  const prevTimes0to100 = tripsBeforeThisWeek.map(t => t.time0to100).filter((t): t is number => t !== undefined && t > 0);
  const weekBest0to100 = weekTimes0to100.length > 0 ? Math.min(...weekTimes0to100) : null;
  const prevBest0to100 = prevTimes0to100.length > 0 ? Math.min(...prevTimes0to100) : null;
  if (weekBest0to100 && (!prevBest0to100 || weekBest0to100 < prevBest0to100)) {
    records.push({
      type: '0to100',
      label: 'Best 0-100 km/h',
      value: `${weekBest0to100.toFixed(1)} sec`,
      previousValue: prevBest0to100 ? `${prevBest0to100.toFixed(1)} sec` : undefined,
      icon: '🚀',
    });
  }
  
  const weekMostCorners = Math.max(...weeklyTrips.map(t => t.corners));
  const prevMostCorners = tripsBeforeThisWeek.length > 0 ? Math.max(...tripsBeforeThisWeek.map(t => t.corners)) : 0;
  if (weekMostCorners > prevMostCorners && weekMostCorners > 0) {
    records.push({
      type: 'corners',
      label: 'Most Corners in a Trip',
      value: `${weekMostCorners}`,
      previousValue: prevMostCorners > 0 ? `${prevMostCorners}` : undefined,
      icon: '🔄',
    });
  }
  
  return records;
}

function calculateMilestones(
  allTrips: UserTripData['trips'],
  weekStart: Date,
  weekEnd: Date
): Milestone[] {
  const milestones: Milestone[] = [];
  
  const tripsBeforeThisWeek = allTrips.filter(t => new Date(t.startTime) < weekStart);
  const tripsUpToThisWeek = allTrips.filter(t => new Date(t.startTime) <= weekEnd);
  
  const prevTotalDistance = tripsBeforeThisWeek.reduce((sum, t) => sum + t.distance, 0);
  const totalDistance = tripsUpToThisWeek.reduce((sum, t) => sum + t.distance, 0);
  
  const distanceMilestones = [100, 500, 1000, 2500, 5000, 10000, 25000, 50000, 100000];
  for (const milestone of distanceMilestones) {
    if (prevTotalDistance < milestone && totalDistance >= milestone) {
      milestones.push({
        label: `${milestone.toLocaleString()} km Club`,
        description: `You've driven a total of ${milestone.toLocaleString()} kilometers!`,
        icon: milestone >= 10000 ? '🏆' : milestone >= 1000 ? '🥇' : '🎖️',
      });
    }
  }
  
  const prevTotalTrips = tripsBeforeThisWeek.length;
  const totalTrips = tripsUpToThisWeek.length;
  
  const tripMilestones = [10, 25, 50, 100, 250, 500, 1000];
  for (const milestone of tripMilestones) {
    if (prevTotalTrips < milestone && totalTrips >= milestone) {
      milestones.push({
        label: `${milestone} Trips`,
        description: `You've completed ${milestone} trips!`,
        icon: milestone >= 100 ? '🌟' : '⭐',
      });
    }
  }
  
  const weeklyTrips = allTrips.filter(t => {
    const d = new Date(t.startTime);
    return d >= weekStart && d <= weekEnd;
  });
  
  const prevTopSpeed = tripsBeforeThisWeek.length > 0 ? Math.max(...tripsBeforeThisWeek.map(t => t.topSpeed)) : 0;
  const weekTopSpeed = weeklyTrips.length > 0 ? Math.max(...weeklyTrips.map(t => t.topSpeed)) : 0;
  
  const speedMilestones = [100, 150, 200, 250, 300];
  for (const milestone of speedMilestones) {
    if (prevTopSpeed < milestone && weekTopSpeed >= milestone) {
      milestones.push({
        label: `${milestone} km/h Club`,
        description: `You reached ${milestone} km/h for the first time!`,
        icon: milestone >= 200 ? '🔥' : '💨',
      });
    }
  }
  
  const prevTotalCorners = tripsBeforeThisWeek.reduce((sum, t) => sum + t.corners, 0);
  const totalCorners = tripsUpToThisWeek.reduce((sum, t) => sum + t.corners, 0);
  
  const cornerMilestones = [100, 500, 1000, 5000, 10000];
  for (const milestone of cornerMilestones) {
    if (prevTotalCorners < milestone && totalCorners >= milestone) {
      milestones.push({
        label: `Corner Master (${milestone.toLocaleString()})`,
        description: `You've taken ${milestone.toLocaleString()} corners total!`,
        icon: '🔄',
      });
    }
  }
  
  return milestones;
}

function calculateRegionalLeaderboard(
  users: UserTripData[],
  country: string,
  currentUserId: string
): { leaderboard: LeaderboardEntry[]; userRank: number | null } {
  const usersInCountry = users.filter(u => u.country === country && u.trips.length > 0);
  
  const userTopSpeeds = usersInCountry.map(user => {
    const topSpeed = user.trips.length > 0 ? Math.max(...user.trips.map(t => t.topSpeed)) : 0;
    return {
      id: user.id,
      displayName: user.displayName,
      topSpeed,
    };
  });

  userTopSpeeds.sort((a, b) => b.topSpeed - a.topSpeed);

  const userRankIndex = userTopSpeeds.findIndex(u => u.id === currentUserId);
  const userRank = userRankIndex >= 0 ? userRankIndex + 1 : null;

  const top10 = userTopSpeeds.slice(0, 10).map((user, index) => ({
    rank: index + 1,
    displayName: user.displayName,
    value: user.topSpeed,
    isCurrentUser: user.id === currentUserId,
  }));

  return { leaderboard: top10, userRank };
}

function isTargetHourInTimezone(timezone: string, targetHour: number): boolean {
  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      hour12: false,
    });
    const hourStr = formatter.format(now);
    const currentHour = parseInt(hourStr, 10);
    return currentHour === targetHour;
  } catch (error) {
    console.error(`Invalid timezone: ${timezone}`, error);
    return false;
  }
}

function isSundayInTimezone(timezone: string): boolean {
  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      weekday: 'long',
    });
    return formatter.format(now) === 'Sunday';
  } catch (error) {
    console.error(`Invalid timezone: ${timezone}`, error);
    return false;
  }
}

interface ExpoPushMessage {
  to: string;
  title: string;
  body: string;
  sound?: string;
  data?: Record<string, unknown>;
  channelId?: string;
}

async function sendPushNotification(message: ExpoPushMessage): Promise<boolean> {
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
        channelId: message.channelId || "weekly-recap",
      }),
    });

    if (!response.ok) {
      console.error("[PUSH] API error:", response.status);
      return false;
    }

    const result = await response.json();
    const ticket = result.data?.[0];
    return ticket?.status !== "error";
  } catch (error) {
    console.error("[PUSH] Network error:", error);
    return false;
  }
}

function generatePushContent(
  displayName: string,
  stats: WeeklyStats,
  personalRecords: PersonalRecord[],
  milestones: Milestone[]
): { title: string; body: string } {
  if (stats.totalTrips === 0) {
    return {
      title: "📊 Weekly Recap Ready",
      body: `Hey ${displayName}! No trips this week? Time to hit the road! 🛣️`,
    };
  }

  const highlights: string[] = [];
  highlights.push(`${stats.totalTrips} trip${stats.totalTrips > 1 ? 's' : ''}`);
  highlights.push(`${stats.totalDistance.toFixed(1)} km`);
  
  if (stats.topSpeed >= 150) {
    highlights.push(`⚡ ${Math.round(stats.topSpeed)} km/h top`);
  }

  let title = "📊 Your Weekly Recap is Ready!";
  let body = `Hey ${displayName}! This week: ${highlights.join(' • ')}.`;

  if (personalRecords.length > 0) {
    title = "🏅 New Personal Records!";
    body += ` You set ${personalRecords.length} new record${personalRecords.length > 1 ? 's' : ''}!`;
  } else if (milestones.length > 0) {
    title = "🎯 Milestone Unlocked!";
    body += ` ${milestones[0].label}!`;
  }

  return { title, body: body + " Tap to see full stats!" };
}

async function sendWeeklyPushNotification(
  pushToken: string,
  displayName: string,
  stats: WeeklyStats,
  personalRecords: PersonalRecord[],
  milestones: Milestone[]
): Promise<boolean> {
  const { title, body } = generatePushContent(displayName, stats, personalRecords, milestones);
  
  return sendPushNotification({
    to: pushToken,
    title,
    body,
    data: { 
      type: "weekly_recap",
      hasRecords: personalRecords.length > 0,
      hasMilestones: milestones.length > 0,
    },
    channelId: "weekly-recap",
  });
}

async function sendWeeklyEmail(
  email: string,
  displayName: string,
  stats: WeeklyStats,
  leaderboard: LeaderboardEntry[],
  userRank: number | null,
  country: string,
  weekRange: string,
  personalRecords: PersonalRecord[],
  milestones: Milestone[]
): Promise<boolean> {
  if (!RESEND_API_KEY) {
    console.log("RESEND_API_KEY not configured, skipping weekly email");
    return false;
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "RedLine <info@redlineapp.io>",
        to: [email],
        subject: `Your Weekly RedLine Recap 📊 - ${stats.totalTrips} trips, ${stats.totalDistance.toFixed(1)} km`,
        html: getWeeklyEmailHtml(displayName, stats, leaderboard, userRank, country, weekRange, personalRecords, milestones),
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("Failed to send weekly email:", error);
      return false;
    }

    console.log("Weekly email sent to:", email);
    return true;
  } catch (error) {
    console.error("Error sending weekly email:", error);
    return false;
  }
}

export const weeklyEmailRouter = createTRPCRouter({
  sendWeeklyRecap: publicProcedure
    .input(z.object({
      userId: z.string().optional(),
    }).optional())
    .mutation(async ({ input }) => {
      console.log("Starting weekly recap email job...");
      
      const users = await getAllUsersWithTrips();
      const { start, end, label } = getWeekRange();
      
      let sentCount = 0;
      let failedCount = 0;
      const results: { email: string; success: boolean }[] = [];

      const usersToProcess = input?.userId 
        ? users.filter(u => u.id === input.userId)
        : users;

      for (const user of usersToProcess) {
        if (user.weeklyRecapEnabled === false) {
          console.log(`Skipping weekly recap for ${user.email} - user has disabled weekly recaps`);
          continue;
        }

        const stats = calculateWeeklyStats(user.trips, start, end);
        const country = user.country || 'Global';
        const { leaderboard, userRank } = calculateRegionalLeaderboard(users, country, user.id);

        const personalRecords = calculatePersonalRecords(user.trips, user.trips.filter(t => {
          const d = new Date(t.startTime);
          return d >= start && d <= end;
        }), start);
        const milestones = calculateMilestones(user.trips, start, end);

        let emailSuccess = false;
        if (user.email) {
          emailSuccess = await sendWeeklyEmail(
            user.email,
            user.displayName,
            stats,
            leaderboard,
            userRank,
            country,
            label,
            personalRecords,
            milestones
          );
        }

        results.push({ email: user.email || 'no-email', success: emailSuccess });
        if (emailSuccess) {
          sentCount++;
        } else if (user.email) {
          failedCount++;
        }
      }

      console.log(`Weekly recap job completed: ${sentCount} sent, ${failedCount} failed`);
      
      return {
        success: true,
        totalUsers: usersToProcess.length,
        sent: sentCount,
        failed: failedCount,
        weekRange: label,
        results,
      };
    }),

  sendWeeklyRecapWithPush: publicProcedure
    .input(z.object({
      userId: z.string().optional(),
    }).optional())
    .mutation(async ({ input }) => {
      console.log("Starting weekly recap (email + push) job...");
      
      const users = await getAllUsersWithTrips();
      const { start, end, label } = getWeekRange();
      
      let emailsSent = 0;
      let emailsFailed = 0;
      let pushSent = 0;
      let pushFailed = 0;

      const usersToProcess = input?.userId 
        ? users.filter(u => u.id === input.userId)
        : users;

      for (const user of usersToProcess) {
        if (user.weeklyRecapEnabled === false) {
          console.log(`Skipping weekly recap for ${user.email} - user has disabled weekly recaps`);
          continue;
        }

        const stats = calculateWeeklyStats(user.trips, start, end);
        const country = user.country || 'Global';
        const { leaderboard, userRank } = calculateRegionalLeaderboard(users, country, user.id);

        const personalRecords = calculatePersonalRecords(user.trips, user.trips.filter(t => {
          const d = new Date(t.startTime);
          return d >= start && d <= end;
        }), start);
        const milestones = calculateMilestones(user.trips, start, end);

        // Send email if user has email
        if (user.email) {
          const emailSuccess = await sendWeeklyEmail(
            user.email,
            user.displayName,
            stats,
            leaderboard,
            userRank,
            country,
            label,
            personalRecords,
            milestones
          );
          if (emailSuccess) emailsSent++;
          else emailsFailed++;
        }

        // Send push notification if user has push token
        if (user.pushToken) {
          const pushSuccess = await sendWeeklyPushNotification(
            user.pushToken,
            user.displayName,
            stats,
            personalRecords,
            milestones
          );
          if (pushSuccess) pushSent++;
          else pushFailed++;
        }
      }

      console.log(`Weekly recap completed: ${emailsSent} emails, ${pushSent} push notifications sent`);
      
      return {
        success: true,
        totalUsers: usersToProcess.length,
        emails: { sent: emailsSent, failed: emailsFailed },
        push: { sent: pushSent, failed: pushFailed },
        weekRange: label,
        scheduledFor: "Sundays at 9:00 PM (user's local time)",
      };
    }),

  sendWeeklyRecapByTimezone: publicProcedure
    .input(z.object({
      targetHour: z.number().min(0).max(23).default(21),
      forceSend: z.boolean().default(false),
    }).optional())
    .mutation(async ({ input }) => {
      const targetHour = input?.targetHour ?? 21;
      const forceSend = input?.forceSend ?? false;
      
      console.log(`Starting timezone-aware weekly recap job (target hour: ${targetHour}:00)...`);
      
      const users = await getAllUsersWithTrips();
      const { start, end, label } = getWeekRange();
      
      let emailsSent = 0;
      let emailsFailed = 0;
      let pushSent = 0;
      let pushFailed = 0;
      let skippedTimezone = 0;
      let skippedNotSunday = 0;
      
      const eligibleUsers: string[] = [];

      for (const user of users) {
        const userTimezone = user.timezone || 'UTC';
        
        if (!forceSend) {
          if (!isSundayInTimezone(userTimezone)) {
            skippedNotSunday++;
            continue;
          }
          
          if (!isTargetHourInTimezone(userTimezone, targetHour)) {
            skippedTimezone++;
            continue;
          }
        }
        
        if (user.weeklyRecapEnabled === false) {
          console.log(`Skipping weekly recap for ${user.email} - user has disabled weekly recaps`);
          continue;
        }

        eligibleUsers.push(`${user.displayName} (${userTimezone})`);
        
        const stats = calculateWeeklyStats(user.trips, start, end);
        const country = user.country || 'Global';
        const { leaderboard, userRank } = calculateRegionalLeaderboard(users, country, user.id);

        const personalRecords = calculatePersonalRecords(user.trips, user.trips.filter(t => {
          const d = new Date(t.startTime);
          return d >= start && d <= end;
        }), start);
        const milestones = calculateMilestones(user.trips, start, end);

        if (user.email) {
          const emailSuccess = await sendWeeklyEmail(
            user.email,
            user.displayName,
            stats,
            leaderboard,
            userRank,
            country,
            label,
            personalRecords,
            milestones
          );
          if (emailSuccess) emailsSent++;
          else emailsFailed++;
        }

        if (user.pushToken) {
          const pushSuccess = await sendWeeklyPushNotification(
            user.pushToken,
            user.displayName,
            stats,
            personalRecords,
            milestones
          );
          if (pushSuccess) pushSent++;
          else pushFailed++;
        }
      }

      console.log(`Timezone-aware recap: ${emailsSent} emails, ${pushSent} push sent. Skipped: ${skippedTimezone} (wrong hour), ${skippedNotSunday} (not Sunday)`);
      
      return {
        success: true,
        totalUsers: users.length,
        eligibleUsers: eligibleUsers.length,
        eligibleUsersList: eligibleUsers,
        emails: { sent: emailsSent, failed: emailsFailed },
        push: { sent: pushSent, failed: pushFailed },
        skipped: { wrongHour: skippedTimezone, notSunday: skippedNotSunday },
        weekRange: label,
        targetHour: `${targetHour}:00 (user's local time)`,
        scheduledFor: "Sundays at 9:00 PM in each user's timezone",
      };
    }),

  previewWeeklyEmail: publicProcedure
    .input(z.object({
      displayName: z.string(),
      country: z.string().optional(),
    }))
    .query(({ input }) => {
      const { label } = getWeekRange();
      
      const mockStats: WeeklyStats = {
        totalTrips: 7,
        totalDistance: 342.5,
        topSpeed: 185,
        avgSpeed: 72,
        totalDuration: 14400,
        maxGForce: 1.2,
        best0to100: 6.8,
        corners: 156,
      };

      const mockLeaderboard: LeaderboardEntry[] = [
        { rank: 1, displayName: 'SpeedDemon', value: 245, isCurrentUser: false },
        { rank: 2, displayName: 'RoadRunner', value: 220, isCurrentUser: false },
        { rank: 3, displayName: input.displayName, value: 185, isCurrentUser: true },
        { rank: 4, displayName: 'NightRider', value: 178, isCurrentUser: false },
        { rank: 5, displayName: 'TurboMax', value: 165, isCurrentUser: false },
      ];

      const mockRecords: PersonalRecord[] = [
        { type: 'topSpeed', label: 'Top Speed', value: '185 km/h', previousValue: '172 km/h', icon: '⚡' },
        { type: 'longestTrip', label: 'Longest Trip', value: '89.5 km', previousValue: '67.2 km', icon: '🛣️' },
      ];

      const mockMilestones: Milestone[] = [
        { label: '1,000 km Club', description: "You've driven a total of 1,000 kilometers!", icon: '🥇' },
        { label: '50 Trips', description: "You've completed 50 trips!", icon: '⭐' },
      ];

      return {
        html: getWeeklyEmailHtml(
          input.displayName,
          mockStats,
          mockLeaderboard,
          3,
          input.country || 'Global',
          label,
          mockRecords,
          mockMilestones
        ),
        weekRange: label,
      };
    }),
});
