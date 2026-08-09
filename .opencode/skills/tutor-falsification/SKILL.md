---
name: tutor-falsification
description: The falsification gate for conclusions. Use before ACTING on any important conclusion (root cause, design choice, "this is fixed"): name the observable that would disprove it, then go look for it. A conclusion with no disproof-observable is untestable — say so. Complements the observation gate and /verify-build.
---

# Falsification Gate

Pattern-matching beats verification when there's no habit of naming the
counter-evidence (s6/s8/s20: confident stories on unverified output).

## The gate — before acting on any important conclusion

1. **Write one sentence:** *"This is wrong if [observable]."* Be concrete:
   a specific log line, hash, pixel, mtime, test result.
2. **Go look for that observable BEFORE acting** — the same read/grep/test
   that would prove the conclusion is the one that would disprove it. If the
   disproof-observable is absent, the conclusion stands *provisionally* — say
   "provisionally", not "confirmed".
3. **If no disproof-observable can be named, the conclusion is untestable.**
   Flag it as such and say where a disproof would come from — do not act on an
   untestable conclusion as if it were proven.

## When a disproof fires

The conclusion was wrong — state it plainly, own it, and re-derive. This is
the intended outcome of the gate, not a failure of it.

## Cross-refs

- Raw observations first: the observation gate (`tutor-observation` skill).
- The verification harness grades the evidence once a fix is claimed:
  `/verify-build`.
- Every `/handoff` snapshot carries unverified claims; the gate is how they
  get resolved instead of carried.

## Output format

```
CONCLUSION:   <the claim>
WRONG IF:     <the concrete observable that would disprove it>
LOOKED:       <evidence found / not found, source + timestamp>
STATUS:       provisional | confirmed | untestable (where a disproof would live)
```
