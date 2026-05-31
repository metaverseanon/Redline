---
name: Supabase schema is manually managed (no migrations)
description: How the RedLine Supabase schema changes are applied and why createPost can silently drop fields
---

# Supabase schema is hand-managed (no migration system in repo)

The RedLine backend talks to Supabase via PostgREST only (REST), using hardcoded
anon + service-role JWTs in `artifacts/api-server/src/backend/trpc/db.ts`. There is
**no** SQL migration system, no `.sql` files, and no Postgres connection string in
the project. The service-role JWT works for PostgREST/Storage but **cannot run DDL**
(ALTER TABLE). New columns must be added by the user in the Supabase dashboard SQL
editor.

**Why this matters:** `createPost` (posts.ts) has a graceful-degrade path: if an
insert hits an unknown column (PGRST/42703), it retries the insert WITHOUT that
field. So when a column is missing (e.g. `posts.soundtrack`), posts still save but
the field is **silently dropped** — no error surfaces to the user. Symptom seen:
a post's Drive Soundtrack never appeared because the `posts` table lacked a
`soundtrack jsonb` column (only had id, user_id, text, image_url, created_at).

**How to apply / debug:**
- To check/confirm a column exists, query PostgREST directly with the service key
  (extract via `rg -o "HARDCODED_SERVICE_ROLE_KEY = '([^']+)'" -r '$1' ...db.ts`
  into a shell var — never print it). `select=<col>` returns code 42703 if missing.
- To add a column, give the user the exact SQL to run in Supabase SQL editor, e.g.
  `ALTER TABLE posts ADD COLUMN soundtrack jsonb;`. No app code change or redeploy
  is needed afterward — feed reads use `select=*` and map the column already.
- Trip soundtracks are stored **locally on-device** (AsyncStorage via useTrips),
  not in Supabase — the `trips` table also has no soundtrack column. That's why a
  trip's song shows on the same phone but a post's song needs the server column.
