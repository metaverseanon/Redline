import { createTRPCRouter } from "./create-context";
import { exampleRouter } from "./routes/example";
import { userRouter } from "./routes/user";
import { weeklyEmailRouter } from "./routes/weekly-email";
import { notificationsRouter } from "./routes/notifications";
import { tripsRouter } from "./routes/trips";
import { socialRouter } from "./routes/social";
import { postsRouter } from "./routes/posts";
import { analyticsRouter } from "./routes/analytics";
import { privateLeaderboardsRouter } from "./routes/private-leaderboards";
import { communitiesRouter } from "./routes/communities";
import { speedCamerasRouter } from "./routes/speed-cameras";
import { coachRouter } from "./routes/coach";
import { musicRouter } from "./routes/music";

console.log("[ROUTER] Initializing app router v1.2");

export const appRouter = createTRPCRouter({
  example: exampleRouter,
  user: userRouter,
  weeklyEmail: weeklyEmailRouter,
  notifications: notificationsRouter,
  trips: tripsRouter,
  social: socialRouter,
  posts: postsRouter,
  analytics: analyticsRouter,
  privateLeaderboards: privateLeaderboardsRouter,
  communities: communitiesRouter,
  speedCameras: speedCamerasRouter,
  coach: coachRouter,
  music: musicRouter,
});

export type AppRouter = typeof appRouter;
