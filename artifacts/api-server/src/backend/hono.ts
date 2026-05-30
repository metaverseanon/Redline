import { trpcServer } from "@hono/trpc-server";
import { Hono } from "hono";
import { cors } from "hono/cors";

import { appRouter } from "./trpc/app-router";
import { createContext } from "./trpc/create-context";
import { getDbConfig } from "./trpc/db";
import { renderReplayVideo, ReplayRenderInputSchema } from "./replay/render";

const BACKEND_VERSION = "1.3.0";
console.log(`[BACKEND] Starting RedLine API v${BACKEND_VERSION}`);

const app = new Hono();

app.use("*", cors());

const trpcHandler = trpcServer({
  endpoint: "/api/trpc",
  router: appRouter,
  createContext,
});

app.use("/api/trpc/*", trpcHandler);
app.use("/trpc/*", trpcHandler);

app.get("/", (c) => c.json({ status: "ok", message: "API is running", version: BACKEND_VERSION }));
app.get("/api", (c) => c.json({ status: "ok", message: "API is running", version: BACKEND_VERSION }));
app.get("/api/healthz", (c) => c.json({ status: "ok", version: BACKEND_VERSION }));

const MAX_CONCURRENT_RENDERS = 2;
let activeRenders = 0;

const replayRenderHandler = async (c: any) => {
  if (activeRenders >= MAX_CONCURRENT_RENDERS) {
    return c.json({ error: "Server busy, try again shortly" }, 503, { "Retry-After": "5" });
  }
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }
  const parsed = ReplayRenderInputSchema.safeParse(body);
  if (!parsed.success) {
    console.warn("[REPLAY] Invalid render input:", parsed.error.flatten());
    return c.json({ error: "Invalid replay input", details: parsed.error.flatten() }, 400);
  }
  activeRenders++;
  try {
    console.log("[REPLAY] Rendering video, points:", parsed.data.route.length, "watermark:", !!parsed.data.watermark);
    const mp4 = await renderReplayVideo(parsed.data);
    console.log("[REPLAY] Render complete, bytes:", mp4.length);
    return new Response(new Uint8Array(mp4), {
      status: 200,
      headers: {
        "Content-Type": "video/mp4",
        "Content-Length": String(mp4.length),
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("[REPLAY] Render failed:", err);
    return c.json({ error: "Render failed", message: err instanceof Error ? err.message : "unknown" }, 500);
  } finally {
    activeRenders--;
  }
};

app.post("/api/replay/render", replayRenderHandler);
app.post("/replay/render", replayRenderHandler);

app.get("/health", (c) => {
  const dbEndpoint =
    process.env.RORK_DB_ENDPOINT ??
    process.env.DB_ENDPOINT ??
    process.env.EXPO_PUBLIC_RORK_DB_ENDPOINT;
  const dbNamespace =
    process.env.RORK_DB_NAMESPACE ??
    process.env.DB_NAMESPACE ??
    process.env.EXPO_PUBLIC_RORK_DB_NAMESPACE;
  const dbToken =
    process.env.RORK_DB_TOKEN ??
    process.env.DB_TOKEN ??
    process.env.EXPO_PUBLIC_RORK_DB_TOKEN;

  const dbConfigured = !!(dbEndpoint && dbNamespace && dbToken);

  console.log("[HEALTH] DB Config check:", {
    hasEndpoint: !!dbEndpoint,
    hasNamespace: !!dbNamespace,
    hasToken: !!dbToken,
    configured: dbConfigured,
  });

  return c.json({
    status: dbConfigured ? "ok" : "error",
    database: {
      configured: dbConfigured,
      hasEndpoint: !!dbEndpoint,
      hasNamespace: !!dbNamespace,
      hasToken: !!dbToken,
    },
    version: BACKEND_VERSION,
    timestamp: new Date().toISOString(),
  });
});

const weeklyRecapHandler = async (c: any) => {
  const authHeader = c.req.header("Authorization");
  const cronSecret = process.env.CRON_SECRET;
  
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    console.log("[CRON] Unauthorized request to weekly-recap");
    return c.json({ error: "Unauthorized" }, 401);
  }
  
  console.log("[CRON] Timezone-aware weekly recap triggered at", new Date().toISOString());
  
  try {
    const caller = appRouter.createCaller({ req: c.req.raw, db: getDbConfig() });
    const result = await caller.weeklyEmail.sendWeeklyRecapByTimezone({ targetHour: 22, forceSend: false });
    
    console.log("[CRON] Weekly recap completed:", result);
    return c.json({ 
      ...result,
      triggeredAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[CRON] Weekly recap failed:", error);
    return c.json({ 
      success: false, 
      error: error instanceof Error ? error.message : "Unknown error",
    }, 500);
  }
};

for (const prefix of ["/cron", "/api/cron"]) {
  app.get(`${prefix}/weekly-recap`, weeklyRecapHandler);
  app.post(`${prefix}/weekly-recap`, weeklyRecapHandler);
  app.get(`${prefix}/weekly-recap-notifications`, weeklyRecapHandler);
  app.post(`${prefix}/weekly-recap-notifications`, weeklyRecapHandler);
  app.get(`${prefix}/weekly_recap_notifications`, weeklyRecapHandler);
  app.post(`${prefix}/weekly_recap_notifications`, weeklyRecapHandler);
}

const driveReminderHandler = async (c: any) => {
  const authHeader = c.req.header("Authorization");
  const cronSecret = process.env.CRON_SECRET;
  
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    console.log("[CRON] Unauthorized request to drive-reminder");
    return c.json({ error: "Unauthorized" }, 401);
  }
  
  console.log("[CRON] Friday drive reminder triggered at", new Date().toISOString());
  
  try {
    const caller = appRouter.createCaller({ req: c.req.raw, db: getDbConfig() });
    const result = await caller.notifications.sendDriveReminderNotifications({});
    
    console.log("[CRON] Drive reminder completed:", result);
    return c.json({ 
      ...result,
      triggeredAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[CRON] Drive reminder failed:", error);
    return c.json({ 
      success: false, 
      error: error instanceof Error ? error.message : "Unknown error",
    }, 500);
  }
};

for (const prefix of ["/cron", "/api/cron"]) {
  app.get(`${prefix}/drive-reminder`, driveReminderHandler);
  app.post(`${prefix}/drive-reminder`, driveReminderHandler);
  app.get(`${prefix}/drive_reminder`, driveReminderHandler);
  app.post(`${prefix}/drive_reminder`, driveReminderHandler);
}

const backfillWelcomeEmailsHandler = async (c: any) => {
  const authHeader = c.req.header("Authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    console.log("[CRON] Unauthorized request to backfill-welcome-emails");
    return c.json({ error: "Unauthorized" }, 401);
  }

  console.log("[CRON] Backfill welcome emails triggered at", new Date().toISOString());

  try {
    const limitParam = c.req.query("limit");
    const limit = limitParam ? Math.max(1, Math.min(500, parseInt(limitParam, 10) || 100)) : 100;
    const caller = appRouter.createCaller({ req: c.req.raw, db: getDbConfig() });
    const result = await caller.user.backfillWelcomeEmails({ limit });
    console.log("[CRON] Backfill completed:", result);
    return c.json({ ...result, triggeredAt: new Date().toISOString() });
  } catch (error) {
    console.error("[CRON] Backfill failed:", error);
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }, 500);
  }
};

for (const prefix of ["/cron", "/api/cron"]) {
  app.get(`${prefix}/backfill-welcome-emails`, backfillWelcomeEmailsHandler);
  app.post(`${prefix}/backfill-welcome-emails`, backfillWelcomeEmailsHandler);
}

const cronCatchAll = (c: any) => {
  console.log("[CRON] Unmatched cron route:", c.req.method, c.req.url, c.req.path);
  return c.json({ error: "Unknown cron route", method: c.req.method, path: c.req.path, url: c.req.url }, 404);
};
app.all("/cron/*", cronCatchAll);
app.all("/api/cron/*", cronCatchAll);

export default app;
