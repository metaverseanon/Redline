---
name: Speed-camera directional warnings
description: How RedLine decides whether to fire a speed-camera alert — forward-cone direction gate, speed-gated heading reliability, and detection vs warning split.
---

# Speed-camera alert gating (RedLine TripProvider)

Two separate concerns, deliberately decoupled:

- **Detection / trip counting** is direction-independent — a camera counts as
  "passed" purely on a tight radial proximity (small radius). Do NOT couple the
  trip stat to the directional warning logic; conflating them caused
  over-counting (the old "count via the wide warning radius" was removed).
- **Audible/visual WARNING** is direction-gated: only alert for a camera that is
  AHEAD, inside a forward cone of the travel bearing. This kills the dominant
  false-positive source: cameras behind you, on the opposite carriageway, or on
  a parallel road.

## Why the heading must be speed-gated
GPS course (`location.coords.heading`) is only trustworthy while actually moving.
At very low / zero speed it is noisy or stale, so a naive "heading is a valid
number" check engages the directional cone with garbage bearing → false
negatives (real camera ahead suppressed) and false positives.

**Rule:** treat heading as reliable only when it's a valid value AND speed is
above a minimum threshold. Decision tree per camera in range:
- reliable heading → warn only if camera is inside the forward cone.
- moving but no reliable heading → warn radially (never miss a real camera).
- essentially stopped → don't warn (you can't be speeding).

## Cone width is a tunable tradeoff
A wide-ish forward half-angle (currently ~75°) is intentional: too tight ⇒ false
negatives on bends/junctions; too wide ⇒ the directional filter stops removing
opposite-carriageway false positives. Adjust this single constant if field
reports skew one way; bearing math wraps correctly across 0/360°.

**How to apply:** any change to camera-alert behavior must preserve the
detection-vs-warning split and the speed-gated heading reliability check — both
warning blocks (foreground + background location handlers) must stay in lockstep.
