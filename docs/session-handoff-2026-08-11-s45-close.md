# Session Handoff — 2026-08-11 (s45 close: P2-BEHAVIOR arc + two root-caused bugs fixed)

Branch `new-features`. Tree clean at `7d354f3`. Ten s45 commits (8f6cbd1..
7d354f3) on top of the s44 handoff. Memory entries live; memory-check green.

## WHAT WE BUILT (one line)

s45 opened by repairing the s44 close, then built the first four chunks of
P2-BEHAVIOR (IR + compiler, persistence + commands, Behaviors tab, emission)
with in-game verification, and root-caused + fixed TWO real bugs found along
the way: the recipe-writer path bug and a template item-syntax crash that
made FTB Quests strip the first chapter.

## DONE (s45 commits, oldest → newest)

- `768cb94` — docs: s44 handoff doc (the s44 close never wrote one; memory
  `add` tool had failed at close, losing the close entry + 4 gotchas + 3
  decisions — all re-created with code-verified pointers).
- `8f6cbd1` — feat(behavior): Behavior IR + KubeJS compiler, first pair
  (`PlayerJoinsGame` → `GiveItem`). `src-tauri/src/behavior/` (mod.rs IR,
  compile.rs pure compiler, tests.rs golden tests). Golden tests caught a
  real emitter bug (missing `(` before `event`).
- `307a362` — chore(docs): paid 4 s44 doc-sync judgment rows + errata. The
  s44 close "integrity clean" claim was WRONG — 4 candidates existed.
  Lesson: read gate output at close, never assert from memory.
- `26666dd` — feat(behavior): persistence + commands. `path_safety::
  state_file_path` (single canonical `.modcanvas/` scoping; quest_graph_path
  delegates), `behavior/store.rs` (no validation on save — partial authoring
  is legal), commands `list_behaviors` / `save_behaviors` / `compile_behavior`.
- `837a001` — feat(behavior): Behaviors tab. `services/behavior.ts` (only
  frontend place the IR shape is known), `useBehaviors` hook (5 tests),
  `BehaviorTab.tsx` — list + card editor + LIVE compile preview.
  Deliberately NOT a generic VPL. Scope cut: GiveItem is a text input, not
  the ItemBrowser picker (needs the quest asset pipeline — queued).
- `d3791b2` — feat(behavior): emission — the missing link. In-game test
  ("saved a behavior and it didn't go off") traced to: save wrote only the
  IR, no script ever reached the instance. `behavior/emit.rs` compiles all →
  atomic-writes `kubejs/server_scripts/modcanvas_behaviors.js` (dedicated
  file, project-root scoped via `validate_under_root`). Honest failure
  contract: uncompilable behaviors skipped + reported as `emit_failures`.
- `6a5e7d8` — docs: session handoff (s45 chunks 1-4).
- `e3a5804` — feat(health): behavior item-reference checks — Behaviors health
  section. `pack-health/checks/behaviors.ts` (recommended, never blocking —
  the student decided the roadmap's "Blocking" wording loses to the Trust
  Rule; recorded as a written deviation in roadmap §11.2/§13). New
  `core/behavior/behavior-store.ts` (zustand, not persisted). 10 tests.
- `a5f2f0a` — fix(recipes): KUBEJS-SCRIPTS-DIR-IS-PROJECT-ROOT-NOT-CONFIG.
  `write_script_files` resolved both KubeJS and CraftTweaker paths through
  the CONFIG-scoped `validate_project_write`, landing scripts in
  `config/kubejs/` — which KubeJS never reads. Recipes were silently never
  applying; the files masqueraded as config files. Fixed via
  `validate_under_root`; regression lock
  `test_under_root_resolves_to_project_root_not_config`. My own comment
  pushed commands/mod.rs to 304 lines — the line-limit gate caught its own
  enforcer; trimmed to exactly 300.
- `0c2f296` — docs: in-game verification record. On `monster`: a behavior
  giving `minecraft:diamond` count 10 fired on join (the `Item.of(id, count)`
  form — the flagged §21 risk #3 surprise — is CLOSED), and a saved recipe
  hot-reloaded with evidence-verified PASS and worked in-game. Both handoff
  UNVERIFIED items → VERIFIED.
- `7d354f3` — fix(template): TEMPLATE-ITEM-TASK-BARE-STRING-NPE. See FINDINGS
  #3 below. Template item tasks → 1.21 Data Components compound form;
  fidelity lock `template_item_fields_are_never_bare_strings`; round-trip
  proves identical import; restored the game-stripped instance (backup:
  `quests.corrupted-20260811-game-strip.bak`).

## FINDINGS (all root-caused, all fixed)

1. **Behavior "didn't go off" = no emitter existed** (fixed d3791b2). The
   instance's `kubejs/server_scripts/` had only KubeJS's own `main.js`.
2. **Recipe-writer path bug** (fixed a5f2f0a). KubeJS reads scripts from
   `<root>/kubejs/server_scripts/` (project root), CraftTweaker from
   `<root>/scripts/` — NOT `<root>/config/`. The config-scoped validator
   silently redirected them; recipes were never applying. The s44 evidence
   gate proved the reload COMMAND ran, not that the script landed where
   KubeJS reads it. **In-game verified after fix.**
3. **Template item-syntax NPE** (fixed 7d354f3, root-caused via game log +
   FTB jar bytecode). The template's Exploration_Starter used the PRE-1.20.5
   bare-string item form (`item = "minecraft:oak_log"`). On 1.21.1, FTB
   Quests 2101.1.30's `ItemTask.readData` → `itemOrMissingFromNBT` expects
   Data Components → `createTask` returns null → `readQuestsFromNBT` calls
   `handleLegacyTaskNBT(null,…)` BEFORE its null-check → the task's `title`
   triggers `addTranslation(null)` → NPE → the WHOLE book fails to load →
   the game auto-saves a stripped 2-quest chapter. The editor looked normal
   because it reads `.modcanvas/quests.json` (never involved); the game
   reads the corrupted on-disk files. Shape survived because all its tasks
   are checkmark (no item refs). Falsified along the way: `=` vs `:` style
   (FTB's parser accepts both — bytecode-verified), task type strings
   (auto-namespaced), task titles (Task.getObjectType() can't be null).

## IN-FLIGHT

None — tree clean at `7d354f3`, 380 Rust + 683 frontend green, integrity
clean except the parked release-binary.

## PENDING (owed — student's invitation only, never gated)

- Explain-backs owed: s43 close/reopen design; s45 behavior arc (IR shape /
  compiler contract / golden-test boundary / emission path).
- **In-game confirm the FIXED template loads** — the last unverified link:
  the restored Exploration_Starter (compound item form) has never been read
  by a live game. Next launch should show all 7 quests with icons. This also
  confirms the restoration end-to-end.
- Monster dependency-lines in-game check (a626ac2 re-base, still unconfirmed;
  the original monster instance was deleted mid-s44).
- Release binary stale (integrity): dev-mode workflow, park until a real ship.
- 3-layer rule graded probe (FCI P2 row 2): taught-but-unconfirmed, at the
  student's invitation only.
- Re-reviews: 08-13 (rebuild-deploy-restart, round-trip, ftb-shapes), 08-14
  (git-versioned-file-change-context), 08-16 (merge, 300-line, doc-sync,
  debt, two-stores, claims-vs-repo).

## UNVERIFIED CLAIMS

- The fixed template loading in-game (see PENDING — the one live link left).
- Everything else this session shipped with either golden tests, regression
  locks, round-trip tests, or in-game verification.

## DECISIONS (memory pointers)

- Behavior IR is derived + private; compiled output is the ecosystem artifact.
  [PACK-INDEX-DERIVED-SPINE — the derive-don't-write-through stance]
- Store is deliberately dumb: no validation on save; the compiler is the
  single source of truth, surfaced via compile_behavior preview.
- Emission goes to `<root>/kubejs/server_scripts/` via `validate_under_root`.
  [KUBEJS-SCRIPTS-DIR-IS-PROJECT-ROOT-NOT-CONFIG]
- Behaviors never silently ship partial: uncompilable = skipped + reported.
- Behavior missing-item health findings are RECOMMENDED, never blocking —
  the roadmap's "Blocking" wording loses to the Trust Rule (student's call,
  s45). Recorded in roadmap §11.2/§13 as a written deviation.
- Template item tasks must use 1.21 Data Components compound form, locked by
  a fidelity test — template and exporter can never drift.

## GOTCHAS (memory pointers)

- KubeJS reads scripts from project root, not config/ (FIXED + verified).
  [KUBEJS-SCRIPTS-DIR-IS-PROJECT-ROOT-NOT-CONFIG]
- Bare-string item tasks NPE FTB 2101.1.30 and the game strips the book
  (FIXED + locked). [TEMPLATE-ITEM-TASK-BARE-STRING-NPE]
- The `give` count form (`Item.of(id, count)`) — IN-GAME VERIFIED on monster.
  [GIVE-COUNT-FORM-IN-GAME-VERIFIED]
- Bare `kubejs reload` dead on 1.21.1; script reload alone doesn't apply
  recipes. [KUBEJS-BARE-RELOAD-DEAD]
- Vanilla `item.canUse.*`/`item.modifiers.*` lang keys are UI labels, not
  items. [PACK-INDEX-UI-LABEL-KEYS]
- FTB quest rewards live in `item_id` (single), empty `items` (multi).
  [QUEST-REWARDS-IN-ITEM_ID]
- Loot tables key by full resource path, not bare filename; scan both dir
  names. [LOOT-FULL-PATH-KEYS]
- code:gotcha/decision entries must carry the NAME prefix IN CONTENT (not
  just the type tag) or memory-check fails (re-learned s45).
- The grep/glob display in this environment mangles long identifiers
  ("kubejs" → "ln", function names → "n") — read files directly, don't
  trust search output (s45 recurring).

## Environment reminders

- Binary rebuild check: `src-tauri/target/debug/modcanvas` mtime vs newest
  edit; `pnpm dev` triggers Rust rebuild, frontend hot-reloads.
- Memory `add` tool verified working (was broken at s44 close).
- The corrupted quest book backup lives at `monster/minecraft/config/
  ftbquests/quests.corrupted-20260811-game-strip.bak`.

## Reference lines (memory-check contract)

GOTCHAS: KUBEJS-SCRIPTS-DIR-IS-PROJECT-ROOT-NOT-CONFIG, TEMPLATE-ITEM-TASK-BARE-STRING-NPE, GIVE-COUNT-FORM-IN-GAME-VERIFIED, KUBEJS-BARE-RELOAD-DEAD, PACK-INDEX-UI-LABEL-KEYS, QUEST-REWARDS-IN-ITEM_ID, LOOT-FULL-PATH-KEYS
DECISIONS: PACK-INDEX-DERIVED-SPINE, LAUNCH-LIVENESS-NOT-EXITCODE, HEALTH-TOPOLOGY-MEASUREMENTS-NOT-BLOCKS, S43-QUEST-BOOK-REOPEN
