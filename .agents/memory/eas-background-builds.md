---
name: EAS background builds get killed
description: Long-running eas build commands die silently when backgrounded in Replit; the upload never finishes.
---

`nohup eas build ... & disown` (or `&` alone) in the Replit shell dies silently once the parent shell exits — the process produces 3 lines of "outdated version" output and then is killed, with no error and no upload completing.

**Why:** Replit's bash sandbox cleans up child processes from short-lived shells, even with `nohup`/`disown`. EAS's upload step takes 30–90s+ and never gets to "Uploaded to EAS" before it's reaped.

**How to apply:** Run `eas build` **foreground** with `timeout 110 eas build ... 2>&1 | tee log` (or similar). Once the upload finishes and EAS prints "See logs: https://expo.dev/...", the build is on EAS's queue and you can safely Ctrl-C / let the shell die — the remote build + auto-submit continue on EAS's side.
