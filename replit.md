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
- `EXPO_PUBLIC_SUPERWALL_IOS_API_KEY` / `EXPO_PUBLIC_SUPERWALL_ANDROID_API_KEY` —
  Superwall **public** client keys (from the Superwall dashboard). A single key is
  acceptable — `lib/superwall.tsx` falls back to the other platform's key if only
  one is set. Requested as a Replit **secret** so dev builds / Expo Go-with-dev-
  client pick it up at runtime. For **production** EAS builds, add the SAME public
  key(s) to `eas.json` production `env` (safe to commit, mirroring the TikTok /
  PostHog public keys) and rebuild. **Do NOT add a placeholder/empty key to
  `eas.json`:** a truthy-but-wrong key makes Superwall try to configure and then
  error on `registerPlacement` — which returns `"error"` (not `null`), so the app
  would NOT fall back to the RC paywall and prod paywalls would break. Leave the
  keys out entirely until the real public key is available (no key ⇒ clean RC
  fallback).

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
- **Paywall presentation (Superwall, layered over RevenueCat):** `expo-superwall`
  (auto-links, NO config plugin in `app.json`). **Option A** — when a Superwall
  public key is configured, Superwall takes over paywall presentation EVERYWHERE
  via the existing imperative `presentPaywall(source)`; RevenueCat stays the
  purchase + entitlement backend through a Superwall `CustomPurchaseController`.
  The existing `CustomPaywallModal` is the **automatic fallback** when Superwall
  is unconfigured (web / Expo Go / no key) OR its bridge hasn't mounted yet — so
  with no key, behavior is byte-for-byte unchanged. `lib/superwall.tsx`:
  lazy-requires the native modules (guarded by `Platform.OS !== 'web'`);
  `isSuperwallConfigured()` gates everything; `SuperwallBridge` (usePlacement)
  sets a module-level resolver and `registerSuperwallPlacement(source)` returns
  `PaywallResult | null` (**null = bridge not mounted ⇒ caller falls back to RC
  modal**). The placement name IS the existing `source` string, so all ~10 trigger
  sites work unchanged. Results settle **deterministically from SW callbacks**
  (onDismiss → purchased/restored/cancelled, onSkip / feature-grant →
  not_presented, onError → error) — never from a fixed-time inference (a long
  multi-minute safety timer only prevents a hung awaiter). The purchase controller
  (`onPurchase`/`onPurchaseRestore`) delegates to `react-native-purchases`
  (`getProducts` → `purchaseStoreProduct`) and reuses the EXACT analytics via
  `recordSubscribeTapped` / `recordSuccessfulPurchase` (extracted from
  `purchaseMutation`, same ad-SDK + PostHog + funnel events). `SuperwallGate` is
  mounted in `_layout.tsx` inside `RevenueCatUserSync` + `UserProvider` so
  `SuperwallSync` can mirror app user id (`identify`) and RC entitlement
  (`setSubscriptionStatus` ACTIVE/INACTIVE) into Superwall; `SuperwallProvider`
  renders children unconditionally so it never blocks app startup. Requires a
  native EAS rebuild + dashboard paywall/placement config (user-owned). The two
  `lib/superwall.tsx` ↔ `lib/revenuecat.tsx` imports are circular but safe
  (namespace imports, cross-calls only at runtime).
- **Sign in with Apple (iOS):** `expo-apple-authentication` (`ios.usesAppleSignIn:true`
  + plugin in `app.json`). Button is the official `AppleAuthenticationButton`,
  gated on `Platform.OS === 'ios'` + `isAvailableAsync()`, rendered next to the
  Google button on `app/profile.tsx`. `UserProvider.signInWithApple(appleUserId,
  email?, fullName?)` keys the account on a deterministic synthetic email
  `apple_<credential.user>@privaterelay.appleid.com` (Apple only returns the real
  email/name on the FIRST authorization, so the stable `credential.user` id is the
  durable key). Backend `register` accepts `authProvider:'apple'` and, on an
  existing Apple account with no password, returns `existing:true` + the canonical
  stored user so the client adopts the real backend id (preserving trips/posts
  ownership). Scoped to apple only — the Google/email "already exists" rejection is
  unchanged. No server-side `identityToken` verification (consistent with the
  app's client-asserted-userId trust model). Requires a native build to test
  (not Expo Go / web). The synthetic email is the durable identity key and is
  never shown to the user: the real email Apple returns on the first/re-link auth
  is captured into `UserProfile.appleEmail` (AsyncStorage) and surfaced via
  `lib/appleEmail.ts` `getDisplayEmail()` on the settings account card + profile
  EMAIL row (read-only for Apple users, excluded from `updateProfile` so the key
  can't be overwritten).
  - **Server-side deliverable email (`users.notification_email`):** because the
    synthetic identity email always bounces, the real email is ALSO persisted
    server-side in a dedicated `notification_email` column (separate from the
    identity `email`, which never changes). The client forwards `appleEmail` as
    `notificationEmail` to both `register` and `ensureUser`; the backend stores it
    on insert and backfills it onto existing rows when missing (no-clobber on every
    path: apple re-auth, raced-duplicate, ensureUser existing-row + email-pre-check).
    `pickWelcomeEmail(notification_email, email)` chooses the send target;
    `backfillWelcomeEmails` uses it so previously-skipped Apple rows now get the
    welcome email. Requires a one-time Supabase DDL:
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS notification_email text;` (dev+prod
    share one Supabase, so run once). Prod must be redeployed for ongoing sync.

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

- **Territory Claiming Game (Pro-gated social):** driving claims hexagonal H3 map
  cells as territory; users compete for regional "King of the Area" + a global
  most-territory leaderboard. H3 via `h3-js` (pure JS, bundles into both the
  api-server esbuild bundle and the Expo Metro bundle). **On the Expo client
  `h3-js` is LAZY-loaded** (`getH3()` cached `require` inside `lib/territory.ts`,
  guarded by try/catch) — it must NEVER be statically imported on the app boot
  path. `h3-js` is an emscripten/asm.js module that runs heavy init at import
  time; reaching it at boot (via `TripProvider`) crashed release Hermes on launch
  (worked in dev/JSC). Only `cellToPolygon`/`latLngToRegion` use it (map render,
  post-boot); `recordTerritoryForTrip` is H3-free (server does all H3). Resolutions:
  `TERRITORY_RES=9` (~174m claimable cells), `REGION_RES=6` (district/area for
  Kings). **Server-authoritative** — empty cells claim instantly; a rival-owned
  cell can only be taken by a **Pro** user whose visit count out-drives the
  current owner's (`isPro && myVisits > owner_visits`). Free users are capped at
  `FREE_CELL_CAP=50` owned cells; Pro is unlimited + contesting + King
  eligibility. Pro is re-verified **server-side** via `fetchProUserIds`
  (RevenueCat), never trusting the client. Backend router `territory`
  (`artifacts/api-server/src/backend/trpc/routes/territory.ts`):
  `recordTrip` (mutation), `getCellsInBounds` / `getMyTerritory` /
  `getGlobalLeaderboard` / `getRegionLeaderboard` (queries). King = the **top Pro
  owner** in a region. Uncontested writes (new claims + cells you already own)
  use REST upsert (`on_conflict` + `Prefer: resolution=merge-duplicates`);
  **contested takeovers** of a rival's cell use a DB-guarded conditional `PATCH`
  (`owner_id=neq.me & owner_visits=lt.myVisits`, `return=representation`) so two
  rivals racing on the same cell can't both win — the contest rule is enforced
  atomically at the DB, not from the stale snapshot read; a guard miss is reported
  as `blocked`. `recordTrip` returns a `persisted`
  flag: when the upserts don't commit (missing tables / transient DB error) it
  returns `persisted:false` with zeroed counts and skips cache invalidation, and
  the client (`lib/territory.ts` `recordTerritoryForTrip`) only marks a trip
  recorded (AsyncStorage `territory_recorded_trips` dedupe guard) **after**
  `persisted:true`, so a failed record is never permanently lost. Recording is
  **retried off a DURABLE pending set** (`territory_pending_trips` in AsyncStorage):
  `recordTerritoryForTrip` adds the trip id to the pending set **before** the network
  call and removes it only on `persisted:true` (exports
  `getPendingTerritoryTripIds()` / `clearPendingTerritoryTrip()`).
  `TripProvider.retryPendingTerritory` re-calls `recordTerritoryForTrip` for **only
  the pending ids** on each sync cycle (mount / reconnect), dropping any pending id
  whose trip/route is gone. It must retry **only pending** trips — never the full
  trip history — because each `recordTrip` call increments visit counts by +1, so
  replaying an already-persisted trip would double-count and could flip ownership
  (the old rolling-200-id dedupe aged out for >200-trip users and caused exactly
  that). The retry runs **independently of trip-sync state** (called before
  `syncUnsyncedTrips`' "all synced" early return) because a trip can sync to the
  backend while its territory write fails.
  `getCellsInBounds` degrades to empty cells on any non-OK response (no hard map
  error). Leaderboards aggregate in-memory from `territory_cells`, cached via
  `cachedOrFetch` (global 60s, region 30s, my 20s). Client `lib/territory.ts`:
  `cellToPolygon` (h3 → RN-maps ring), `TERRITORY_COLORS`, downsample to 1000
  pts; `recordTerritoryForTrip` is wired into `TripProvider` `stopTracking` →
  `doBackgroundWork` (after `syncTripToBackend`). UI: `app/(tabs)/track.tsx` map
  view has a native-only (`Platform.OS!=='web'`) Polygon overlay driven by
  `onRegionChangeComplete` bounds + a "Territory" toggle button (off by default);
  `components/TerritoryCard.tsx` (mounted on the leaderboard tab above
  CommunityCard) shows my cell count / cap-remaining / King status + Pro upsell;
  `components/TerritoryModal.tsx` shows Global + My-Area rankings with the
  `tryPaywall`+`Alert` Pro-gating pattern and loading/error-retry/empty states.
  **REQUIRED one-time Supabase DDL** (dev+prod share one instance, run once):
  ```sql
  CREATE TABLE IF NOT EXISTS territory_cells (
    h3 text PRIMARY KEY, owner_id text NOT NULL, owner_visits int NOT NULL DEFAULT 1,
    region_h3 text NOT NULL, lat float8 NOT NULL, lng float8 NOT NULL,
    updated_at int8 NOT NULL);
  CREATE INDEX IF NOT EXISTS territory_cells_owner_idx ON territory_cells(owner_id);
  CREATE INDEX IF NOT EXISTS territory_cells_region_idx ON territory_cells(region_h3);
  CREATE INDEX IF NOT EXISTS territory_cells_latlng_idx ON territory_cells(lat, lng);
  CREATE TABLE IF NOT EXISTS territory_claims (
    id text PRIMARY KEY, h3 text NOT NULL, user_id text NOT NULL, visits int NOT NULL DEFAULT 1,
    region_h3 text NOT NULL, updated_at int8 NOT NULL, UNIQUE (h3, user_id));
  CREATE INDEX IF NOT EXISTS territory_claims_user_idx ON territory_claims(user_id);
  ```
  Until the DDL is applied the feature degrades cleanly (empty everywhere, no
  errors); prod must be redeployed so the new router ships.

### Post tagging + Instagram-style Discover

- **Tag people in posts:** `createPost` accepts `taggedUsers: {id,name}[]` (max 20),
  persisted to a `posts.tagged_users` jsonb column; `parseTaggedUsers` reads it back
  and all three post outputs (`getFeedPosts`/`getUserPosts`/`getDiscoverPosts`)
  return `taggedUsers`. Mirrors the soundtrack graceful-degrade pattern: if the
  column is missing, `createPost` retries the insert without `tagged_users` (+
  soundtrack), so the feature degrades cleanly until the DDL is applied. UI:
  `app/create-post.tsx` has a "Tag People" toolbar button → a search modal
  (`social.searchUsers`) with removable chips; `feed.tsx` renders a tappable
  "with NAME, …" row on post cards that routes to each tagged user's profile.
  **REQUIRED one-time Supabase DDL** (dev+prod share one instance, run once):
  `ALTER TABLE posts ADD COLUMN IF NOT EXISTS tagged_users jsonb;`
- **Discover pagination (no repeats, image-weighted):** `posts.getDiscoverPosts`
  and `social.getDiscoverDrives` both take `excludeIds: string[]` (default `[]`) and
  a smaller `limit` (posts 10, drives 6 from the client); they filter out
  excludeIds and `getDiscoverPosts` orders image posts first (Fisher-Yates
  shuffled) then text posts. The client (`feed.tsx`) accumulates results into a
  `discoverItems` state + a `discoverSeenRef` Set; `onEndReached` sets
  `excludeIds` to the accumulated seen ids to load the next page; pull-to-refresh
  resets the set/items; a footer spinner shows during page loads. Rev/unrev on the
  Discover tab patches `discoverItems` directly (the old optimistic cache keys no
  longer match the paginated query keys).

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

### Funnel analytics events (PostHog)

Five standard funnel events are instrumented for PostHog (the funnel/conversion
tooling). PostHog is the guaranteed sink for all five; the in-paywall events also
flow to the custom backend analytics store.

- **Dual-sink wiring:** the custom `useAnalytics().track()`
  (`providers/AnalyticsProvider.tsx`) now ALSO calls `posthogCapture(event, props)`,
  so every event routed through `track()` — including the existing `paywall_*`
  events fired via the `logPaywallEvent` → `PaywallAnalyticsBridge` path — lands in
  PostHog too. Provider-level events that sit ABOVE `AnalyticsProvider` in the tree
  (`UserProvider`, `SubscriptionProvider`) can't use the `track` hook, so they call
  the plain `posthogCapture()` function directly.
- `account_created` — `providers/UserProvider.tsx`, fired on a genuinely NEW
  account only. The backend `register` returns `{ success:false }` (NOT a throw)
  for an already-existing email/Google account, and `{ upgraded:true }` when an
  existing Google-only account just adds a password — so both paths gate on
  `result.success === true && !result.upgraded`. Apple fires only when
  `!result.existing`. Prop: `method` (`email`|`google`|`apple`).
- `paywall_viewed` — `lib/revenuecat.tsx` `presentPaywall`, alongside the existing
  `paywall_presented`. Prop: `source`.
- `subscribe_tapped` — `lib/revenuecat.tsx` `purchaseMutation.mutationFn`, fired at
  the start (every purchase attempt, the custom `CustomPaywallModal` purchase
  button). Props: `plan`, `productId`, `value`, `currency`, `trial`.
- `subscribe` — same mutation, success block, next to
  `paywall_purchase_succeeded` (kept). Props: `plan`, `value`, `currency`,
  `productId`, `trial`, `orderId`.
- `subscription_cancelled` — `SubscriptionProvider` effect watching the Pro
  entitlement's `unsubscribeDetectedAt` (auto-renew turned off; entitlement stays
  active until expiry). Deduped via **AsyncStorage** (`subscription_cancel_logged:
  <userId>` = the `unsubscribeDetectedAt` value) so it fires once per cancellation
  even across cold starts. Props: `plan`/`productId`, `expirationDate`,
  `willRenew`.
- `subscription_started` — `lib/revenuecat.tsx` `purchaseMutation` success block,
  fired straight to PostHog via `posthogCapture` (matching `subscription_cancelled`,
  separate from the dual-sinked `subscribe` event). Carries a `$set` payload
  (`is_pro:true`, `subscription_plan`) so the same event also updates the PostHog
  **person profile** (no noisy standalone `$set` event). Props: `plan`, `price`,
  `currency`, `productId`, `trial`, `orderId`.
- **Screen views** — centralized in `app/_layout.tsx` via a `ScreenTracker`
  component (expo-router `usePathname()` → `posthogScreen(name, { path })` on route
  change). expo-router rides React Navigation v7, where PostHog screen autocapture
  is unreliable, so `PostHogAppProvider` keeps `captureScreens:false` and we emit
  screens manually. A `SCREEN_NAMES` path→human-readable map (with a `humanizePath`
  fallback) names each route. `posthogScreen` lives in `lib/posthog.tsx`.
- All capture paths are no-ops on web / when `EXPO_PUBLIC_POSTHOG_API_KEY` is
  absent, and wrapped so analytics never breaks the purchase/auth flow. Requires a
  native build (or Expo Go with the key) to emit real events.

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
