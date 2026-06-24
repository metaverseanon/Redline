---
name: RedLine register return shape
description: How the backend user.register tRPC mutation signals existing vs new vs upgraded accounts — needed for any "new account" instrumentation/logic.
---

# RedLine `user.register` return shape

`user.register` (api-server `backend/trpc/routes/user.ts`) does NOT throw for an
already-existing account — it returns a result object the caller must inspect:

- New account stored → `{ success: true, stored: true, ... }`.
- Existing email/Google account (no password, not apple) → `{ success: false, error }`.
  (The email `signUp` path *appears* to throw only because the client itself does
  `if (!result.success) throw`; the Google path historically did not check this.)
- Existing Google-only account that now supplies a password → `{ success: true,
  upgraded: true }` (a password was added to an existing user — NOT a new user).
- Apple re-auth on an existing account → `{ success: true, existing: true, user }`
  (client adopts the canonical backend id). Apple is the only provider that
  returns the existing user, because the apple identity email is opaque; email/
  Google keep the "already exists" rejection to avoid leaking profiles by email.

**Why:** funnel/analytics events like `account_created` must count genuinely new
users only.

**How to apply:** gate "new account" side-effects on
`result.success === true && !result.upgraded` for email/Google, and `!result.existing`
for apple. Never assume an existing account causes a thrown error.
