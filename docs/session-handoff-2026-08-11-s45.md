# Session Handoff — 2026-08-11 (s45: s44 remediation + P2-BEHAVIOR arc)

Branch `new-features`. Tree clean at `d3791b2`. Five s45 commits on top of the
s44 handoff. Memory entries live; memory-check green.

## WHAT WE BUILT (one line)

s45 opened by repairing the s44 close (missing handoff + 4 unpaid doc-sync
judgments), then built the first four chunks of P2-BEHAVIOR — IR + compiler,
persistence + commands, the Behaviors tab, and the emission step that finally
puts compiled behavior scripts where the game reads them — finding two real
bugs along the way (a missing emitter and a latent recipe-writer path bug).

## DONE (s45 commits, oldest → newest)

- `768cb94` — docs: s44 handoff doc (the s44 close never wrote one; the memory
  `add` tool had failed at close, losing the close entry + 4 gotchas + 3
  decisions — all re-created with code-verified pointers; memory-check green).
- `8f6cbd1` — feat(behavior): Behavior IR + KubeJS compiler, first pair
  (`PlayerJoinsGame` → `GiveItem`). `src-tauri/src/behavior/` (mod.rs IR,
  compile.rs pure compiler, tests.rs golden tests). 5 golden tests caught a
  real emitter bug (missing `(` before `event`). API verified against the
  shipped KubeJS 2101.7.2 jar (`loggedIn` + `kjs$give(ItemStack)` exist); the
  count form stays the flagged runtime surprise.
- `307a362` — chore(docs): paid 4 s44 doc-sync judgment rows (5c51fa3,
  e38611b, b91a0cc, 33e207d — docs landed same-pass in d4e2e5c but the
  per-commit checker needs rows) + errata in the s44 handoff. The s44 close
  "integrity clean" claim was WRONG — 4 candidates existed at close time.
  Lesson: read gate output at close, never assert from memory.
- `26666dd` — feat(behavior): persistence + commands. `path_safety::
  state_file_path` (single canonical `.modcanvas/` scoping; quest_graph_path
  now delegates), `behavior/store.rs` (missing file = empty, full-list atomic
  write, NO validation on save — partial authoring is legal), commands
  `list_behaviors` / `save_behaviors` / `compile_behavior` (compile-for-
  preview, never writes).
- `837a001` — feat(behavior): Behaviors tab. `services/behavior.ts` (the only
  frontend place the IR shape is known), `useBehaviors` hook (5 tests),
  `BehaviorTab.tsx` — list + card editor + LIVE compile preview (every edit
  runs compile_behavior, debounced). Deliberately NOT a generic VPL.
  Scope cut recorded: GiveItem is a text input, not the ItemBrowser picker
  (needs the quest asset pipeline — queued).
- `d3791b2` — feat(behavior): emission — the missing link. In-game test
  ("saved a behavior and it didn't go off") traced to: save wrote only the IR,
  no script ever reached the instance. `behavior/emit.rs` compiles all →
  atomic-writes `kubejs/server_scripts/modcanvas_behaviors.js` (dedicated
  file, project-root scoped via `validate_under_root`). Honest failure
  contract: uncompilable behaviors are skipped in the file and reported as
  `SaveBehaviorsOutcome.emit_failures` — the UI surfaces them.

## FINDINGS (in-game test, s45)

1. **Behavior "didn't go off" = no emitter existed** (root-caused in code,
   fixed in d3791b2). The instance's `kubejs/server_scripts/` had only
   KubeJS's own `main.js`; no behavior script was ever written.
2. **Latent recipe-writer path bug (FLAGGED, NOT fixed):** KubeJS reads server
   scripts from `<root>/kubejs/server_scripts/` (project root — verified via
   the instance's own `main.js` and the shipped KubeJS README.txt), but
   `write_script_files` resolves through the CONFIG-scoped
   `validate_project_write`, landing recipes in `<root>/config/kubejs/` — a
   directory KubeJS never reads. The s44 evidence gate proved the reload
   COMMAND ran, not that the script landed where KubeJS reads it. Gotcha:
   KUBEJS-SCRIPTS-DIR-IS-PROJECT-ROOT-NOT-CONFIG. Needs its own fix +
   in-game verify.
3. **2-quest "Play Your First Pack" chapter = pre-existing corruption, NOT a
   template bug.** Template (`templates/exploration/chapters/
   Exploration_Starter.snbt`) has all 7 quests; the instance's cache AND disk
   agree on 2 stubs — corruption predates the session (stale-binary / old
   state, the s42 class). Existing round-trip tests prove current code
   imports the template cleanly (23 quests). In-game icons: export IS fine
   (`icon = "minecraft:chest"` etc. present); the stub chapter's empty icons
   are a symptom of the same corruption, not a separate icon bug.

## IN-FLIGHT

None — tree clean at d3791b2, 378 Rust + 673 frontend green, integrity clean
except the parked release-binary, health 90.

## PENDING (owed — student's invitation only, never gated)

- Explain-backs owed: s43 close/reopen design; s45 behavior arc (IR shape /
  compiler contract / golden-test boundary / emission path).
- **In-game verification of the behavior emission** — NOW REACHABLE: the
  script lands in the right dir; a game run + `kubejs reload` proves the
  `give` count form (the last flagged runtime surprise). Also re-check the
  fresh-scaffold quests (2-quest question) in the same run.
- **Recipe-writer path bug** — flagged, needs its own fix + in-game verify.
- Monster dependency-lines in-game check (a626ac2 re-base, still unconfirmed;
  the original monster instance was deleted mid-s44 — needs the new instance).
- Release binary stale (integrity): dev-mode workflow, park until a real ship.
- 3-layer rule graded probe (FCI P2 row 2): taught-but-unconfirmed, at the
  student's invitation only.
- Re-reviews: 08-13 (rebuild-deploy-restart, round-trip, ftb-shapes), 08-14
  (git-versioned-file-change-context), 08-16 (merge, 300-line, doc-sync,
  debt, two-stores, claims-vs-repo).

## UNVERIFIED CLAIMS

- The `give` count form (`Item.of(id, count)` for stacks > 1) — golden tests
  lock the string, but no live KubeJS run has executed it. In-game node owed.
- Recipes applying in-game — the s44 evidence gate verified reload evidence,
  NOT that recipe scripts land where KubeJS reads them (the path bug above
  makes this genuinely unverified).

## DECISIONS (memory pointers)

- Behavior IR is derived + private; compiled output is the ecosystem artifact.
  [PACK-INDEX-DERIVED-SPINE — the same derive-don't-write-through stance]
- Store is deliberately dumb: no validation on save; the compiler is the
  single source of truth, surfaced via compile_behavior preview.
- Emission goes to `<root>/kubejs/server_scripts/` via `validate_under_root`,
  NOT the config-scoped `validate_project_write` (deliberate divergence from
  the buggy recipe writer).
- Behaviors never silently ship partial: uncompilable = skipped + reported.

## GOTCHAS (memory pointers)

- KubeJS reads scripts from project root, not config/. [KUBEJS-SCRIPTS-DIR-IS-PROJECT-ROOT-NOT-CONFIG]
- Bare `kubejs reload` dead on 1.21.1; script reload alone doesn't apply
  recipes. [KUBEJS-BARE-RELOAD-DEAD]
- Vanilla `item.canUse.*`/`item.modifiers.*` lang keys are UI labels, not
  items. [PACK-INDEX-UI-LABEL-KEYS]
- FTB quest rewards live in `item_id` (single), empty `items` (multi).
  [QUEST-REWARDS-IN-ITEM_ID]
- Loot tables key by full resource path, not bare filename; scan both dir
  names. [LOOT-FULL-PATH-KEYS]
- s44 emitter/save gotcha re-learned: code:gotcha/decision entries must carry
  the NAME prefix IN CONTENT (not just the type tag) or memory-check fails.

## Environment reminders

- Binary rebuild check: `src-tauri/target/debug/modcanvas` mtime vs newest
  edit; `pnpm dev` triggers Rust rebuild, frontend hot-reloads.
- Memory `add` tool verified working (was broken at s44 close).

## Reference lines (memory-check contract)

GOTCHAS: KUBEJS-SCRIPTS-DIR-IS-PROJECT-ROOT-NOT-CONFIG, KUBEJS-BARE-RELOAD-DEAD, PACK-INDEX-UI-LABEL-KEYS, QUEST-REWARDS-IN-ITEM_ID, LOOT-FULL-PATH-KEYS
DECISIONS: PACK-INDEX-DERIVED-SPINE, LAUNCH-LIVENESS-NOT-EXITCODE, HEALTH-TOPOLOGY-MEASUREMENTS-NOT-BLOCKS, S43-QUEST-BOOK-REOPEN
