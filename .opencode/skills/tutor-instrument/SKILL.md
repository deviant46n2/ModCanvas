---
name: tutor-instrument
description: The instrumentation gate for companion probes and log-based measurement. Use BEFORE running any probe cycle in the game or companion — prove the instrument is applied, can fire, and won't lie. Loaded before any probe build/deploy/restart cycle.
---

# Instrumentation Gate

Probes are how we measure the in-game truth — and how we waste restart
cycles when they lie (s20c: a probe with zero hits was indistinguishable from
a dead probe; s21: a uniform probe NPE'd silently — `intValues` XOR
`floatValues` — costing a full restart+drain cycle).

## Before ANY probe cycle, prove these four things

1. **The instrument is applied.** The marker string is in the SOURCE, and the
   DEPLOYED artifact is the one built from that source. Verify the artifact,
   not the code: jar md5 differs from the previous jar, and the marker is in
   the built class (`javap -p -verbose` or `unzip -p <jar> ... | grep`) —
   `strings` will not show float constants (workaround register #3).
2. **The probe CAN fire.** It is not silently gated: the gate condition (item
   id, render path, call site) is reachable by the test scenario, and any
   rejection is LOGGED — a probe that can't fire must be visible as dead, not
   invisible as absent (s20c). Check the gate: `white_wool → any BlockItem`
   is how a too-narrow gate was fixed.
3. **The probe cannot NPE silently.** Every read is type-correct for the
   runtime object (uniform arrays: `intValues` XOR `floatValues` by type —
   FogShape is int and has null floatValues; s21). A probe that throws in a
   draw path dies silently — wrap and log, never assume.
4. **The log you read is the one being written.** `latest.log` rotates at
   midnight — probes appear in `debug.log` (workaround register #2). After the
   run: the log file's mtime is NEWER than the run start, and the marker
   string appears WITH a fresh timestamp. Reading an old file fakes a
   "no probes" read.

## The cycle (companion work)

Build → deploy → **verify the deploy (md5 + symbol)** → restart BOTH the game
and (for renderer-semantics changes) the app with CACHE_VERSION bumped in the
same pass → drain → read the FRESH log → then interpret. Skip any step and
the observation is invalid (s14: "dirt block not fixed" was measured against
a jar that never ran).

## Output format

```
INSTRUMENT: <marker> in source @ file:line; deployed jar md5=<...> (differs from previous: yes/no)
GATE:       can fire under the test scenario (condition + logged rejections)
NPE-SAFE:   type-correct reads (intValues/floatValues per uniform type)
LOG:        <file> mtime=<...> after run; marker present with fresh timestamp
```
