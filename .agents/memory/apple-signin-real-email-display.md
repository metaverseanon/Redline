---
name: Apple Sign-In real email display
description: Why RedLine shows the real Apple email client-side only, and what it would take to persist it.
---

# Showing the real Apple email (RedLine)

Apple Sign-In accounts are keyed on a synthetic identity email
`apple_<credential.user>@privaterelay.appleid.com` stored in `users.email`
(the backend `register`/`getUserByEmail` lookup depends on it). The real email
Apple returns ONLY on the first (or post-relink) authorization is captured into a
**client-only** `UserProfile.appleEmail` (AsyncStorage) and shown via the
`getDisplayEmail` helper. The synthetic email is never overwritten — the profile
EMAIL field is read-only for Apple users and excluded from `updateProfile` saves.

**Why client-only:** this sandbox has no Supabase DDL access (only PostgREST +
service-role REST, which rejects unknown columns; no Postgres password). Adding a
real backend column needs the user to run SQL in the Supabase dashboard.

**How to apply / limitations:** the displayed email resets after an app reinstall
or on a new device (Apple won't resend it) unless the user re-links. If
cross-device persistence is needed later: add a `users` column via Supabase SQL,
then sync `appleEmail` server-side in `register` + the profile read mappers.

**Verification constraint:** Apple Sign-In is native-only — any change here needs
a TestFlight build to test on device.
