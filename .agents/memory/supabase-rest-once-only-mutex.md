---
name: Supabase REST once-only operations (no transactions)
description: How to make an operation run exactly once (no double rewards/grants) when the backend talks to Supabase over REST, with no DB transactions.
---

# Once-only operations over Supabase REST

The api-server talks to Supabase via plain REST (`fetch`), so there are **no
multi-statement transactions** and read-then-write idempotency checks race.

**Why:** challenge finalization (write top-3 winners + grant RevenueCat promo
entitlements for 2nd/3rd) was triggered as a side-effect of `getActiveChallenge`,
which every client polls — many concurrent callers passed a "winners exist?"
precheck and double-granted rewards.

**How to apply:** use a conditional PATCH as an optimistic-lock mutex. Flip a
status column only from the expected value and ask Supabase to return the rows:

```
PATCH /challenges?id=eq.X&status=eq.active   Prefer: return=representation
body: { status: "completed" }
```

If the returned array is empty, another worker already claimed it — bail. The
caller that gets exactly one row owns the run and performs the side effects once.
Keep side-effect activation/finalization in the polled query (so it still works
without a cron) but always gate it behind this claim.
