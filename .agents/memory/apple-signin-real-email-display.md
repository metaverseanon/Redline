---
name: Apple Sign-In real email persistence
description: How RedLine keeps a deliverable Apple email server-side (notification_email) while the identity email stays synthetic.
---

# Apple email: synthetic identity vs deliverable address (RedLine)

Apple Sign-In accounts are keyed on a SYNTHETIC identity email
`apple_<credential.user>@privaterelay.appleid.com` stored in `users.email` (the
backend `register`/`getUserByEmail` lookup depends on it; Apple only returns the
real email on FIRST authorization, so the stable `credential.user` id is the
durable key). The synthetic identity email always BOUNCES — never send mail to it.

**Two distinct things, do not conflate:**
- Identity key = `users.email` = synthetic. NEVER overwrite it; doing so breaks
  account lookup/login. The profile EMAIL field is read-only for Apple users and
  excluded from `updateProfile`.
- Deliverable address = `users.notification_email` (separate Supabase column) =
  the real email. Welcome emails + the backfill job target this.

**Server persistence (current):** the real email flows from the client
(`UserProfile.appleEmail`, AsyncStorage) → `register` (`notificationEmail` input)
and → `ensureUser` (`notificationEmail` input) → stored in `notification_email`.
`pickWelcomeEmail(notification_email, identity_email)` resolves the send target and
returns null when neither is deliverable. `isSyntheticAppleEmail` filters the
placeholder. Backfill (`backfillWelcomeEmails`) selects `notification_email` and
sends via `pickWelcomeEmail`; rows with no deliverable address are marked
`welcome_email_sent=true` so they stop bouncing on every run.

**No-clobber rule:** every backfill-onto-existing path (register apple re-auth,
register raced-duplicate, ensureUser existing-row + email-pre-check) only sets
`notification_email` when the stored value is missing — never overwrite a stored
real email.

**Requires DDL:** `ALTER TABLE users ADD COLUMN IF NOT EXISTS notification_email text;`
must be run in Supabase (sandbox has no DDL access — PostgREST rejects unknown
columns). Dev + prod share ONE Supabase instance, so run it once. Prod api-server
must be REDEPLOYED with the code change for ongoing sync; a one-off backfill from
dev fixes already-created rows immediately.

**Limitations:** the client `appleEmail` still resets after reinstall/new device
unless the user re-links (Apple won't resend), but once persisted to
`notification_email` the server keeps it.

**Verification constraint:** Apple Sign-In is native-only — changes need a
TestFlight build to test on device.
