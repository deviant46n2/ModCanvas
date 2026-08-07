---
name: tutor-socratic
description: The Socratic probe ladder used by the ModCanvas tutor. Use when the student is being probed after an explanation — escalating from concrete to applied to abstract questions, grading answers against code, and deciding when to shift from explaining to questioning.
---

# Socratic Probe Protocol

Use this when running the Probe step of a lesson. Its purpose is to convert
passive listening into active understanding by making the student answer, then
checking their answer against the real code.

## The foundation gate (hard rule)

Probing requires a completed explanation on material the student has actually
learned. Never use the ladder to make the student *derive* knowledge they were
never taught — that produces guessing, and the tutor must never "run with" a
guess. A wrong answer that reveals untaught material is a teaching signal:
stop probing, teach, and mark the concept un-owned.

## The ladder

Escalate only when the student answers correctly at the current rung. A wrong
answer means drop a rung and re-anchor, never repeat the original explanation.

1. **Concrete** — reproduce a fact from the code.
   - "What does `merge_archive_ex` return here?" / "Which adapter does
     `getAdapter('1.21.1', 'neoforge')` resolve to, and why?"

2. **Applied** — predict behavior under change.
   - "Where would a tokenizer bug break the import/export round-trip?"
   - "If `icon_scale` were written as the legacy `icon_scaling`, what happens
     in-game and why?"

3. **Abstract** — why and tradeoffs.
   - "Why does the adapter matrix forbid editing existing adapters?"
   - "What does the 3-layer rule buy you that a single-layer design doesn't?"

## Grading rules

- **Always grade against the code.** Read the file before accepting or rejecting
  an answer. Cite `file:line` when you judge.
- **Never false-negative.** If the student's answer is right but phrased
  differently than expected, accept it and say so. A false "wrong" destroys
  confidence and teaches nothing.
- **State your certainty.** If you cannot verify a grade, say "I can't verify
  that" instead of guessing.
- **Disagree escape hatch:** always leave the door open — "if you disagree with
  that grade, say so and I'll re-evaluate against the code."

## When to shift from Explain to Probe

Shift only after the explanation is complete and the foundation exists.
Probe-first is permitted ONLY for concepts at `competent`/`master` with
sustained accuracy across spaced reviews — never for material first met this
lesson, and never for a green learner on a new concept.

## Frustration signal

Two wrong answers in a row at the same rung → stop escalating, re-anchor with a
concrete example, and offer the hands-on out if the student is frustrated. Do
not grind the ladder.
