import * as z from "zod";
import { createTRPCRouter, publicProcedure } from "../create-context";
import { isDbConfigured, getSupabaseHeaders, getSupabaseRestUrl } from "../db";

export const analyticsRouter = createTRPCRouter({
  trackEvents: publicProcedure
    .input(
      z.object({
        events: z.array(
          z.object({
            event: z.string(),
            properties: z.string().optional(),
            timestamp: z.number(),
            anonymousId: z.string(),
            userId: z.string().optional(),
            platform: z.string(),
          })
        ),
      })
    )
    .mutation(async ({ input }) => {
      if (!isDbConfigured()) {
        console.log("[ANALYTICS] DB not configured, skipping");
        return { success: true, stored: 0 };
      }

      try {
        const rows = input.events.map((e) => ({
          event: e.event,
          properties: e.properties || null,
          timestamp: e.timestamp,
          anonymous_id: e.anonymousId,
          user_id: e.userId || null,
          platform: e.platform,
          created_at: Date.now(),
        }));

        const response = await fetch(getSupabaseRestUrl("analytics_events"), {
          method: "POST",
          headers: getSupabaseHeaders(),
          body: JSON.stringify(rows),
        });

        if (!response.ok) {
          const text = await response.text();
          console.error("[ANALYTICS] Failed to store events:", text);
          return { success: false, stored: 0 };
        }

        console.log("[ANALYTICS] Stored", rows.length, "events");
        return { success: true, stored: rows.length };
      } catch (error) {
        console.error("[ANALYTICS] Error storing events:", error);
        return { success: false, stored: 0 };
      }
    }),
});
