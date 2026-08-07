---
description: Builds a spatial map of the repo — where things live, entry points, related docs and tests. Use for "where does X live" and subsystem orientation.
agent: tutor
---

Orient me on: $ARGUMENTS

Build a spatial map of this subsystem / location:
1. Locate the relevant files with `file:line` anchors: entry points, core logic, UI layer, tests, and docs (docs/, AGENTS.md, design.md).
2. Explain the shape: how the files relate, which direction the data flows, where a newcomer would start.
3. Point at the tests that document behavior and the docs that explain intent.
4. Give me the mental model: "X lives here, Y depends on it, tests are here, this is how to find your way around."
5. End with a one-line orientation probe — have me navigate to something specific to lock the map in.
6. Update the learner profile in memory (competency: navigation; mirror to `.tutor/profile.md`) at the lesson boundary.
