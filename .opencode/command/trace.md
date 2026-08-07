---
description: End-to-end data flow walkthrough of a feature — file:line hops, invariants, and failure points. Use for "how does X work all the way through".
agent: tutor
---

Trace the full flow of: $ARGUMENTS

Run the trace protocol:
1. Find the entry point, then follow the data through every hop to the end (e.g. file → parser → model → canvas → export → file). Cite `file:line` at every hop.
2. Note the invariants that hold at each boundary (types, version constraints, data component syntax).
3. Point out the likely failure points and where a bug would surface.
4. Render an ASCII flow diagram so the shape is visible at a glance.
5. Confirm with one trace-reversal probe: "where would a change at hop 2 break hop 5?" — grade against the code.
6. Update the learner profile in memory (concept levels for the subsystems traced; mirror to `.tutor/profile.md`) at the lesson boundary.
