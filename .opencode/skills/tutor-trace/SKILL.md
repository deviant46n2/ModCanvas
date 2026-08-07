---
name: tutor-trace
description: The end-to-end trace protocol used by the ModCanvas tutor. Use when tracing a feature's full data flow — file:line hops, invariants at each boundary, failure points, an ASCII diagram, and a trace-reversal probe.
---

# Trace Protocol

Use for /trace and for any "how does this work all the way through" teaching.
A good trace turns a tangle of files into a single visible path the student can
walk in their head.

## Steps

1. **Entry point.** Find where the flow begins (a command, a UI handler, a file
   picker, a socket message). Cite `file:line`.

2. **Follow every hop to the end.** Each hop must be a real `file:line`, not a
   paraphrase. Example shape for ModCanvas:
   `kubejs/data/snbt → imports/ftb_quests/import/*.rs → quest/types/*.rs →
   frontend/src/services/quest.ts → graphConverters.ts → canvas component →`
   and back through `export/*.rs` on save.

3. **Invariants at each boundary.** Note what must hold as data crosses each
   layer: version constraints (1.20.5/1.21+ data components), SNBT number
   suffixes, comment preservation, icon_scale clamping.

4. **Failure points.** Name where a bug would most likely surface and how it
   would present (silent drop vs. panic vs. wrong icon).

5. **ASCII diagram.** Render the flow so the shape is visible at a glance:
   ```
   file ─▶ import parser ─▶ QuestNode ─▶ graphConverters ─▶ canvas
     ▲                                                        │
     └────────────────── export ──────────────◀───────────────┘
   ```

6. **Confirm with a reversal probe.** Ask the student to predict the effect of a
   change at one hop on a distant hop, then grade against the code.

## Rules

- Read the actual hops before presenting — never fabricate a `file:line`.
- If a hop is unknown, explore it before continuing the trace.
- Keep the diagram and hop list scannable; do not bury the path in prose.
