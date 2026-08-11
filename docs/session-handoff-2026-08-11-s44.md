# Session Handoff — 2026-08-11 (s44: worldgen-chain build arc)

Branch `new-features`. Tree clean at `d4e2e5c`; all six commits verified. This handoff
was written at s45 open — the s44 close lost its memory entries (the `add` tool
returned usage-guide errors and stored nothing; the close entry was deleted), so this
doc + `.tutor/profile.md` + the commits are the durable record. All 7 lost entries
re-written at s45 open with code-verified pointers, `pnpm memory-check` green.

## WHAT WE BUILT (one line)

s44 shipped the first three nodes of the worldgen chain — an evidence-gated KubeJS
hotswap close, a read-only loot scan, and a derived Pack Index with Health Tier 2
topology — every backend verified by live probes, not just unit tests.

## DONE

- `2044138` — feat(hotswap): complete KubeJS reload — two-command evidence gate.
  - Bare `kubejs reload` has NO executor on 1.21.1 (tree is `reload config|
    startup-scripts|server-scripts`, verified against the shipped 2101.7.2 jar), and
    the script reload alone doesn't apply recipes — KubeJS says run `/reload`.
  - Companion runs the two-command sequence (server-thread FIFO); the evidence
    matcher is per-type (`ReloadKind::KubeJs` requires BOTH 'KubeJS server scripts
    in' + 'Server resource reload complete!' after the pin); recipe save uses the
    same pin→broadcast→verify loop as quests, reporting PASS/FAIL/rotated/
    no-companion honestly. `handleConfigReload` fixed to the correct subcommand.
  - Docs: recipe-editor save flow, workarounds #10, roadmap §13. Verified:
    651→667 frontend tests green.
- `5c51fa3` — feat(launch): detect Prism refusal — no more silent 'Game exited (code 0)'.
  - A stale Prism process swallows the single-instance IPC and the wrapper exits 0
    immediately with no game process; the app reported it as a successful exit.
  - `do_launch` now watches a 20s grace window: wrapper exits 0 while liveness says
    no game process appeared → specific 'close Prism and retry' failure. Liveness
    (not the exit code) discriminates refusal from a normal hand-off.
  - 3 tests lock refusal / game-up / slow-start. Docs: workarounds.
- `e38611b` — feat(loot): read-only loot-table scan MVP (P3-LOOT scan half).
  - Walks pack `data/` + mod jars for BOTH historical dir names (`loot_table` 1.21+ /
    `loot_tables` pre-1.21); pure parser → typed summary; dedupes by resource id
    with FULL-PATH keys (`minecraft:chests/simple_dungeon`, the game's key form —
    the first scan silently collapsed nested tables until the live probe caught it).
  - Frontend: Loot tab lists + details, read-only, honest states. Editor remains.
- `b91a0cc` — feat(pack-index): derived reference spine + item-registry UI-label fix.
  - P1-PACKINDEX MVP: derived, read-mostly spine over existing scans (items,
    recipes, quests) with inverted back-references + dead-reference reporting —
    never authoritative, never write-through. `get_pack_index` command; pure
    inversion in `invert.rs`. Tags parked with a written reason.
  - Live probe vs the real 1.21.1 client jar caught an indexer bug: `item.canUse.*` /
    `item.modifiers.*` are UI labels, not items — the pre-fix parser emitted
    `canUse:unknown` into the registry. `is_real_item_key` now requires
    `item.<ns>.<path>` with a non-UI namespace (617 real items kept, zero real loss).
  - Records the 3 doc-sync judgments (a4b3857, 7262374, 1828b09) — candidates retired.
- `33e207d` — feat(health): Pack Health Tier 2 — topology measurements (P1-HEALTH-2).
  - Bottlenecks, walls, longest chains from quest-graph dependency edges; pure graph
    math (`checks/topology.ts`), wired as RECOMMENDED findings (measurements, never
    blocks — Trust Rule), behind the recompute.
  - Semantics pinned by hand-computed tests: bottleneck = removal disconnects >50%;
    wall = removal strands ≥1 other quest (roots excluded); chains cycle-safe (a
    cyclic quest graph terminates — found via a real fixture overflow).
  - quest→item→recipe availability half PARKED with written reason (needs Pack Index
    consumer + full objective model).
- `d4e2e5c` — docs: roadmap status — hotswap close, loot MVP, pack index, health
  Tier 2 (same-pass doc-sync).

## IN-FLIGHT

None — tree clean, six commits, all verified (361 Rust + 667 frontend, integrity
clean, health 100/100 at close).

## PENDING (owed — student's invitation only, never gated)

- Explain-back: the s43 close/reopen design (openGui vs open_book, 600ms,
  PauseScreen-only override) — still owed from s43.
- Monster dependency-lines in-game: a626ac2 id re-base landed; lines after re-adding
  an edge never confirmed. (NOTE: the Monster instance was deleted + remade mid-s44
  as `monster`, 8-mod starter, no quests/data — this check now needs the new
  instance or a re-created pack.)
- Release binary stale (integrity violation): dev-mode workflow; build before any
  real ship. NOT new debt.
- 3-layer rule graded probe (FCI P2 row 2): taught-but-unconfirmed at s44; self-report
  "grasp good enough" is NOT graded. Next at student's invitation.

## UNVERIFIED CLAIMS

- None claimed without evidence: every s44 fix shipped with live-probe or
  hand-computed-test verification (4 probe-caught bugs: dead kubejs command,
  loot-id collapse, quest rewards in `item_id`, UI-label keys as items; 3 topology
  math bugs via hand-computed tests).

## DECISIONS (memory pointers)

- KubeJS reload = two-command sequence + per-type evidence, never bare reload.
  [KUBEJS-BARE-RELOAD-DEAD]
- Pack Index is derived + read-mostly, never write-through; tags parked.
  [PACK-INDEX-DERIVED-SPINE]
- Launch verdict by liveness, not exit code. [LAUNCH-LIVENESS-NOT-EXITCODE]
- Health topology = measurements, never blocks. [HEALTH-TOPOLOGY-MEASUREMENTS-NOT-BLOCKS]

## GOTCHAS (memory pointers)

- Bare `kubejs reload` dead on 1.21.1; script reload alone doesn't apply recipes.
  [KUBEJS-BARE-RELOAD-DEAD]
- Vanilla `item.canUse.*`/`item.modifiers.*` lang keys are UI labels, not items.
  [PACK-INDEX-UI-LABEL-KEYS]
- FTB quest rewards live in `item_id` (single) with empty `items` (multi).
  [QUEST-REWARDS-IN-ITEM_ID]
- Loot tables key by full resource path, not bare filename; scan both dir names.
  [LOOT-FULL-PATH-KEYS]

## Environment reminders

- Binary rebuild check: `src-tauri/target/debug/modcanvas` mtime vs newest edit.
- Memory `add` verified working again at s45 open (was broken at s44 close).

## Reference lines (memory-check contract)

GOTCHAS: KUBEJS-BARE-RELOAD-DEAD, PACK-INDEX-UI-LABEL-KEYS, QUEST-REWARDS-IN-ITEM_ID, LOOT-FULL-PATH-KEYS
DECISIONS: PACK-INDEX-DERIVED-SPINE, LAUNCH-LIVENESS-NOT-EXITCODE, HEALTH-TOPOLOGY-MEASUREMENTS-NOT-BLOCKS
