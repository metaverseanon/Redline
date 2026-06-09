# Memory Index

- [RedLine backend trust model](redline-backend-trust-model.md) — api-server tRPC has NO auth (publicProcedure + client userId); never trust client-asserted Pro/entitlement claims, re-verify server-side via RevenueCat REST.
- [Supabase REST once-only mutex](supabase-rest-once-only-mutex.md) — no DB transactions over REST; use conditional PATCH (`status=eq.X` + `return=representation`) as a mutex so reward/grant side-effects run exactly once.
- [EAS build in Replit (git lock)](eas-build-in-replit-git-lock.md) — `eas build` fails on `.git/index.lock` in the sandbox; prefix `EAS_NO_VCS=1`, use `--no-wait --auto-submit`, delete stale lock via code-exec fs.unlinkSync.
