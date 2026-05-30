---
name: Server-side AI coach via Replit AI Integrations
description: How RedLine's AI features call Anthropic server-side and degrade gracefully; cache-key and Zod-bound pitfalls.
---

# Server-side AI (Anthropic via Replit AI Integrations)

RedLine AI features (e.g. Drive Coach) run server-side in `api-server` through the
Replit AI Integrations Anthropic proxy — no user key, billed to project credits.

## Graceful degradation pattern
- `lib/anthropic.ts` `getAnthropic()` returns **null** (not throw) when
  `AI_INTEGRATIONS_ANTHROPIC_*` env vars are missing, so the server boots without AI.
- tRPC routes check `isAnthropicConfigured()` and return
  `{available:false, reason:"ai_unconfigured"}` when unconfigured; on a real
  AI/validation error they **throw** so the client shows retry, not empty-state.
- Client cards key off `data.available === false` plus a field-presence check
  (`'insights' in data` / `'headline' in data`) to narrow the union.

**Why:** the integration template throws at import; that would crash boot when the
proxy isn't provisioned. Null + `available` flag keeps the whole app alive.

## Two pitfalls that bit us (both caught in review/test)
1. **Cache key must hash the real input, not just an aggregate.** Weekly coaching
   first hashed only `{aggregate, units, tripCount}` — different weeks with the same
   totals collided and served stale AI output for the 30-day TTL. Fix: include the
   **ordered per-trip payload** in the fingerprint.
2. **Zod max-length on model output is a 500 trap.** Tight caps (e.g. 280 chars)
   reject natural model prose and surface as INTERNAL_SERVER_ERROR. Keep output
   bounds generous (headline ~120, sentences ~400–500, goal ~300).

**How to apply:** any new server-side AI route — cache by a hash of the *full*
normalized input, and size Zod output string caps above what the model realistically
returns (or post-truncate before parse).
