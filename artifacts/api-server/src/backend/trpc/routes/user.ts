import * as z from "zod";
import { createTRPCRouter, publicProcedure } from "../create-context";

import { isDbConfigured, getSupabaseHeaders, getSupabaseRestUrl } from "../db";

function getResendApiKey() {
  return process.env.RESEND_API_KEY;
}

interface StoredCarData {
  id: string;
  brand: string;
  model: string;
  picture?: string;
  isPrimary?: boolean;
}

interface StoredUser {
  id: string;
  email: string;
  displayName: string;
  passwordHash?: string;
  country?: string;
  city?: string;
  carBrand?: string;
  carModel?: string;
  bio?: string;
  profilePicture?: string | null;
  carPicture?: string | null;
  cars?: StoredCarData[] | null;
  createdAt: number;
  welcomeEmailSent: boolean;
  pushToken?: string | null;
  timezone?: string;
  weeklyRecapEnabled?: boolean;
  latitude?: number | null;
  longitude?: number | null;
  locationUpdatedAt?: number | null;
  speedUnit?: string;
  distanceUnit?: string;
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

function hashPassword(password: string): string {
  let hash = 0;
  const salt = 'redline_salt_2024';
  const salted = salt + password + salt;
  for (let i = 0; i < salted.length; i++) {
    const char = salted.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  const hex = Math.abs(hash).toString(16);
  return 'rl_' + hex.padStart(16, '0');
}

function verifyPassword(password: string, storedHash: string): boolean {
  return hashPassword(password) === storedHash;
}

interface PasswordResetCode {
  id: string;
  email: string;
  code: string;
  expiresAt: number;
  createdAt: number;
}

async function storeResetCode(resetCode: PasswordResetCode): Promise<boolean> {
  if (!isDbConfigured()) {
    console.log("[DB] Database not configured");
    return false;
  }

  try {
    const dbResetCode = {
      id: resetCode.id,
      email: resetCode.email,
      code: resetCode.code,
      expires_at: resetCode.expiresAt,
      created_at: resetCode.createdAt,
    };

    const response = await fetch(getSupabaseRestUrl("password_reset_codes"), {
      method: "POST",
      headers: getSupabaseHeaders(),
      body: JSON.stringify(dbResetCode),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("Failed to store reset code:", error);
      return false;
    }

    console.log("Reset code stored for:", resetCode.email);
    return true;
  } catch (error) {
    console.error("Error storing reset code:", error);
    return false;
  }
}

async function getResetCode(email: string): Promise<PasswordResetCode | null> {
  if (!isDbConfigured()) {
    console.log("Database not configured");
    return null;
  }

  try {
    const url = `${getSupabaseRestUrl("password_reset_codes")}?email=ilike.${encodeURIComponent(email.toLowerCase())}`;
    const response = await fetch(url, {
      method: "GET",
      headers: getSupabaseHeaders(),
    });

    if (!response.ok) {
      console.error("Failed to fetch reset codes");
      return null;
    }

    const codes = await response.json();
    if (!codes[0]) return null;
    const row = codes[0];
    return {
      id: row.id,
      email: row.email,
      code: row.code,
      expiresAt: row.expires_at,
      createdAt: row.created_at,
    };
  } catch (error) {
    console.error("Error fetching reset code:", error);
    return null;
  }
}

async function deleteResetCode(id: string): Promise<boolean> {
  if (!isDbConfigured()) {
    console.log("[DB] Database not configured");
    return false;
  }

  try {
    const url = `${getSupabaseRestUrl("password_reset_codes")}?id=eq.${encodeURIComponent(id)}`;
    const response = await fetch(url, {
      method: "DELETE",
      headers: getSupabaseHeaders(),
    });

    if (!response.ok) {
      console.error("Failed to delete reset code");
      return false;
    }

    return true;
  } catch (error) {
    console.error("Error deleting reset code:", error);
    return false;
  }
}

const getWelcomeEmailHtml = (displayName: string) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome to RedLine</title>
</head>
<body style="margin: 0; padding: 0; background-color: #0a0a0a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" style="width: 100%; max-width: 600px; border-collapse: collapse;">
          
          <!-- Header -->
          <tr>
            <td style="padding: 40px 40px 30px; background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); border-radius: 16px 16px 0 0;">
              <h1 style="margin: 0; font-size: 28px; font-weight: 700; color: #ffffff; text-align: center;">
                🚗 Welcome to RedLine
              </h1>
            </td>
          </tr>
          
          <!-- Body -->
          <tr>
            <td style="padding: 40px; background-color: #1a1a1a;">
              <p style="margin: 0 0 20px; font-size: 18px; line-height: 1.6; color: #ffffff;">
                Hey ${displayName}! 👋
              </p>
              <p style="margin: 0 0 20px; font-size: 16px; line-height: 1.6; color: #b0b0b0;">
                Thanks for joining RedLine! We're excited to have you on board.
              </p>
              <p style="margin: 0 0 30px; font-size: 16px; line-height: 1.6; color: #b0b0b0;">
                Start tracking your drives, compete on the leaderboard, and connect with fellow car enthusiasts. Every mile counts!
              </p>
              
              <!-- Features -->
              <table role="presentation" style="width: 100%; border-collapse: collapse; margin-bottom: 30px;">
                <tr>
                  <td style="padding: 15px; background-color: #252525; border-radius: 12px; margin-bottom: 10px;">
                    <p style="margin: 0; font-size: 14px; color: #ffffff;">
                      <strong style="color: #4ade80;">📍 Track Trips</strong><br>
                      <span style="color: #888;">Log your drives and see your stats</span>
                    </p>
                  </td>
                </tr>
                <tr><td style="height: 10px;"></td></tr>
                <tr>
                  <td style="padding: 15px; background-color: #252525; border-radius: 12px;">
                    <p style="margin: 0; font-size: 14px; color: #ffffff;">
                      <strong style="color: #60a5fa;">🏆 Leaderboard</strong><br>
                      <span style="color: #888;">Compete with drivers worldwide</span>
                    </p>
                  </td>
                </tr>
                <tr><td style="height: 10px;"></td></tr>
                <tr>
                  <td style="padding: 15px; background-color: #252525; border-radius: 12px;">
                    <p style="margin: 0; font-size: 14px; color: #ffffff;">
                      <strong style="color: #f472b6;">📊 Monthly Recap</strong><br>
                      <span style="color: #888;">Get insights on your driving habits</span>
                    </p>
                  </td>
                </tr>
              </table>
              
              <p style="margin: 0; font-size: 16px; line-height: 1.6; color: #b0b0b0;">
                Ready to hit the road? Open the app and start your first trip!
              </p>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding: 30px 40px; background-color: #141414; border-radius: 0 0 16px 16px; text-align: center;">
              <img src="https://pub-e001eb4506b145aa938b5d3badbff6a5.r2.dev/attachments/pnnoj3a6b358u5apkxo4m" alt="RedLine" style="height: 40px; margin-bottom: 15px;" />
              <p style="margin: 0; font-size: 14px; color: #666;">
                Drive safe and enjoy the journey! 🛣️
              </p>
              <p style="margin: 15px 0 0; font-size: 12px; color: #444;">
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

async function sendWelcomeEmail(email: string, displayName: string): Promise<boolean> {
  const RESEND_API_KEY = getResendApiKey();
  if (!RESEND_API_KEY) {
    console.log("RESEND_API_KEY not configured, skipping welcome email");
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
        subject: "Welcome to RedLine! 🚗",
        html: getWelcomeEmailHtml(displayName),
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("Failed to send welcome email:", error);
      return false;
    }

    console.log("Welcome email sent to:", email);
    return true;
  } catch (error) {
    console.error("Error sending welcome email:", error);
    return false;
  }
}

async function storeUserInDb(user: StoredUser): Promise<{ success: boolean; error?: string }> {
  if (!isDbConfigured()) {
    console.log("[DB] Database not configured, skipping user storage");
    return { success: false, error: "Database not configured" };
  }

  try {
    console.log("Storing user in database:", user.email, "id:", user.id);
    const url = getSupabaseRestUrl("users");
    console.log("Database URL:", url);
    
    const dbUser: Record<string, unknown> = {
      id: user.id,
      email: user.email,
      display_name: user.displayName,
      password_hash: user.passwordHash,
      country: user.country,
      city: user.city,
      car_brand: user.carBrand,
      car_model: user.carModel,
      bio: user.bio,
      profile_picture: user.profilePicture,
      car_picture: user.carPicture,
      cars: user.cars ? JSON.stringify(user.cars) : null,
      created_at: user.createdAt,
      welcome_email_sent: user.welcomeEmailSent,
      push_token: user.pushToken,
      timezone: user.timezone,
      weekly_recap_enabled: user.weeklyRecapEnabled,
    };
    
    const response = await fetch(url, {
      method: "POST",
      headers: getSupabaseHeaders(),
      body: JSON.stringify(dbUser),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Failed to store user - Status:", response.status, "Error:", errorText);
      return { success: false, error: `Database error (${response.status}): ${errorText}` };
    }

    console.log("User stored in database successfully:", user.email);
    return { success: true };
  } catch (error) {
    console.error("Error storing user:", error);
    return { success: false, error: `Network error: ${error instanceof Error ? error.message : String(error)}` };
  }
}

async function updateUserInDb(userId: string, updates: Partial<StoredUser>): Promise<boolean> {
  if (!isDbConfigured()) {
    console.log("[DB] Database not configured");
    return false;
  }

  try {
    const dbUpdates: Record<string, unknown> = {};
    if (updates.displayName !== undefined) dbUpdates.display_name = updates.displayName;
    if (updates.passwordHash !== undefined) dbUpdates.password_hash = updates.passwordHash;
    if (updates.country !== undefined) dbUpdates.country = updates.country;
    if (updates.city !== undefined) dbUpdates.city = updates.city;
    if (updates.carBrand !== undefined) dbUpdates.car_brand = updates.carBrand;
    if (updates.carModel !== undefined) dbUpdates.car_model = updates.carModel;
    if (updates.bio !== undefined) dbUpdates.bio = updates.bio;
    if (updates.profilePicture !== undefined) dbUpdates.profile_picture = updates.profilePicture;
    if (updates.carPicture !== undefined) dbUpdates.car_picture = updates.carPicture;
    if (updates.cars !== undefined) dbUpdates.cars = updates.cars ? JSON.stringify(updates.cars) : null;
    if (updates.welcomeEmailSent !== undefined) dbUpdates.welcome_email_sent = updates.welcomeEmailSent;
    if (updates.pushToken !== undefined) dbUpdates.push_token = updates.pushToken;
    if (updates.timezone !== undefined) dbUpdates.timezone = updates.timezone;
    if (updates.weeklyRecapEnabled !== undefined) dbUpdates.weekly_recap_enabled = updates.weeklyRecapEnabled;
    if (updates.latitude !== undefined) dbUpdates.latitude = updates.latitude;
    if (updates.longitude !== undefined) dbUpdates.longitude = updates.longitude;
    if (updates.locationUpdatedAt !== undefined) dbUpdates.location_updated_at = updates.locationUpdatedAt;
    if (updates.speedUnit !== undefined) dbUpdates.speed_unit = updates.speedUnit;
    if (updates.distanceUnit !== undefined) dbUpdates.distance_unit = updates.distanceUnit;

    const url = `${getSupabaseRestUrl("users")}?id=eq.${encodeURIComponent(userId)}`;
    const response = await fetch(url, {
      method: "PATCH",
      headers: getSupabaseHeaders(),
      body: JSON.stringify(dbUpdates),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("Failed to update user:", error);
      return false;
    }

    console.log("User updated in database:", userId);
    return true;
  } catch (error) {
    console.error("Error updating user:", error);
    return false;
  }
}

async function getUsersWithPushTokens(): Promise<StoredUser[]> {
  const users = await getAllUsers();
  return users.filter(u => u.pushToken);
}

async function getAllUsers(): Promise<StoredUser[]> {
  if (!isDbConfigured()) {
    console.log("[DB] Database not configured");
    return [];
  }

  try {
    const response = await fetch(getSupabaseRestUrl("users"), {
      method: "GET",
      headers: getSupabaseHeaders(),
    });

    if (!response.ok) {
      console.error("Failed to fetch users");
      return [];
    }

    const data = await response.json();
    return data.map((row: Record<string, unknown>) => ({
      id: row.id as string,
      email: row.email as string,
      displayName: row.display_name as string,
      passwordHash: row.password_hash as string | undefined,
      country: row.country as string | undefined,
      city: row.city as string | undefined,
      carBrand: row.car_brand as string | undefined,
      carModel: row.car_model as string | undefined,
      bio: row.bio as string | undefined,
      profilePicture: row.profile_picture as string | null | undefined,
      carPicture: row.car_picture as string | null | undefined,
      cars: row.cars ? (typeof row.cars === 'string' ? JSON.parse(row.cars as string) : row.cars) as StoredCarData[] : null,
      createdAt: row.created_at ? new Date(row.created_at as string).getTime() : Date.now(),
      welcomeEmailSent: row.welcome_email_sent as boolean,
      pushToken: row.push_token as string | null | undefined,
      timezone: row.timezone as string | undefined,
      weeklyRecapEnabled: row.weekly_recap_enabled as boolean | undefined,
      latitude: row.latitude as number | null | undefined,
      longitude: row.longitude as number | null | undefined,
      locationUpdatedAt: row.location_updated_at as number | null | undefined,
      speedUnit: row.speed_unit as string | undefined,
      distanceUnit: row.distance_unit as string | undefined,
    }));
  } catch (error) {
    console.error("Error fetching users:", error);
    return [];
  }
}

async function getUserById(userId: string): Promise<StoredUser | null> {
  if (!isDbConfigured()) {
    console.log("[DB] Database not configured");
    return null;
  }

  try {
    const url = `${getSupabaseRestUrl("users")}?id=eq.${encodeURIComponent(userId)}&limit=1`;
    const response = await fetch(url, {
      method: "GET",
      headers: getSupabaseHeaders(),
    });

    if (!response.ok) {
      console.error("Failed to fetch user by id");
      return null;
    }

    const data = await response.json();
    if (!data || data.length === 0) return null;

    const row = data[0] as Record<string, unknown>;
    return {
      id: row.id as string,
      email: row.email as string,
      displayName: row.display_name as string,
      passwordHash: row.password_hash as string | undefined,
      country: row.country as string | undefined,
      city: row.city as string | undefined,
      carBrand: row.car_brand as string | undefined,
      carModel: row.car_model as string | undefined,
      bio: row.bio as string | undefined,
      profilePicture: row.profile_picture as string | null | undefined,
      carPicture: row.car_picture as string | null | undefined,
      cars: row.cars ? (typeof row.cars === 'string' ? JSON.parse(row.cars as string) : row.cars) as StoredCarData[] : null,
      createdAt: row.created_at ? new Date(row.created_at as string).getTime() : Date.now(),
      welcomeEmailSent: row.welcome_email_sent as boolean,
      pushToken: row.push_token as string | null | undefined,
      timezone: row.timezone as string | undefined,
      weeklyRecapEnabled: row.weekly_recap_enabled as boolean | undefined,
      latitude: row.latitude as number | null | undefined,
      longitude: row.longitude as number | null | undefined,
      locationUpdatedAt: row.location_updated_at as number | null | undefined,
      speedUnit: row.speed_unit as string | undefined,
      distanceUnit: row.distance_unit as string | undefined,
    };
  } catch (error) {
    console.error("Error fetching user by id:", error);
    return null;
  }
}

async function getUserByEmail(email: string): Promise<StoredUser | null> {
  if (!isDbConfigured()) {
    console.log("[DB] Database not configured");
    return null;
  }

  try {
    const url = `${getSupabaseRestUrl("users")}?email=ilike.${encodeURIComponent(email.toLowerCase())}&limit=1`;
    const response = await fetch(url, {
      method: "GET",
      headers: getSupabaseHeaders(),
    });

    if (!response.ok) {
      console.error("Failed to fetch user by email");
      return null;
    }

    const data = await response.json();
    if (!data || data.length === 0) return null;

    const row = data[0] as Record<string, unknown>;
    return {
      id: row.id as string,
      email: row.email as string,
      displayName: row.display_name as string,
      passwordHash: row.password_hash as string | undefined,
      country: row.country as string | undefined,
      city: row.city as string | undefined,
      carBrand: row.car_brand as string | undefined,
      carModel: row.car_model as string | undefined,
      bio: row.bio as string | undefined,
      profilePicture: row.profile_picture as string | null | undefined,
      carPicture: row.car_picture as string | null | undefined,
      cars: row.cars ? (typeof row.cars === 'string' ? JSON.parse(row.cars as string) : row.cars) as StoredCarData[] : null,
      createdAt: row.created_at ? new Date(row.created_at as string).getTime() : Date.now(),
      welcomeEmailSent: row.welcome_email_sent as boolean,
      pushToken: row.push_token as string | null | undefined,
      timezone: row.timezone as string | undefined,
      weeklyRecapEnabled: row.weekly_recap_enabled as boolean | undefined,
      latitude: row.latitude as number | null | undefined,
      longitude: row.longitude as number | null | undefined,
      locationUpdatedAt: row.location_updated_at as number | null | undefined,
      speedUnit: row.speed_unit as string | undefined,
      distanceUnit: row.distance_unit as string | undefined,
    };
  } catch (error) {
    console.error("Error fetching user by email:", error);
    return null;
  }
}

async function checkDisplayNameExists(displayName: string): Promise<boolean> {
  if (!isDbConfigured()) {
    return false;
  }

  try {
    const url = `${getSupabaseRestUrl("users")}?display_name=ilike.${encodeURIComponent(displayName)}&limit=1`;
    const response = await fetch(url, {
      method: "GET",
      headers: getSupabaseHeaders(),
    });

    if (!response.ok) return false;
    const data = await response.json();
    return data && data.length > 0;
  } catch (error) {
    console.error("Error checking display name:", error);
    return false;
  }
}

function generateResetCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

const getPasswordResetEmailHtml = (displayName: string, code: string) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Password Reset - RedLine</title>
</head>
<body style="margin: 0; padding: 0; background-color: #0a0a0a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" style="width: 100%; max-width: 600px; border-collapse: collapse;">
          <tr>
            <td style="padding: 40px 40px 30px; background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); border-radius: 16px 16px 0 0;">
              <h1 style="margin: 0; font-size: 28px; font-weight: 700; color: #ffffff; text-align: center;">
                🔐 Password Reset
              </h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px; background-color: #1a1a1a;">
              <p style="margin: 0 0 20px; font-size: 18px; line-height: 1.6; color: #ffffff;">
                Hey ${displayName}! 👋
              </p>
              <p style="margin: 0 0 20px; font-size: 16px; line-height: 1.6; color: #b0b0b0;">
                We received a request to reset your password. Use the code below to reset it:
              </p>
              <div style="background-color: #252525; border-radius: 12px; padding: 24px; text-align: center; margin: 24px 0;">
                <p style="margin: 0; font-size: 36px; font-weight: 700; color: #ffffff; letter-spacing: 8px;">
                  ${code}
                </p>
              </div>
              <p style="margin: 0 0 20px; font-size: 14px; line-height: 1.6; color: #888;">
                This code will expire in 15 minutes. If you didn't request this, you can safely ignore this email.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding: 30px 40px; background-color: #141414; border-radius: 0 0 16px 16px; text-align: center;">
              <img src="https://pub-e001eb4506b145aa938b5d3badbff6a5.r2.dev/attachments/pnnoj3a6b358u5apkxo4m" alt="RedLine" style="height: 40px; margin-bottom: 15px;" />
              <p style="margin: 0; font-size: 12px; color: #444;">
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

async function sendPasswordResetEmail(email: string, displayName: string, code: string): Promise<boolean> {
  const RESEND_API_KEY = getResendApiKey();
  if (!RESEND_API_KEY) {
    console.log("RESEND_API_KEY not configured, skipping password reset email");
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
        subject: "Password Reset Code - RedLine 🔐",
        html: getPasswordResetEmailHtml(displayName, code),
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("Failed to send password reset email:", error);
      return false;
    }

    console.log("Password reset email sent to:", email);
    return true;
  } catch (error) {
    console.error("Error sending password reset email:", error);
    return false;
  }
}

export const userRouter = createTRPCRouter({
  checkDisplayName: publicProcedure
    .input(z.object({
      displayName: z.string(),
    }))
    .query(async ({ input }) => {
      console.log("Checking display name availability:", input.displayName);
      const isTaken = await checkDisplayNameExists(input.displayName);
      return {
        available: !isTaken,
        displayName: input.displayName,
      };
    }),

  register: publicProcedure
    .input(z.object({
      id: z.string(),
      email: z.string().email(),
      displayName: z.string(),
      password: z.string().min(6).optional(),
      country: z.string().optional(),
      city: z.string().optional(),
      carBrand: z.string().optional(),
      carModel: z.string().optional(),
      authProvider: z.enum(['email', 'google']).optional(),
    }))
    .mutation(async ({ input }) => {
      const normalizedEmail = input.email.trim().toLowerCase();
      input = { ...input, email: normalizedEmail };
      console.log("Registering new user:", normalizedEmail);

      const existingEmail = await getUserByEmail(normalizedEmail);
      if (existingEmail) {
        // If the existing account has no password (e.g. Google-only),
        // allow upgrading it by adding a password + profile info.
        if (!existingEmail.passwordHash && input.password) {
          console.log("[REGISTER] Upgrading existing Google account with password:", existingEmail.email);
          const newHash = hashPassword(input.password);
          const updates: Partial<StoredUser> = {
            passwordHash: newHash,
          };
          if (input.displayName && !existingEmail.displayName) updates.displayName = input.displayName;
          if (input.country && !existingEmail.country) updates.country = input.country;
          if (input.city && !existingEmail.city) updates.city = input.city;
          if (input.carBrand && !existingEmail.carBrand) updates.carBrand = input.carBrand;
          if (input.carModel && !existingEmail.carModel) updates.carModel = input.carModel;
          const ok = await updateUserInDb(existingEmail.id, updates);
          if (!ok) {
            return {
              success: false,
              error: 'Failed to update account. Please try again.',
            };
          }
          return {
            success: true,
            stored: true,
            upgraded: true,
            welcomeEmailSent: false,
          };
        }
        return {
          success: false,
          error: 'An account with this email already exists. Please sign in instead.',
        };
      }

      const usernameTaken = await checkDisplayNameExists(input.displayName);
      if (usernameTaken) {
        return {
          success: false,
          error: 'This username is already taken. Please choose a different one.',
        };
      }

      const passwordHash = input.password ? hashPassword(input.password) : undefined;
      const storedUser: StoredUser = {
        id: input.id,
        email: input.email,
        displayName: input.displayName,
        passwordHash,
        country: input.country,
        city: input.city,
        carBrand: input.carBrand,
        carModel: input.carModel,
        createdAt: Date.now(),
        welcomeEmailSent: false,
      };

      const storeResult = await storeUserInDb(storedUser);
      
      if (!storeResult.success) {
        console.error("Failed to store user in database:", input.email, "Error:", storeResult.error);
        return {
          success: false,
          error: storeResult.error || 'Failed to create account. Please try again.',
        };
      }
      
      const emailSent = await sendWelcomeEmail(input.email, input.displayName);

      if (emailSent) {
        await updateUserInDb(storedUser.id, { welcomeEmailSent: true });
      }

      return {
        success: true,
        stored: true,
        welcomeEmailSent: emailSent,
      };
    }),

  login: publicProcedure
    .input(z.object({
      email: z.string().email(),
      password: z.string(),
    }))
    .mutation(async ({ input }) => {
      const normalizedEmail = input.email.trim().toLowerCase();
      console.log("Login attempt for:", normalizedEmail);

      const user = await getUserByEmail(normalizedEmail);

      if (!user) {
        return {
          success: false,
          error: 'not_found',
          message: 'No account found with this email address.',
        };
      }

      if (!user.passwordHash) {
        return {
          success: false,
          error: 'no_password',
          message: 'This account was created with Google. Please sign in with Google.',
        };
      }

      if (!verifyPassword(input.password, user.passwordHash)) {
        return {
          success: false,
          error: 'incorrect_password',
          message: 'Incorrect password.',
        };
      }

      return {
        success: true,
        user: {
          id: user.id,
          email: user.email,
          displayName: user.displayName,
          country: user.country,
          city: user.city,
          carBrand: user.carBrand,
          carModel: user.carModel,
          bio: user.bio,
          profilePicture: user.profilePicture,
          carPicture: user.carPicture,
          cars: user.cars,
          createdAt: user.createdAt,
        },
      };
    }),

  getAllEmails: publicProcedure.query(async () => {
    const users = await getAllUsers();
    return users.map(u => ({
      email: u.email,
      displayName: u.displayName,
      createdAt: u.createdAt,
      country: u.country,
      city: u.city,
    }));
  }),

  getStats: publicProcedure.query(async () => {
    const users = await getAllUsers();
    return {
      totalUsers: users.length,
      emailsSent: users.filter(u => u.welcomeEmailSent).length,
    };
  }),

  updatePushToken: publicProcedure
    .input(z.object({
      userId: z.string(),
      pushToken: z.string().nullable(),
    }))
    .mutation(async ({ input }) => {
      console.log("Updating push token for user:", input.userId);
      const success = await updateUserInDb(input.userId, { pushToken: input.pushToken });
      return { success };
    }),

  getUsersWithNotifications: publicProcedure.query(async () => {
    const users = await getUsersWithPushTokens();
    return users.map(u => ({
      id: u.id,
      displayName: u.displayName,
      pushToken: u.pushToken,
    }));
  }),

  updateUserLocation: publicProcedure
    .input(z.object({
      userId: z.string(),
      latitude: z.number(),
      longitude: z.number(),
    }))
    .mutation(async ({ input }) => {
      console.log("[LOCATION] Updating location for user:", input.userId, "lat:", input.latitude, "lng:", input.longitude);
      const updated = await updateUserInDb(input.userId, {
        latitude: input.latitude,
        longitude: input.longitude,
        locationUpdatedAt: Date.now(),
      });
      return { success: updated };
    }),

  getNearbyUsers: publicProcedure
    .input(z.object({
      userId: z.string(),
      latitude: z.number().optional(),
      longitude: z.number().optional(),
      country: z.string().optional(),
      city: z.string().optional(),
    }))
    .query(async ({ input }) => {
      console.log("[NEARBY] Fetching nearby users for:", input.userId, "lat:", input.latitude, "lng:", input.longitude);
      const users = await getAllUsers();
      console.log("[NEARBY] Total users in DB:", users.length);

      const MAX_DISTANCE_KM = 100;
      const hasCoords = input.latitude != null && input.longitude != null;

      const nearbyUsers = users
        .filter(u => u.id !== input.userId)
        .map(u => {
          let distanceKm: number | null = null;

          if (hasCoords && u.latitude != null && u.longitude != null) {
            distanceKm = haversineDistance(
              input.latitude!,
              input.longitude!,
              u.latitude,
              u.longitude
            );
          }

          return { user: u, distanceKm };
        })
        .filter(({ distanceKm }) => {
          if (distanceKm === null) return false;
          return distanceKm <= MAX_DISTANCE_KM;
        })
        .sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity));

      console.log("[NEARBY] Found", nearbyUsers.length, "nearby users within", MAX_DISTANCE_KM, "km");
      return nearbyUsers.map(({ user: u, distanceKm }) => ({
        id: u.id,
        displayName: u.displayName,
        country: u.country,
        city: u.city,
        carBrand: u.carBrand,
        carModel: u.carModel,
        hasPushToken: !!u.pushToken,
        distanceKm: distanceKm != null ? Math.round(distanceKm) : null,
      }));
    }),

  requestPasswordReset: publicProcedure
    .input(z.object({
      email: z.string().email(),
    }))
    .mutation(async ({ input }) => {
      console.log("Requesting password reset for:", input.email);
      
      const user = await getUserByEmail(input.email);
      
      if (!user) {
        console.log("No user found for email:", input.email);
        return { success: false, emailSent: false, error: "No account found with this email address." };
      }

      const existingCode = await getResetCode(input.email);
      if (existingCode) {
        await deleteResetCode(existingCode.id);
      }

      const code = generateResetCode();
      const expiresAt = Date.now() + 15 * 60 * 1000;
      const resetCode: PasswordResetCode = {
        id: `reset_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        email: input.email.toLowerCase(),
        code,
        expiresAt,
        createdAt: Date.now(),
      };
      
      const stored = await storeResetCode(resetCode);
      if (!stored) {
        return { success: false, emailSent: false, error: "Failed to process request. Please try again." };
      }

      const emailSent = await sendPasswordResetEmail(input.email, user.displayName, code);
      
      if (!emailSent) {
        return { success: false, emailSent: false, error: "Failed to send reset email. Please try again." };
      }
      
      return { success: true, emailSent: true, message: "Reset code sent to your email." };
    }),

  verifyResetCode: publicProcedure
    .input(z.object({
      email: z.string().email(),
      code: z.string(),
    }))
    .mutation(async ({ input }) => {
      console.log("Verifying reset code for:", input.email);
      const storedData = await getResetCode(input.email);
      
      if (!storedData) {
        return { valid: false, error: "No reset code found. Please request a new one." };
      }

      if (Date.now() > storedData.expiresAt) {
        await deleteResetCode(storedData.id);
        return { valid: false, error: "Reset code has expired. Please request a new one." };
      }

      if (storedData.code !== input.code) {
        return { valid: false, error: "Invalid code. Please try again." };
      }

      await deleteResetCode(storedData.id);
      return { valid: true };
    }),

  clearResetCode: publicProcedure
    .input(z.object({
      email: z.string().email(),
    }))
    .mutation(async ({ input }) => {
      const existingCode = await getResetCode(input.email);
      if (existingCode) {
        await deleteResetCode(existingCode.id);
      }
      return { success: true };
    }),

  resetPassword: publicProcedure
    .input(z.object({
      email: z.string().email(),
      newPassword: z.string().min(6),
    }))
    .mutation(async ({ input }) => {
      console.log("Resetting password for:", input.email);

      const user = await getUserByEmail(input.email);

      if (!user) {
        return {
          success: false,
          error: 'No account found with this email address.',
        };
      }

      const newPasswordHash = hashPassword(input.newPassword);
      const updated = await updateUserInDb(user.id, { passwordHash: newPasswordHash });

      if (!updated) {
        return {
          success: false,
          error: 'Failed to update password. Please try again.',
        };
      }

      console.log("Password reset successful for:", input.email);
      return { success: true };
    }),

  updateBio: publicProcedure
    .input(z.object({
      userId: z.string(),
      bio: z.string().max(300),
    }))
    .mutation(async ({ input }) => {
      console.log("Updating bio for user:", input.userId);
      const updated = await updateUserInDb(input.userId, { bio: input.bio });
      return { success: updated };
    }),

  updateProfileImages: publicProcedure
    .input(z.object({
      userId: z.string(),
      profilePicture: z.string().nullable().optional(),
      carPicture: z.string().nullable().optional(),
      cars: z.array(z.object({
        id: z.string(),
        brand: z.string(),
        model: z.string(),
        picture: z.string().optional(),
        isPrimary: z.boolean().optional(),
      })).nullable().optional(),
    }))
    .mutation(async ({ input }) => {
      console.log("[USER] Updating profile images for user:", input.userId);
      const updates: Partial<StoredUser> = {};
      if (input.profilePicture !== undefined) updates.profilePicture = input.profilePicture;
      if (input.carPicture !== undefined) updates.carPicture = input.carPicture;
      if (input.cars !== undefined) updates.cars = input.cars;
      const updated = await updateUserInDb(input.userId, updates);
      return { success: updated };
    }),

  updateTimezone: publicProcedure
    .input(z.object({
      userId: z.string(),
      timezone: z.string(),
    }))
    .mutation(async ({ input }) => {
      console.log("Updating timezone for user:", input.userId, "to:", input.timezone);
      
      const updated = await updateUserInDb(input.userId, { timezone: input.timezone });
      
      if (!updated) {
        return { success: false, error: 'Failed to update timezone' };
      }
      
      return { success: true, timezone: input.timezone };
    }),

  updateUnitPreferences: publicProcedure
    .input(z.object({
      userId: z.string(),
      speedUnit: z.enum(['kmh', 'mph']),
      distanceUnit: z.enum(['km', 'mi']),
    }))
    .mutation(async ({ input }) => {
      console.log("Updating unit preferences for user:", input.userId, "speed:", input.speedUnit, "distance:", input.distanceUnit);
      const success = await updateUserInDb(input.userId, {
        speedUnit: input.speedUnit,
        distanceUnit: input.distanceUnit,
      });
      return { success };
    }),

  updateWeeklyRecapEnabled: publicProcedure
    .input(z.object({
      userId: z.string(),
      enabled: z.boolean(),
    }))
    .mutation(async ({ input }) => {
      console.log("Updating weekly recap preference for user:", input.userId, "to:", input.enabled);
      
      const updated = await updateUserInDb(input.userId, { weeklyRecapEnabled: input.enabled });
      
      if (!updated) {
        return { success: false, error: 'Failed to update weekly recap preference' };
      }
      
      return { success: true, enabled: input.enabled };
    }),

  getPublicProfile: publicProcedure
    .input(z.object({
      userId: z.string(),
    }))
    .query(async ({ input }) => {
      console.log("[USER] Fetching public profile for:", input.userId);
      const foundUser = await getUserById(input.userId);
      if (!foundUser) {
        console.log("[USER] User not found:", input.userId);
        return null;
      }
      return {
        id: foundUser.id,
        displayName: foundUser.displayName,
        country: foundUser.country,
        city: foundUser.city,
        carBrand: foundUser.carBrand,
        carModel: foundUser.carModel,
        bio: foundUser.bio,
        profilePicture: foundUser.profilePicture,
        carPicture: foundUser.carPicture,
        cars: foundUser.cars,
        createdAt: foundUser.createdAt,
      };
    }),

  getWeeklyRecapEnabled: publicProcedure
    .input(z.object({
      userId: z.string(),
    }))
    .query(async ({ input }) => {
      const user = await getUserById(input.userId);
      return { enabled: user?.weeklyRecapEnabled ?? true };
    }),

  sendFeedback: publicProcedure
    .input(z.object({
      userId: z.string(),
      email: z.string(),
      displayName: z.string(),
      feedback: z.string().min(1).max(1000),
    }))
    .mutation(async ({ input }) => {
      const apiKey = getResendApiKey();
      if (!apiKey) {
        throw new Error('Email service not configured');
      }

      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'RedLine Feedback <info@redlineapp.io>',
          to: ['info@redlineapp.io'],
          subject: `Feedback from ${input.displayName}`,
          html: `
            <h2>New Feedback from RedLine</h2>
            <p><strong>User:</strong> ${input.displayName}</p>
            <p><strong>Email:</strong> ${input.email}</p>
            <p><strong>User ID:</strong> ${input.userId}</p>
            <hr/>
            <p>${input.feedback.replace(/\n/g, '<br/>')}</p>
          `,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[FEEDBACK] Failed to send:', errorText);
        throw new Error('Failed to send feedback email');
      }

      console.log('[FEEDBACK] Sent successfully from', input.email);
      return { success: true };
    }),

  ensureUser: publicProcedure
    .input(z.object({
      id: z.string(),
      email: z.string(),
      displayName: z.string(),
      country: z.string().optional(),
      city: z.string().optional(),
      carBrand: z.string().optional(),
      carModel: z.string().optional(),
      bio: z.string().optional(),
      profilePicture: z.string().nullable().optional(),
    }))
    .mutation(async ({ input }) => {
      console.log("[USER] ensureUser called for:", input.id, input.displayName);
      if (!isDbConfigured()) return { success: false, error: "Database not configured" };

      try {
        const checkUrl = `${getSupabaseRestUrl("users")}?id=eq.${encodeURIComponent(input.id)}&select=id,display_name&limit=1`;
        const checkResp = await fetch(checkUrl, { method: "GET", headers: getSupabaseHeaders() });

        if (checkResp.ok) {
          const existing = await checkResp.json();
          if (existing.length > 0) {
            const currentName = existing[0].display_name;
            if (!currentName || currentName !== input.displayName) {
              console.log("[USER] Updating display_name from", currentName, "to", input.displayName);
              const updates: Record<string, unknown> = { display_name: input.displayName };
              if (input.country) updates.country = input.country;
              if (input.city) updates.city = input.city;
              if (input.carBrand) updates.car_brand = input.carBrand;
              if (input.carModel) updates.car_model = input.carModel;
              if (input.bio) updates.bio = input.bio;
              if (input.profilePicture !== undefined) updates.profile_picture = input.profilePicture;

              const patchUrl = `${getSupabaseRestUrl("users")}?id=eq.${encodeURIComponent(input.id)}`;
              await fetch(patchUrl, {
                method: "PATCH",
                headers: getSupabaseHeaders(),
                body: JSON.stringify(updates),
              });
            }
            return { success: true, action: "updated" };
          }
        }

        console.log("[USER] User not found in DB, inserting:", input.id);
        const dbUser: Record<string, unknown> = {
          id: input.id,
          email: input.email,
          display_name: input.displayName,
          country: input.country,
          city: input.city,
          car_brand: input.carBrand,
          car_model: input.carModel,
          bio: input.bio,
          profile_picture: input.profilePicture || null,
          created_at: Date.now(),
          welcome_email_sent: false,
        };

        const resp = await fetch(getSupabaseRestUrl("users"), {
          method: "POST",
          headers: getSupabaseHeaders(),
          body: JSON.stringify(dbUser),
        });

        if (!resp.ok) {
          const err = await resp.text();
          console.error("[USER] ensureUser insert failed:", err);
          return { success: false, error: err };
        }

        console.log("[USER] User inserted via ensureUser:", input.id);
        return { success: true, action: "inserted" };
      } catch (error) {
        console.error("[USER] ensureUser error:", error);
        return { success: false, error: "Network error" };
      }
    }),

  deleteAccount: publicProcedure
    .input(z.object({
      userId: z.string(),
    }))
    .mutation(async ({ input }) => {
      console.log("[DELETE_ACCOUNT] Starting full account deletion for user:", input.userId);

      if (!isDbConfigured()) {
        return { success: false, error: "Database not configured" };
      }

      const tables = [
        { name: "post_comments", column: "user_id" },
        { name: "post_revs", column: "user_id" },
        { name: "activity_revs", column: "user_id" },
        { name: "notifications", column: "user_id" },
        { name: "notifications", column: "from_user_id" },
        { name: "user_achievements", column: "user_id" },
        { name: "follows", column: "follower_id" },
        { name: "follows", column: "following_id" },
        { name: "posts", column: "user_id" },
        { name: "activity_feed", column: "user_id" },
        { name: "trips", column: "user_id" },
        { name: "password_reset_codes", column: "email" },
      ];

      const errors: string[] = [];

      const user = await getUserById(input.userId);
      const userEmail = user?.email;

      for (const table of tables) {
        try {
          let filterValue = input.userId;
          if (table.column === "email" && userEmail) {
            filterValue = userEmail.toLowerCase();
          } else if (table.column === "email" && !userEmail) {
            console.log(`[DELETE_ACCOUNT] Skipping ${table.name} (no email found)`);
            continue;
          }

          const url = `${getSupabaseRestUrl(table.name)}?${table.column}=eq.${encodeURIComponent(filterValue)}`;
          console.log(`[DELETE_ACCOUNT] Deleting from ${table.name} where ${table.column}=${filterValue}`);

          const response = await fetch(url, {
            method: "DELETE",
            headers: getSupabaseHeaders(),
          });

          if (!response.ok) {
            const errText = await response.text();
            console.error(`[DELETE_ACCOUNT] Failed to delete from ${table.name}:`, errText);
            errors.push(`${table.name}: ${errText}`);
          } else {
            console.log(`[DELETE_ACCOUNT] Deleted from ${table.name} successfully`);
          }
        } catch (error) {
          console.error(`[DELETE_ACCOUNT] Error deleting from ${table.name}:`, error);
          errors.push(`${table.name}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }

      try {
        const url = `${getSupabaseRestUrl("users")}?id=eq.${encodeURIComponent(input.userId)}`;
        console.log("[DELETE_ACCOUNT] Deleting user record:", input.userId);
        const response = await fetch(url, {
          method: "DELETE",
          headers: getSupabaseHeaders(),
        });

        if (!response.ok) {
          const errText = await response.text();
          console.error("[DELETE_ACCOUNT] Failed to delete user record:", errText);
          errors.push(`users: ${errText}`);
        } else {
          console.log("[DELETE_ACCOUNT] User record deleted successfully");
        }
      } catch (error) {
        console.error("[DELETE_ACCOUNT] Error deleting user record:", error);
        errors.push(`users: ${error instanceof Error ? error.message : String(error)}`);
      }

      if (errors.length > 0) {
        console.error("[DELETE_ACCOUNT] Completed with errors:", errors);
        return { success: true, partial: true, errors };
      }

      console.log("[DELETE_ACCOUNT] Account fully deleted for user:", input.userId);
      return { success: true, partial: false };
    }),
});
