---
name: Email image hosting (RedLine)
description: How to host images referenced in RedLine marketing emails, and the deploy coupling it creates.
---

Marketing emails (Resend broadcasts) need every image as an absolute public
HTTPS URL. `attached_assets/` is NOT web-served, and base64 data URIs are
stripped by Gmail, so neither works for email.

Pattern used: serve small brand assets (e.g. the wordmark logo) directly from
the deployed Hono api-server as a static route returning the PNG bytes.

**Why:** it's the only already-public HTTPS host in this project (no object
storage / static bucket is configured), and it keeps the asset versioned in the
repo.

**How to apply:**
- Version the asset path (e.g. `.../redline-logo.v1.png`) because the handler
  sends `Cache-Control: immutable`; without a version bump a rebrand would be
  masked by cached copies.
- The api-server is at `https://trip-stats-tracker.replit.app` (prod). The email
  references the prod URL, so **the api-server must be redeployed before a
  campaign is sent** or the image 404s in recipients' inboxes. The dev domain
  serves it immediately for local preview but is not a reliable host for a sent
  email.
