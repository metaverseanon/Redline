---
name: RedLine user insert duplicate-key storms
description: Why /rest/v1/users 409 (users_email_key / users_display_name_key) floods happen and how to keep them from recurring.
---

RedLine has TWO insert paths into Supabase `users`: tRPC `register` and `ensureUser`.

**Rule:** existence checks must cover EVERY unique constraint on `users`
(`id`, `email`, `display_name`), not just `id`. A check-by-`id`-only miss followed
by a raw `POST /rest/v1/users` collides on email/display_name → 409.

**Why it floods:** the client's `ensureUserInBackend` (UserProvider) retries
`ensureUser` with exponential backoff whenever it returns `success:false`/throws.
So one doomed insert becomes a storm of identical 409s for the same email within
seconds. The id-check misses for the same user under a different id: reinstalls /
cleared storage (fresh local id), Apple synthetic-email accounts adopting the
canonical backend id, etc.

**The doomed INSERT logs a Postgres ERROR regardless of how the 409 is handled
afterward.** Handling the 409 in app code (returning `display_name_conflict`)
stops the *client* from marking itself synced, but Supabase still records a
`duplicate key value violates unique constraint "users_display_name_key"` ERROR
for every attempt. The ONLY way to stop the Postgres ERROR log spam is to NOT
fire the INSERT when you already know it will collide — pre-check the display_name
too (not just email), and skip the write when it's taken by a different id.

**How to apply:**
- In `ensureUser`, before inserting, pre-check by email (`getUserByEmail`) AND by
  display_name (`getUserIdByDisplayName`). If display_name is taken by a row whose
  id != input.id, skip the insert and return `display_name_conflict` (no POST) —
  this is what stops the Postgres ERROR logs.
- On a 409 from the insert (the raced path), DO NOT blindly return success:
  re-verify a row actually exists (by email or id) first. A 409 with no matching
  row means a `display_name` collision with a DIFFERENT user.
- CLIENT (`UserProvider.ensureUserInBackend`): `display_name_conflict` is
  PERMANENT — do not throw it into the retry loop (that re-fires on every app
  focus forever). Record the conflicting display name in a ref and skip until the
  user picks a different name (a name change re-arms the sync). Observed prod
  symptom: one stuck user (no DB row, name taken by another account) looping
  ensureUser indefinitely and flooding the Postgres logs.
- `register` uses `storeUserInDb`; have it flag a 409 as `{duplicate:true}` and
  resolve gracefully (apple re-fetches canonical user; others return clean
  "already exists") instead of logging a hard error.
- dev + prod share ONE Supabase instance, so api-server must be REDEPLOYED for
  the fix to stop prod log noise.
