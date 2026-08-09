---
name: tutor-observation
description: The raw-observation gate for diagnostics. Use BEFORE any theory, hypothesis, or explanation of a failure — pin the actual observation (bytes, log line, hash, pixel) with source and timestamp, and classify it observed/derived/remembered. Load at the start of any /debug, /verify, or diagnosis.
---

# Observation Gate

The most dangerous error class in this arc (s6: truncated grep → wrong pack
story → student deleted a pack on bad advice; s8: fabricated `.env` story;
s20: grep-pattern error → false "zero hits"): **a confident story built on
unverified or truncated output. It sounds right and is not.**

## The gate — before any theory, pin the observation

1. **State the raw observation.** The exact log line, the exact hash, the
   exact pixel, the exact bytes — not a paraphrase. Quote it.
2. **Attach source + timestamp.** Which file/command produced it, and when
   (relative to the run under investigation). An observation from an old run
   is not evidence about a new run (s21: `latest.log` rotates at midnight —
   a "no probes" read from the wrong file is fake).
3. **Classify it — the three-source rule:**
   - **observed** — I read it from a file/command output this session.
   - **derived** — I computed/inferred it from other facts. Say how.
   - **remembered** — from memory (mine or the record). A memory is a
     pointer, not proof: re-verify before acting on it.
4. **Truncated output is not evidence.** If the output was cut, truncated, or
   sampled, say so and get the full artifact before theorizing.

## If the observation contradicts the current theory

**Distrust the theory** (s8 lesson, four errors in one family). The theory is
a guess; the observation is ground truth — re-derive, don't re-argue.

## The student's eyes are ground truth

When the student reports what they see ("the barrel is upside down", "the
pill is green"), that is an observation too — theirs beats your model. Verify
your model first, never argue from it.

## Output format

```
OBSERVED:   <exact bytes/line/hash, quoted>
SOURCE:     <file:line | command> at <timestamp>
CLASS:      observed | derived (how) | remembered (needs re-verify)
THEORY:     (only after the above; must cite the observation)
```
