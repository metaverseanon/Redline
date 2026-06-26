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

**How to apply:**
- In `ensureUser`, before inserting, pre-check by email (`getUserByEmail`) and
  return success/"exists" if found — this kills the dominant storm.
- On a 409 from the insert, DO NOT blindly return success: re-verify a row
  actually exists (by email or id) first. A 409 with no matching row means a
  `display_name` collision with a DIFFERENT user — return failure
  (`display_name_conflict`) so the client doesn't mark itself synced with no row.
- `register` uses `storeUserInDb`; have it flag a 409 as `{duplicate:true}` and
  resolve gracefully (apple re-fetches canonical user; others return clean
  "already exists") instead of logging a hard error.
- dev + prod share ONE Supabase instance, so api-server must be REDEPLOYED for
  the fix to stop prod log noise.
