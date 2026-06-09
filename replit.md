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
- `EXPO_PUBLIC_REVENUECAT_TEST_API_KEY` — RevenueCat public **test** key, used in
  Expo Go / dev builds (preview API mode mocks purchases). For production builds
  set `EXPO_PUBLIC_REVENUECAT_IOS_API_KEY` / `EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY`.
- `REVENUECAT_SECRET_API_KEY` — RevenueCat **secret** key (server-side only). The
  api-server uses it to verify Pro entitlements via the RevenueCat REST **v2** API
  (new `sk_` keys are rejected by the legacy v1 `/subscribers` endpoint). Powers
  `subscription.syncStatus`, the webhook, and the `/api/cron/backfill-pro`
  reconciliation. Optional overrides: `REVENUECAT_PROJECT_ID`,
  `REVENUECAT_PROJECT_NAME`, `REVENUECAT_ENTITLEMENT_ID` (defaults to
  "RedLine App Pro" lookup_key). Prod must be redeployed with this key set for
  ongoing sync; a one-off backfill from dev fixes the count immediately since
  dev + prod share one Supabase instance.
- `EXPO_PUBLIC_TIKTOK_APP_ID` / `EXPO_PUBLIC_TIKTOK_ACCESS_TOKEN` — TikTok
  Business SDK credentials from TikTok Events Manager (the iOS app source). Set
  in `eas.json` production `env` so they're baked into production builds. The
  access token is required client-side by TikTok's SDK design; treat as
  semi-public and rotate from Events Manager.

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
- Web bundling: `react-native-maps` is native-only, so on the web platform
  Metro aliases the package to `lib/react-native-maps.web.js` (a thin View-based
  stub) via `metro.config.js` `resolver.resolveRequest`. This lets the Expo web
  bundle compile cleanly for the canvas preview iframe. iOS/Android bundles use
  the real native module unchanged. Any new map UI must still be guarded with
  `Platform.OS !== 'web'` checks at the render site so the stub is never relied
  on for actual map functionality.
- **TikTok Business SDK (native ad attribution):** `react-native-tiktok-business-sdk`
  initialized at app boot in `_layout.tsx` alongside AppsFlyer. iOS requests App
  Tracking Transparency permission via `expo-tracking-transparency` before SDK
  init (required for install attribution on iOS 14+). `NSUserTrackingUsageDescription`
  set in `app.json` infoPlist, plugin registered. Wrapper at `lib/tiktok.ts`
  exposes `initializeTikTok()`, `tiktokIdentify(userId, email)`,
  `tiktokTrackRegistration()`, `tiktokTrackLogin()`, `tiktokTrackSubscribe()`,
  `tiktokTrackPurchase()`. Events wired: identify on every authenticated session
  (`_layout.tsx`), Subscribe + Purchase on successful RevenueCat purchase
  (`lib/revenuecat.tsx` `purchaseMutation`) with real price/currency/productId
  pulled from the StoreKit package. Native module is lazily required so web and
  Expo Go cleanly no-op.

- **Subscriptions (RevenueCat):** integrated via `react-native-purchases` and
  `react-native-purchases-ui`. The SDK is initialized at app boot (`_layout.tsx`)
  and identified to the backend user inside `UserProvider` via `SubscriptionProvider`.
  Entitlement checked: `RedLine App Pro`; packages: `monthly`, `yearly` from the
  current default offering. `lib/revenuecat.tsx` exposes `useSubscription()`,
  `presentPaywall()`, and `presentCustomerCenter()` (uses RevenueCat's prebuilt
  Paywall + Customer Center UI). `components/SubscriptionSection.tsx` renders the
  status / upgrade / manage / restore controls and is mounted on the profile screen.
  Native modules are lazily required and the whole feature short-circuits to a
  clean "unavailable" state on web.
- **Pro social features (additive, never gate the free path):**
  - **Friends-only private leaderboards** — Pro users create boards and invite by
    username; free users can join if invited. Backend router
    `privateLeaderboards` (`create`, `listMine`, `getDetails`,
    `inviteByUsername`, `leave`, `delete`) in
    `artifacts/api-server/src/backend/trpc/routes/private-leaderboards.ts`. Server
    enforces membership on `getDetails` and owner-only on `inviteByUsername`/
    `delete`. Requires Supabase tables `private_leaderboards`
    (id, name, owner_id, category, created_at) and
    `private_leaderboard_members` (id, leaderboard_id, user_id, joined_at).
    UI: `components/FriendsBoardsModal.tsx` is **always-mounted** on the
    leaderboard tab (visibility-controlled, not conditionally rendered) and
    opened via two entry points: (a) the small "FRIENDS" header button, and
    (b) a prominent `privateBoardsCta` row above the leaderboard filters
    showing Trophy icon + "Private Boards" + Pro badge + "Create a board,
    invite friends, compete privately" subtitle. All paywall calls in the modal
    go through a `tryPaywall` wrapper that surfaces an `Alert.alert` if
    `presentPaywall` returns `not_presented`/`error` (so the upgrade button
    never silently does nothing).
  - **Model-based auto-communities** — derived from `users.car_brand` +
    `users.car_model`; no new tables. Backend router `communities`
    (`getMyCommunity`, `getCommunityFeed`) in
    `artifacts/api-server/src/backend/trpc/routes/communities.ts`. UI:
    `components/CommunityCard.tsx` is **collapsed by default** (compact 1-line
    header: icon-bubble + brand/model + "N drivers · M trips" + chevron) and
    expands inline on tap to show full stats / top members / activity feed.
    Positioned **below** the meetup pings/location banner (not above) so it
    doesn't dominate the leaderboard entry view. Free users see the community
    read-only with the default "Recent" sort; "Top Speed"/"Distance" sort
    options are Pro and route through `tryPaywall` (with Alert fallback) when
    tapped by free users.

- **AI Drive Coach (Pro, server-side AI):** an AI coach layered on existing Pro
  telemetry. Runs **server-side** via Replit AI Integrations (Anthropic proxy —
  no user key, billed to project credits). `lib/anthropic.ts` lazily builds the
  client and returns **null** when `AI_INTEGRATIONS_ANTHROPIC_*` env vars are
  absent (so the server still boots and the feature degrades gracefully).
  Backend router `coach`
  (`artifacts/api-server/src/backend/trpc/routes/coach.ts`) exposes
  `getTripCoaching` + `getWeeklyCoaching` as **queries**. Both Zod-validate in
  and out, and cache the generated coaching via `cachedOrFetch` (30-day TTL) keyed
  by a content hash (trip: stats+metrics+units+carModel; weekly: aggregate +
  **ordered per-trip payload** so the key invalidates on any trip change). When
  AI is unconfigured they return `{available:false, reason:"ai_unconfigured"}`;
  on AI/validation error they **throw** so the client shows a retry state rather
  than a misleading empty state. UI:
  `components/AICoachCard.tsx` (per-trip card on the recap **recent** view, below
  Pro Telemetry) and `components/AIWeeklyCoachCard.tsx` (weekly trends inside the
  `WeeklyRecapCard` modal, placed **below** the shareable `ViewShot` so it's
  excluded from the shared image). Both are Pro-gated via `useSubscription`:
  free users see a locked teaser that routes to the paywall (`tryPaywall`-style
  Alert fallback), subscribed users get loading / error-retry / content states,
  and the cards hide entirely when AI is unconfigured.

### Feed reliability (Drives / Posts / Discover tabs)

- Backend: `posts.getFeedPosts` (the **Posts** tab) shows **strictly** posts
  from followed users + self — the previous "global fallback when followed
  returns empty" was removed. The Discover tab is the dedicated surface for
  posts/drives from non-followed users. Other feed routes (`social.getFeed`,
  `social.getDiscoverDrives`, `posts.getDiscoverPosts`) keep multi-tier
  fallbacks (recent non-followed → all-time non-followed → include followed).
  Catch blocks `throw` instead of returning `[]` so client distinguishes
  errors from genuinely empty data.
- Frontend (`artifacts/redline/app/(tabs)/feed.tsx`): each tab shows a distinct
  error state with a "Retry" button when the tRPC query fails, instead of the
  misleading "Follow other drivers" empty state. Error state appears only on
  `query.isError`; the original empty state still appears when the API
  successfully returns `[]`.

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
