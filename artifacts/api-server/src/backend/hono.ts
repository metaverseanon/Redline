import { trpcServer } from "@hono/trpc-server";
import { Hono } from "hono";
import { cors } from "hono/cors";

import { appRouter } from "./trpc/app-router";
import { createContext } from "./trpc/create-context";
import { getDbConfig } from "./trpc/db";

const BACKEND_VERSION = "1.2.0";
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

const cronCatchAll = (c: any) => {
  console.log("[CRON] Unmatched cron route:", c.req.method, c.req.url, c.req.path);
  return c.json({ error: "Unknown cron route", method: c.req.method, path: c.req.path, url: c.req.url }, 404);
};
app.all("/cron/*", cronCatchAll);
app.all("/api/cron/*", cronCatchAll);

export default app;
