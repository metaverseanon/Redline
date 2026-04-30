# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.
Hosts the **RedLine** mobile app (Expo/React Native) and its companion **API server**
(Hono + tRPC, talks to Supabase via REST).

## Artifacts

- `artifacts/redline` — Expo mobile app (Expo Go, port `18735`). Tabs: track / feed /
  leaderboard / recap / settings. Migrated from the Rork platform — AppsFlyer,
  `@rork-ai/toolkit-sdk`, and Rork-specific Metro plugins were removed.
- `artifacts/api-server` — Hono + tRPC backend (port `8080`, served at `/api`).
  Hosts the same `backend/` tree the Expo app references type-only. Uses Supabase REST
  (no `@supabase/supabase-js` dep). Health probe: `GET /api/healthz`.
  tRPC mounted at `/api/trpc/*`.
- `artifacts/mockup-sandbox` — design canvas preview server.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **TypeScript version**: 5.9
- **Mobile**: Expo SDK + React Native, `expo-router`, `react-native-maps@1.18.0`
- **API framework**: Hono 4 + `@hono/node-server` + `@hono/trpc-server`
- **RPC**: tRPC v11 with `superjson`
- **Datastore**: Supabase (called via REST from the Hono backend)
- **Validation**: Zod
- **Build (api)**: esbuild → `dist/index.mjs`

## Environment variables

- `EXPO_PUBLIC_RORK_API_BASE_URL` — set in the redline `dev` script to
  `https://$REPLIT_DEV_DOMAIN`; the Expo client appends `/api/trpc/...`.
- `SESSION_SECRET` — generic session secret (provided by Replit).
- Optional: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
  `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`,
  `CRON_SECRET`. Defaults are baked into `backend/trpc/db.ts`.

## Key commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm --filter @workspace/api-server run dev` — build + run API server
- `pnpm --filter @workspace/redline run dev` — start Expo dev server (QR for Expo Go)

## Notes

- The Expo app imports the backend type-only (`import type { AppRouter }` in
  `artifacts/redline/lib/trpc.ts`). To eliminate drift,
  `artifacts/redline/backend` is a **symlink** to `artifacts/api-server/src/backend`
  — single source of truth for tRPC routes.
- The platform proxy passes `/api/*` to the API server **without rewriting**, so all
  Hono routes are mounted under their full path (e.g. `/api/trpc/*`,
  `/api/healthz`, `/api/cron/*`).
- Web bundling fails for the Expo app because `react-native-maps` is native-only —
  the app is intended for mobile (Expo Go), not the web preview iframe. The iOS
  and Android bundles compile cleanly.

### pnpm + Expo monorepo gotchas (already configured)

- Root `.npmrc` sets `shamefully-hoist=true` because Metro doesn't traverse
  pnpm's `.pnpm/` symlink structure when looking up transitive deps. This flat
  layout is the standard Expo + pnpm fix and is harmless to other artifacts.
- `artifacts/redline/metro.config.js` configures explicit `projectRoot`,
  `watchFolders` (workspace root), `nodeModulesPaths`, and enables
  `unstable_enableSymlinks`. Hierarchical resolution is left **enabled** so
  Metro can find each package's scoped dep version (e.g. `semver` v6 hoisted at
  root vs v7 nested under `react-native-reanimated`).
- `@expo/metro-runtime` is added as an explicit dep of `redline` because it's a
  required peer of `expo-router` that pnpm doesn't auto-install.

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
