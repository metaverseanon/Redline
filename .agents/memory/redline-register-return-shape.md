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

## Onboarding gating decision (client)

Onboarding setup steps (unit / ride / photo / name / safety / paywall) run for
GENUINELY NEW accounts only. Any existing account — email sign-in, sign-up that
resolves to an existing/upgraded account, or Google/Apple that the backend says
already exists — skips straight to the app and never re-does car/profile setup.

- `UserProvider` surfaces the signal: `signUp` returns `{ user, isNewAccount }`
  (`isNewAccount=false` on `upgraded`); `signInWithGoogle`/`signInWithApple`
  return an extra `existing` flag; `signIn` is always existing (login).
- Onboarding's `finishForExistingUser()` sets `onboarding_completed=true` and
  `router.replace('/(tabs)/track')` WITHOUT firing CompleteTutorial (a new-user
  funnel event must not fire for returning users).
- Email sign-up that hits "already exists" (has a password) falls back to
  `signIn` with the same creds; the `upgraded` (Google→password) path also calls
  `signIn` afterward to adopt the canonical backend id so trips/posts still map.

**Why:** returning users re-running onboarding made no sense and risked detaching
them from their account; only fresh installs of brand-new accounts should see it.

**Caveat:** a returning Google user on a fresh install still gets a throwaway
local id (the Google register path deliberately does NOT return the canonical
profile — see the security note above), so onboarding-skip works but Google id
continuity remains a known, intentional limitation. Apple + email adopt the
canonical id; Google does not.
