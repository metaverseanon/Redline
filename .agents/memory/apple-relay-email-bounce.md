---
name: Apple Hide-My-Email relay bounces
description: Why welcome/notification emails to @privaterelay.appleid.com bounce while gmail/hotmail deliver, and the Apple-portal (not code) fix.
---

# Apple "Hide My Email" relay addresses bounce — not a code bug

Symptom: in the Resend dashboard, every email to a `@privaterelay.appleid.com`
address shows **Bounced**, while gmail/hotmail/etc. show **Delivered**.

These bounced addresses (e.g. `b2tdrw64br@privaterelay.appleid.com`, short random
token, NO `apple_` prefix) are Apple's genuine **Hide My Email** relay addresses —
the only address Apple gives for users who hid their email at Sign in with Apple.
They are distinct from our internal synthetic identity key
`apple_<credential.user>@privaterelay.appleid.com` (which `isSyntheticAppleEmail`
already filters out). The send code is correct: `pickWelcomeEmail` resolves to the
real relay address and Resend accepts it. **Apple's relay does the bouncing.**

**Why:** Apple Private Email Relay only forwards mail from sender domains/addresses
registered & verified in the Apple Developer portal under **"Sign in with Apple for
Email Communication."** RedLine sends from `info@redlineapp.io`; that domain is
verified in Resend (so Gmail works) but is NOT registered with Apple → Apple
rejects every relay email. There is NO code workaround: for Hide-My-Email users the
relay address is the only address we ever receive.

**The fix (USER action — needs Apple Developer 2FA, main agent CANNOT do it):**
Apple Developer → Certificates, Identifiers & Profiles → **More** (left sidebar) →
**Configure "Sign in with Apple for Email Communication"** → register domain
`redlineapp.io` AND email source `info@redlineapp.io`. Apple verifies via the
domain's SPF record (Resend already set SPF for redlineapp.io, so verification is
usually immediate). Once verified, Apple forwards relay emails instead of bouncing.
Existing bounced users won't be retried automatically — they only re-receive on the
next welcome/backfill send.

**How to apply:** any future "Apple users aren't getting emails / privaterelay
bounces" report — do NOT hunt for a code bug; check the Apple Email Communication
registration first.
