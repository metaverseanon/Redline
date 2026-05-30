import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "../create-context";
import { cachedOrFetch } from "../cache";

const ITUNES_SEARCH_URL = "https://itunes.apple.com/search";

const SEARCH_TTL_MS = 24 * 60 * 60 * 1000;

const TrackSchema = z.object({
  trackId: z.number(),
  trackName: z.string(),
  artistName: z.string(),
  artworkUrl: z.string(),
  previewUrl: z.string(),
});

export type Track = z.infer<typeof TrackSchema>;

const SearchOutput = z.object({
  tracks: z.array(TrackSchema),
});

interface ITunesResult {
  trackId?: number;
  trackName?: string;
  artistName?: string;
  artworkUrl100?: string;
  previewUrl?: string;
}

export const musicRouter = createTRPCRouter({
  searchTracks: publicProcedure
    .input(
      z.object({
        query: z.string().min(1).max(100),
        limit: z.number().min(1).max(25).optional().default(20),
      })
    )
    .output(SearchOutput)
    .query(async ({ input }) => {
      const term = input.query.trim();
      if (!term) return { tracks: [] };

      const cacheKey = `itunes:${term.toLowerCase()}:${input.limit}`;
      try {
        return await cachedOrFetch(cacheKey, SEARCH_TTL_MS, async () => {
          const url = `${ITUNES_SEARCH_URL}?term=${encodeURIComponent(
            term
          )}&media=music&entity=song&limit=${input.limit}`;

          const resp = await fetch(url, { headers: { Accept: "application/json" } });
          if (!resp.ok) {
            console.error("[MUSIC] iTunes search failed:", resp.status);
            throw new Error(`iTunes search failed: ${resp.status}`);
          }

          const data = (await resp.json()) as { results?: ITunesResult[] };
          const results = Array.isArray(data.results) ? data.results : [];

          const tracks: Track[] = [];
          for (const r of results) {
            if (!r.trackId || !r.trackName || !r.artistName || !r.previewUrl) continue;
            const artwork = (r.artworkUrl100 ?? "").replace("100x100bb", "300x300bb");
            tracks.push({
              trackId: r.trackId,
              trackName: r.trackName,
              artistName: r.artistName,
              artworkUrl: artwork,
              previewUrl: r.previewUrl,
            });
          }

          console.log("[MUSIC] searchTracks:", term, "->", tracks.length, "tracks");
          return { tracks };
        });
      } catch (error) {
        console.error("[MUSIC] searchTracks error:", error);
        throw error;
      }
    }),
});
