# Session Handoff — 2026-08-17 (s72)

## What we built and why
P0-WIZARD closed (tutorial readability pass + stale-roadmap fix + stale-binary
gate gap), then the student re-scoped MVP: the Loot tab must work for a
zero-mod pack — vanilla jar surfaced as editable content (B1) and curated mod
pointers when vanilla isn't enough (A). B1's Rust + service layer shipped;
the LootTab UI wiring is the first task of the next window.

## Commits this session (all pushed)
- `2fc6005` templates: tutorial-quest readability pass (P0-WIZARD final node)
- `b9e8ea6` docs: park Tauri test-harness scoping question (s72)
- `abda3b7` docs: s72 loot/worldgen re-scope (student ruling)
- `7eea231` feat(loot): vanilla jar surfacing + copy-to-pack backend (B1, s72)

## IN-FLIGHT — B1 frontend wiring (next window, first task)
LootTab.tsx (frontend/src/components/loot/LootTab.tsx) needs:
1. `instancePath` prop — ProjectWorkspace passes `project.path` (which IS the
   instance's `minecraft` dir for Prism projects, lifecycle.rs:92-98).
2. Pass it to `useLootTables(projectPath, instancePath)`.
3. Vanilla badge — `DiscoveredLootTable` now carries `vanilla: bool`; the list
   row currently shows `· jar` for non-editable (LootTab.tsx:112) — extend for
   `· vanilla`.
4. Copy-to-pack button on non-editable rows → `copyLootTableToPack(projectPath,
   source, dirName)` (services/loot.ts already has it) → `refresh()` → select
   the returned editable row. The read-only note (LootTab.tsx:152-155) says
   "Duplicate the table into the pack's data/ to edit it" — that's the copy
   action; wire a real button.
5. Then: B1 docs (docs/loot-editor.md — vanilla surfacing + copy-to-pack),
   `pnpm integrity`, rebuild BOTH binaries (templates not involved but the
   frontend bundle is), commit.

## A (curated mod pointers) — after B1
Content + small panel reusing the wizard's curated machinery (`CuratedModsStep`,
`curated.rs`). Roadmap queue row 9. NOT started.

## Parked (written reasons)
- P3-WORLDGEN editor (student ruling, s72) — "what's possible" note written in
  §13: datapack-JSON features/ores tractable, biomes harder, dimensions hardest.
- Tauri `tauri::test` harness scoping — background-queue.md (asked, unanswered).
- Fresh-eyes completion pass — s65 ruling, stays open.
- Directed maintenance queue rows 8-9 are the new priorities (roadmap:29-39).

## Verification state
- 483 Rust (was 478) + 779 FE green; loot suite 23 tests (5 new).
- Integrity: NOT re-run after the B1 commit — run it in the next window (expect
  stale-binary violations until both binaries rebuild; frontend changed).
- Both binaries NOT rebuilt this session (frontend changed → release binary is
  stale by definition).

## Teaching notes
- The scope decision was booked deliberately per s52 governance — student
  ruling on MVP, roadmap updated same-pass, deferrals written. Good pattern.
- Re-reviews due 08-18 (six items): version-boundary; offline-first; doc-sync
  triage (resolved s69); atomic writes; comment preservation; two-source
  divergence promotion confirm + Trust Rule re-exam.
- Owed explain-backs carried: s72 vanilla-loot B1 (dedupe-order + shared
  write-tail design) added to the ledger.