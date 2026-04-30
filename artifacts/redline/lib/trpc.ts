import { httpLink } from "@trpc/client";
import { createTRPCReact } from "@trpc/react-query";
import superjson from "superjson";

import type { AppRouter } from "@/backend/trpc/app-router";

export const trpc = createTRPCReact<AppRouter>();

const getBaseUrl = (): string | null => {
  const url = process.env.EXPO_PUBLIC_RORK_API_BASE_URL;
  if (!url) {
    console.error('[TRPC] EXPO_PUBLIC_RORK_API_BASE_URL is not set. Backend requests will fail until this env var is configured.');
    return null;
  }
  return url.replace(/\/$/, '');
};

const RAW_BASE_URL = getBaseUrl();
const TRPC_URL = RAW_BASE_URL ? `${RAW_BASE_URL}/api/trpc` : 'https://api.placeholder.invalid/api/trpc';
console.log('[TRPC] Endpoint:', TRPC_URL);

const REQUEST_TIMEOUT_MS = 30000;
const MAX_RETRIES_ON_429 = 4;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const trpcClient = trpc.createClient({
  links: [
    httpLink({
      url: TRPC_URL,
      transformer: superjson,
      fetch: async (url, options) => {
        let attempt = 0;
        let lastResponse: Response | null = null;

        while (attempt <= MAX_RETRIES_ON_429) {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

          try {
            if (!RAW_BASE_URL) {
              throw new Error('[TRPC] Missing EXPO_PUBLIC_RORK_API_BASE_URL — cannot reach backend');
            }
            const response = await fetch(url, {
              ...options,
              signal: controller.signal,
            });

            if (response.status === 429 || response.status === 503) {
              lastResponse = response;
              const retryAfterHeader = response.headers.get('retry-after');
              const retryAfterSec = retryAfterHeader ? parseInt(retryAfterHeader, 10) : NaN;
              const backoffMs = Number.isFinite(retryAfterSec)
                ? Math.min(retryAfterSec * 1000, 8000)
                : Math.min(800 * Math.pow(2, attempt) + Math.random() * 400, 8000);
              console.warn(`[TRPC] ${response.status} on attempt ${attempt + 1}/${MAX_RETRIES_ON_429 + 1}, retrying in ${Math.round(backoffMs)}ms`);
              attempt += 1;
              if (attempt > MAX_RETRIES_ON_429) {
                return response;
              }
              await sleep(backoffMs);
              continue;
            }

            return response;
          } catch (error) {
            if (error instanceof Error && error.name === 'AbortError') {
              console.warn('[TRPC] Request timed out:', String(url).substring(0, 100));
            } else {
              console.warn('[TRPC] Fetch error:', error instanceof Error ? error.message : 'Unknown error');
            }
            throw error;
          } finally {
            clearTimeout(timeoutId);
          }
        }

        if (lastResponse) return lastResponse;
        throw new Error('[TRPC] Unexpected retry loop exit');
      },
    }),
  ],
});
