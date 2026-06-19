---
name: Apple Sign In identity strategy
description: How RedLine keys Apple accounts given Apple only returns email/name on first authorization
---

# Apple Sign In identity (RedLine)

Apple returns `email` + `fullName` **only on the first authorization** for an
app. Every subsequent sign-in (including after reinstall) returns only the
stable opaque `credential.user` id. RedLine's auth keys accounts on email.

**Rule:** key Apple accounts on a deterministic synthetic email derived from the
stable Apple user id — `apple_<credential.user>@privaterelay.appleid.com` — for
BOTH create and lookup. Never key an Apple account on the real/relay email Apple
hands back on first auth, or re-login (when email is absent) creates a duplicate.

**Re-auth id adoption:** the client generates a throwaway local id on each
social sign-in. The `register` route, when the account already exists AND
`authProvider === 'apple'` AND no password, returns `existing:true` + the
canonical stored `user` (id/profile). The client must adopt that id, else the
user's trips/posts (keyed by the original backend id) stop mapping to them.

**Why scoped to apple only (not google):** the Apple synthetic email is an
unguessable opaque id, so returning profile data for it leaks little. A real
Google email is guessable, so returning an existing profile by email there would
be an unauthenticated PII-disclosure / account-resolution vector. Google's path
keeps the original "already exists" rejection.

**Known limitation (intentional):** there is NO server-side verification of
Apple's `identityToken` — the client asserts the `credential.user`. This is
consistent with the app's existing trust model (every route already trusts a
client-supplied `userId`; see redline-backend-trust-model.md). Revisit if/when
the project adds real server auth.

**Native requirements:** `expo-apple-authentication` + `ios.usesAppleSignIn:true`
+ plugin in app.json. Only works in a real iOS build (dev build / TestFlight),
not Expo Go or web — button is gated on `Platform.OS === 'ios'` +
`AppleAuthentication.isAvailableAsync()`. Use the official
`AppleAuthenticationButton` component (App Review enforces its branding).
