---
description: The verification harness — "X works" is not done until each step has evidence. Walks rebuild → deploy → restart → observe and grades each step's EVIDENCE (not its existence). Use before claiming any fix or feature works. This is the s14 trap made impossible.
agent: tutor
---

Verify-build: $ARGUMENTS — the claim that a fix/feature works.

A claim is not done until every step below has EVIDENCE, not assertion. The
s14 canonical failure: the fix was committed, the jar re-copied — but the jar
was the OLD build (identical md5) and the app never restarted; the
observation was invalid because neither artifact ran the new code.

## The five graded steps

1. **REBUILT** — the binary is newer than the newest edit. Evidence: mtime
   comparison (run the integrity gate's `stale-binary` section, or
   `stat` the binary vs the newest changed source). `pnpm dev` auto-rebuilds;
   a standalone binary needs `pnpm build`.
2. **DEPLOYED** — the artifact that WILL run is the artifact that WAS built.
   Companion: jar md5 in the instance equals a fresh build's md5, and the new
   symbol is present (`javap -p -verbose`) — workaround register #3. App:
   the launched binary path is the rebuilt one.
3. **RESTARTED** — the app/game processes started AFTER the deploy. A
   lingering process holds the old code in memory (workaround register #4:
   kill it before relaunch). Evidence: process start times vs deploy time.
   Renderer-semantics changes also need CACHE_VERSION bumped in the same pass
   AND the app restarted (workaround register #5).
4. **OBSERVED** — the observation comes from the fresh run. Evidence: the
   log/cache entry's timestamp is >= the restart time, and it is in the file
   being written (workaround register #2: `latest.log` rotates at midnight).
5. **CLAIM** — now, and only now, state what works, graded:
   PASS (all four evidence items present) / PARTIAL (which step lacks
   evidence) / UNVERIFIABLE (say which step cannot be evidenced and where to
   check).

Never claim a fix works against an unbuilt change. If any step can't be
evidenced, the claim is not done — say which step is missing and fix the
evidence, not the claim.
