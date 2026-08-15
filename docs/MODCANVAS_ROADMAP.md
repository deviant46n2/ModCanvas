# ModCanvas — Product & Engineering Roadmap

> **Status:** Living engineering document. The strategic layer above `docs/PROJECT_BIBLE.md`
> (mission + ruleset) and `todo.md` / `todo-tooling.md` (execution backlogs). When this
> document conflicts with `PROJECT_BIBLE.md`, the Bible wins — until it is deliberately
> amended there.
>
> **Audit basis:** repo state at `b294ac5` (2026-08-10), branch `fix_debt`, clean tree,
> **refreshed 2026-08-13** (s51-followup docs audit — §3.2/§3.3/§3.5 re-verified against
> the tree; the P0/P1/P2 §13 sections carry their own per-chunk session-tagged statuses).
> Every "implemented" claim below was verified against the codebase (file:line cited),
> not against documentation. "Documented-but-aspirational" means the docs describe it
> and the code does not contain it.
>
> **Owner:** project maintainer. Amend it deliberately; ignore it at your own cost.

---

## 0. Current Development Posture (s52)

**STATUS: CONSOLIDATION / VALIDATION.** The s52 critical product/engineering
intervention is complete (see `docs/CRITICAL_PRODUCT_AUDIT.md` +
`docs/CRITICAL_PRODUCT_ACTION_PLAN.md`): ~4,400 lines of dead/superseded code
removed, the roadmap's current-state sections re-verified against the tree,
and the directed maintenance queue below established. **A roadmap item is not
authorization to implement it** — the sections of this document describe the
strategic space, including things deliberately NOT being built yet.

### Directed maintenance queue (current priorities)

| Priority | Item | Status | Rationale |
|---|---|---|---|
| 1 | **Pack Health: wire the `target` jump-to-quest** | **DONE (s52)** — jump button on quest findings with a nodeId (undefined reward table, missing item, cycles, unreachable quests) selects + centers the quest in the editor, switching chapters as needed. Two tests lock the wiring. See `docs/CRITICAL_PRODUCT_AUDIT.md` finding #8. | Every quest finding carries `target: {section, nodeId}` (types.ts:16-19) — populated, never read. The "what can I do about it" link is modeled and unwired; wiring it takes the panel from "what's wrong" to "go fix it" (audit finding #8). Do not claim the jump exists until it does. |
| 2 | **Beginner Mode redesign** | **STRIP SHIPPED (s53)** — product call ruled s52: the mode becomes a coach, not just a hiding switch. First iteration: the hint strip (4-step wedge journey, real-signal states, never claims quest completion). See `docs/beginner-mode.md`. Remainder parked with written reasons: the driver (quest editor → tab wiring, the §9.5 rat's-nest) and the §9.4 preset forms. | The mode gates 2 of 7 editors (code-hiding only). The goal is NOT merely hiding advanced controls — evaluate whether the product's workflow is actually understandable to a first-time modpack creator (audit finding #11). Product call first; implementation after. |
| 3 | **Real-pack fixture testing** | DEFERRED TO NEXT MILESTONE | The unit/integration suite is strong (453 Rust + 697 FE tests) but realistic end-to-end validation against actual modpacks is the next major confidence layer (audit finding #12 — golden-artifact fixture suite). |
| 4 | **Companion/Java test investment** | DEFERRED WITH WRITTEN REASON | `companion-socket.ts` (frame parsing, reconnect backoff) and the Java companion have zero tests. Deferred because it is medium-cost, lower-value than the fixture; revisit after fixtures land (audit finding #13). Not forgotten debt — a written deferral. |
| 5 | **PRISM-LEAN (s53)** — mod EXECUTION moves to Prism Launcher | **CHUNK 1 DONE (s53)** — handoff shipped: `open_prism_instance` (`prismlauncher --show <instanceId>`), wizard curated step = curated list + "Open Prism to install these" (manual-link fallback for non-instance packs), Mods tab "Add mods in Prism" button. Docs: `docs/mods-tab.md`. | ModCanvas curates + diagnoses; Prism executes (version matching + dependency resolution — verified: FTB Quests in Prism pulls Library/Teams/Architecury; ModCanvas's own search cannot surface CF mods: `searchFilter=ftb` → 50 irrelevant hits, zero FTB mods, live-verified 2026-08-13). Student ruling; rationale: delegate risky high-surface execution to battle-tested software. |
| 6 | **PRISM-LEAN chunk 2** — evidence-backed deletion of the deprecated add-mods machinery | **DONE (s54)** — search surface deleted: `search_mods` / `install_mod_from_search` (renamed `install_modrinth_mod`, Modrinth-only) / `search_merge.rs` / orphaned CF download fns / Mods-tab search UI / SearchResultRow / CategorySelect / SourceToggles (4 test files deleted, 2 edited, s52 evidence pattern). **Refined on ruling:** the one-click Modrinth installer was KEPT (wizard curated picks + compat panel) — keyless and loop-closing; CF installs (FTB Quests) go to Prism with explicit guide copy naming the three required deps (wizard step + core-mod gate finding). CF-key use for installs is dead everywhere. Docs: `docs/mods-tab.md`. | See row 5 for the ruling rationale. The refinement (s54): the s53 kill-list overreached on the compat one-click — Modrinth's API is keyless, so an app-diagnosed missing dep can be repaired in-app honestly; CF deps stay invisible (`CurseForgeFileInfo` parses none), so FTB Quests always installs through Prism. |
| 7 | **Dep-gate the green check (s54-B) — RULED (s55): warn persistently, never gate; REFINED (s56): required deps of core mods gate + auto-install** | **DONE (s55 + s56)** — (s55) missing required deps surface as a persistent, NON-blocking warning in Pack Health (Mods section, `checkMissingDeps` + `depIssues` in the pack-health store, fed by every compat-check site). Launch stays open — the user may legitimately not want to install a mod right now (student ruling). The network-dependence question resolved: the compat check already degrades to no-claim on fetch failure; the store is the materialized cache. (s56) **Carve-out, student ruling after a live first-boot failure** (`kubejs requires rhino`, flatpak pair): required deps of CORE mods are the core gate's lane — Rhino joined `CORE_MOD_PATTERNS` because KubeJS's `neoforge.mods.toml` declares it required and NeoForge refuses to boot without it. The gate is now the closure of core mods over their required deps; the warning lane keeps deps of user-chosen mods. Dep issues for missing core mods are deduped out of the warning lane (blocking owns the fact), conditioned on the scan (no scan → gate silent → dep warning survives). **Auto-install (s56, student ruling: "all required mods auto installed"):** the gate list is the single source of truth — each entry carries its install path (`modrinthSlug` → auto-install on wizard Continue; no slug → manual via the Prism guide, FTB Quests = CF wall, verified not on Modrinth). A future required mod = one row with a slug, no wizard edits. | The s54-A dep loop (inline one-click installs) closed the *action* loop; this closes the *honesty* loop — a pack with an unresolved required dep is never silently blessed, but also never blocked over it. The s56 carve-out: a load-bearing dep of a core mod is not discretionary — blocking it is the wedge promise, not a gate on user choice. Auto-install extends the same logic: a required mod is not a choice, so the wizard installs it. |

### Deliberately deferred expansion

Unless a future roadmap decision explicitly reactivates an item, the following
feature-surface expansions are constrained. **Read this roadmap as "here is
the strategic space; these are the things we are deliberately NOT building
yet" — not as a build list.**

- Additional Minecraft version support
- Generalized behavior-system expansion
- Unnecessary FTB Quests parity work (beyond currently justified gaps)
- Major companion expansion
- Runtime hot-swap expansion (quest+kubejs reloads are live; config/CraftTweaker stay disabled with written reasons)
- AI features
- Major architectural rewrites
- Additional rendering infrastructure — **PARTIALLY REACTIVATED (s58)**: the
  engine-upgradeable item pipeline (items that resolve flat offline but whose
  model chain reaches 3D block geometry are rendered 3D by the companion when
  connected, flat stays the offline fallback). Scope: the existing
  engine-render pipeline gains a second feeder class; no new renderer, no
  full-capture sweep, no companion changes. The rest of this item (other
  rendering infrastructure) stays deferred.
- Additional maintainer tooling

Deferred is not forgotten; it is deliberate. See `docs/CRITICAL_PRODUCT_AUDIT.md`
for the findings ledger and per-item rulings.

---

## 1. Executive summary

ModCanvas is **not an empty project**. The audit (2026-08-10) confirms the workbench core is
largely built and genuinely functional:

- A deep, faithful **FTB Quests 1.21.1 editor** (canvas, tasks, rewards, reward tables, smart
  filters, quest links, dependency curves, undo/redo, progress simulation, animated + baked 3D
  icons) — `frontend/src/QuestBookEditor.tsx`, ~45 components under `components/quest/`.
- A **recipe editor** covering KubeJS, CraftTweaker, and vanilla datapacks with bidirectional
  scan, unified per-recipe disable, authored-only save gate, JSON paste-import.
- A **config editor** (structured typed forms + raw), comment-preserving, atomic, in place.
- A **mods tab** with real Modrinth + CurseForge search, install, compatibility checks.
- A **pack-health go/no-go panel** (Tier 1 shipped) — the only "project-wide verdict" surface
  in the ecosystem, implemented as a pure function of materialized state.
- Global **undo/redo** with a durable journal and a timeline drawer.
- A **companion mod** (NeoForge 1.21.1) that renders items with the real Minecraft renderer,
  extracts runtime textures, and provides a live WebSocket bridge.
- A mature **maintainer tooling suite** (integrity gate, health report, backup, memory-check).

The gap is exactly what `PROJECT_BIBLE.md:176` says: **"It is the beginner layer."**
A first-time user faces a fully-armed IDE. The wizard, Beginner Mode, mini-wizards, and
distribution pipeline named in the Bible's MVP (§8.1) **do not exist in any form** — verified:
the new-pack modal is a 3-field form, `createProject` scaffolds nothing.

This roadmap makes three architectural judgments, each argued from the code:

1. **Do not build a monolithic "Modpack Model."** The existing architecture is already a
   scan → index → editor pipeline. The correct evolution is the **Pack Index**: a derived,
   read-mostly reference spine (items, tags, recipes, quests, mods, configs keyed by stable
   IDs) that editors and Pack Health consume. Additive, deterministic, no rewrite.
2. **The no-code behavior system is a constrained Trigger → Conditions → Actions model** with
   a small action library compiled to real ecosystem artifacts (KubeJS, datapacks) — not a
   generic visual programming language. Phase it in at P2, after the beginner wedge.
3. **Mixin editing is not a user feature.** It is an internal implementation backend for the
   far future, explicitly demoted (§12).

**P0 is the beginner wedge** (wizard, Beginner Mode, mini-wizards, Pack Health green check,
distribution/CI) plus the launch-path blocker (companion stability) and the hygiene floor
(dead-code pruning, the CurseForge export bug, the 1.19.2 adapter lie). Everything else is
P1+.

The final section (§21) answers the no-code boundary question with a technically grounded
answer, not a marketing one.

---

## 2. Product vision

### 2.1 The mission (unchanged, from `PROJECT_BIBLE.md:14`)

> **ModCanvas is a professional, offline-first desktop workbench for authoring Minecraft
> modpacks — so you never have to boot the game just to tweak, create, or validate content.
> You open Minecraft when you *want* to test, never because you *have* to.**

Two audiences, one tool: beginners who want a first pack without learning to program, and
veterans who want a tenth pack without ceremony.

### 2.2 The guiding principle for this roadmap

> **ModCanvas handles the technical implementation so the creator can focus on designing the game.**

Concretely, that means the user interacts with **Minecraft/game-design concepts** (items,
recipes, quests, loot, progression, "when this happens, do that") — never with KubeJS
syntax, CraftTweaker ZenScript, datapack JSON shapes, or SNBT token rules. The editors
already embody this for quests and recipes. The roadmap extends the same principle to
behaviors, then to worldgen and loot.

### 2.3 Constraints that shape every roadmap decision

From `PROJECT_BIBLE.md` §4–§6 and `AGENTS.md`:

- **Offline-first, deterministic, no mandatory AI.** "No AI integration at launch, full
  stop" (`PROJECT_BIBLE.md:112`). The only sanctioned AI path is community-demanded log
  deciphering — never content generation.
- **No lock-in.** Outputs are real ecosystem artifacts (SNBT, `.js`, `.json`, datapacks).
  Private editing state is disposable convenience.
- **The Trust Rule.** "ModCanvas validates files, never simulates the game." Any roadmap
  item that drifts toward a game simulator is rejected.
- **Version discipline.** One primary target, full fidelity, then expand. Adding a version
  = new adapter file, never edits to existing ones.
- **No asset bundling.** Image bytes never enter the bundle; descriptors + lazy
  materialization only.

### 2.4 What "no-code" means here

No-code does **not** mean "no text editing." It means: **no programming-language syntax the
user must learn**. A veteran may still open the raw KubeJS drawer; a beginner never has to.
The definition of success is the MVP exit criterion (`PROJECT_BIBLE.md:180`): *a person with
zero modpack experience can create and launch a playable-but-not-great pack on 1.21.1 /
NeoForge without ever seeing or writing a line of code.*

---

## 3. Current-state audit

### 3.1 Method

Three deep subsystem audits (frontend, Rust backend, docs/tests/companion) were run against
the working tree at `b294ac5`, then spot-verified. Claims below cite `file:line`. Where a
documented capability had no code behind it, it is labeled **aspirational**.

### 3.2 What is real today (verdicts)

| Domain | State | Evidence |
|---|---|---|
| Quest editor (FTB Quests) | **Implemented, deep** — near-full parity (roadmap §13 P1-PARITY tracks the remaining gaps); **export layout fixed s42** (1.21.x exports ONLY FlatChapters `quests/chapters/*.snbt` — verified against the shipped 2101.1.30 jar, which loads no other layout; the older Subdirs export loaded 0 chapters in-game) | `QuestBookEditor.tsx:32`; `components/quest/` (~45 files); SNBT/JSON5 import + version-aware export (`imports/ftb_quests/`) |
| Recipe editor (KubeJS/CT/vanilla) | **Implemented** — scan, unified disable, authored-only save, 6 specialized types | `RecipeEditor.tsx:45`; `recipes/mod.rs:85`; `scriptgen/`; `recipe_disable/mod.rs` |
| Config editor | **Implemented** — structured forms + raw, TOML comment-preserving in place | `ConfigsTab.tsx:32`, `config-editor.tsx:26`; `config_parser/toml_update.rs:11` |
| Mods tab | **Implemented (PRISM-LEAN, s54)** — grid, bulk, compat diagnosis + Modrinth one-click installs, Prism handoff | `ModsTab.tsx:58`; `commands/modpack/install.rs` (Modrinth-only installer); `open_prism_instance` (`modpack/mod.rs`); search surface deleted (chunk 2) |
| Pack Health | **Implemented (Tier 1)** — go/no-go, 3 honest states, pure derivation | `core/pack-health/index.ts:128`; `PackHealthTab.tsx:80`; `checks/{quests,recipes,pack}.ts` |
| Loot tab | **Implemented (s44 scan, s47 editor)** — scan + list + detail (pack data + mod jars, both `loot_table`/`loot_tables` dirs, full-path ids); full-depth editor, verbatim atomic save, new-table creation (see §13 P3-LOOT) | `components/loot/LootTab.tsx`; `services/loot.ts`; `hooks/useLootTables.ts`; `src-tauri/src/loot/` (`parse.rs` pure, `pack_scan.rs` walker, `editor.rs`, `create.rs`); roadmap §13 P3-LOOT |
| History / undo | **Implemented** — durable journal, timeline drawer | `core/history/store.ts:86`; `HistoryDrawer.tsx`; `commands/history.rs:11` |
| Pack lifecycle | **Implemented** — create/load/list/save/delete, import mrpack/CF/packwiz/instance | `commands/project.rs`; `imports/mod.rs` |
| Launch | **Implemented** — Test → Prism via `LauncherDriver`, companion deploy | `launcher.rs`; `minecraft/launch.rs:11`; `launch_mc_instance` |
| Companion mod | **Implemented (NeoForge 1.21.1 only)** — item rendering, texture extraction, reload (quest+kubejs enabled s42–s44, evidence-gated), stop/restart | `workbench-companion-neoforge-1.21/` (11 Java files); `ws_protocol.rs:10-41` |
| Texture pipeline | **Implemented** — descriptor index, lazy materialization, bake: keys, animations, tags | `instance_textures/`; `services/texture-loader/` (facade + materialize/baked/targets); `engine_renders.rs` (CACHE_VERSION 6) |
| Mod intelligence | **Implemented (network-only) — search/install DEPRECATED under PRISM-LEAN (s53); kept for import paths** | `mod_intelligence/modrinth.rs:7`; `curseforge_search.rs:18` |
| Maintainer tooling | **Implemented** — integrity, health, backup, memory-check, systemd timer | `scripts/*.mjs`; `docs/tooling.md` |

### 3.3 Documented-but-aspirational (verified missing from code)

| Thing | Documented in | Reality |
|---|---|---|
| First-Pack wizard | `PROJECT_BIBLE.md:258` (§10.2) | **Implemented (P0-WIZARD chunks 1–3; s49 reshape).** Entry is a four-card `StartChooser` (intro / IDE tour / blank / load — user choice, never first-run detection). `WizardStepper.tsx`: name your pack (auto-creates a fresh Prism instance, MC 1.21.1 · NeoForge) → **curated mod picks** (backend-filtered, pre-ticked; execution hands off to Prism — s53 PRISM-LEAN) → **green check + Launch** (same report as the Health tab, `test_project`). The guided first quest moved OUT of the wizard to the live surface (s53 — see step 5 below). The chooser presets the template; blank starts skip the post-create steps and land straight in the IDE. `create_project` scaffolds template packages. Guided first quest lands with P0-MINIWIZ. |
| Beginner Mode | `PROJECT_BIBLE.md:279` (§11) | **Implemented (P0-BEGINNER, s47–s49).** `useBeginnerMode` hook (`hooks/useBeginnerMode.ts`) toggles `beginnerMode` app-wide; the TopBar carries the toggle, and `ProjectWorkspace`/`ConfigsTab`/`RecipeEditor`/`RecipeEditorHeader` hide raw surfaces when it is on. The `intro` template (see Templates row) is the beginner wedge; both shipped templates end with a self-removing **Shed the Guide** lesson. Not yet a full surface-hiding state machine (raw editor access is gated per-surface, not per-mode). |
| Mini-wizards | `PROJECT_BIBLE.md:271` (§10.4) | **Partially implemented (P0-MINIWIZ).** `GuidedQuestWizard` (`components/quest/GuidedQuestWizard.tsx`, 170 lines) guides a first quest — entries: the quest editor's `✨ Add a quest` toolbar button (everyone) and the Beginner Mode live banner (s53, first companion connect per session). The external wizard handoff (`showGuidedQuest`) was removed with the wizard step (s53). Only the quest mini-wizard exists; recipe/config/behavior mini-wizards not built. |
| Templates / scaffolded packs | `PROJECT_BIBLE.md:262` (§10.2 step 3) | **Partially implemented (P0-WIZARD chunks 1–2; s49 rekey).** `create_project` accepts an optional `template_id` and scaffolds a content package into `<project>/config/ftbquests/quests/` (`src-tauri/src/templates/`, embedded via `include_str!`). Two templates ship: `intro` (6-quest core loop, Beginner Mode) and `ide-tour` (21-quest feature walkthrough, pure tool teaching, 3 example behaviors) — both end with a self-removing **Shed the Guide** lesson. Scaffold refuses instances that already have a quest book. Config profiles + recipe content pending. |
| Distribution / CI / release | `PROJECT_BIBLE.md:188,311` (§8.1 item 5, risk 4) | **Does not exist.** No CI, no release artifacts pipeline (only local `pnpm build`). |
| Progression editor / campaign surface | §3.1 of this doc (progression tab killed pre-s49; workspace-actions.md tab list corrected 2026-08-13) | **Does not exist.** Per-quest progression fields + canvas simulation mode only (`core/quest/progress.ts`). The "progression" tab was killed; the 7-tab strip is health/mods/configs/quests/recipes/loot/behaviors. |
| HOCON config parsing | `config_parser/mod.rs` enum, `config.rs:46` | **Missing parser arm.** `parse_config` falls through to raw String (`config_parser/parse.rs:8-17`). |
| Modpack Model / unified model | this document's problem statement | **Does not exist** — see §7. The correct form is the Pack Index. |

### 3.4 Dead, partial, or duplicated systems (the cleanup list)

Verified against the code. Each entry needs a **prune-or-park-with-written-reason** decision
(see P0-HYGIENE-1).

1. **Rust commands registered but never called by the frontend** (`lib.rs:135-233` vs
   `frontend/src/services/*`). **Executed in the s34 debt arc** (triage below recorded for
   the record): 24 pruned, 6 parked. Pruned: predecessor commands superseded by
   async/batch variants (`check_compatibility` → `check_compatibility_async`,
   `get_texture_file` → `get_texture_files`, per-node quest mutations → whole-graph
   `save_quest_graph`, `get_config`/`save_config` legacy temp-mirror), unused import
   paths (`download_modpack_modrinth`, `import_modpack_via_prism`,
   `import_curseforge_via_prism`; `import_instance_folder`/`import_packwiz`/
   `import_curseforge_zip`/`import_modrinth_mrpack` were **kept** — `auto_import_pack`
   dispatches to them), dead search (`search_modpacks`, `search_modpacks_curseforge`,
   `search_modpacks_all`, `search_items`, `search_tags`, `get_item_details`), dead
   workspace (`get_packwiz_workspace`, `get_kubejs_scripts`, `get_all_kubejs_scripts`),
   and `open_project`, `write_quest_graph_to_instance`, `auto_generate_quest`,
   `import_ftb_quests_one_click`, `debug_instance_scan`. Also pruned: the never-registered
   `sync_instance_mods` (commands/project.rs) and `register_ws_ipc_commands` (ws_ipc.rs).
   **Parked with written reason (runtime family)**: `launch_mc_instance`,
   `create_mc_instance`, `stop_mc_instance`, `remove_mc_instance`, `get_mc_logs`,
   `resolve_mc_loader_version` — retained as the intended runtime API for P0-LAUNCH;
   the UI currently routes through `test_project`.
2. **Orphaned legacy canvas module** — `frontend/src/components/canvas/**` (5 files:
   SelectionTools, useAlignmentActions, useQuestSync, ValidationOverlay, canvas-tools.css):
   imported nowhere (pre-react-flow generation). Its only consumer of `core/sync/*` makes
   that whole layer dormant too. **Deleted in the s34 debt arc** (git rm, zero dangling
   references). `core/sync/*` stays: it is the documented hot-swap re-enable path (item 4).
3. **`frontend/src/services/graphConverters.ts`** — orphaned (`graphToApiData`/`toRfEdges`),
   superseded by `useQuestCanvasModel`. **Deleted in the s34 debt arc.**
4. **Hot-swap reload path** — **un-frozen s42–s44 behind the reload-evidence gate.** `QUEST_HOTSWAP_ENABLED = true`, `KUBEJS_HOTSWAP_ENABLED = true` (`core/sync/config.ts:26-27`); `HOTSWAP_FROZEN` is the derived inverse (`:30`). Live send-sites: `useQuestToolbarActions.ts:90` (quest, evidence-gated), `useRecipeSave.ts:28` (kubejs) → `services/hotswap.ts` (pin → broadcast → verify log line). `RELOAD_CONFIG`/`RELOAD_CRAFTTWEAKER` stay disabled with a written reason (`config.ts:22-25` — signatures unprobed). The s43b status in §13 P2-HOTSWAP (verified in-game, three save→reload cycles) is the source of truth; earlier "frozen" wording in this section and §3.2/§5.1/§14.3/risk-table was corrected in the s52 audit.
5. **`mod_metadata` DB table is a dead schema** — created in the schema (`db.rs` init_schema), never written.
   **Removed from the schema in the s34 debt arc.** Existing databases keep the (empty,
   never-populated) orphan table — no migration warranted; fresh DBs never create it.
6. **CurseForge export silently drops Modrinth-sourced mods** — collected into
   `_modrinth_mods` but never written into the zip. **FIXED (pre-s52):** `imports/curseforge/
   export.rs:102-133` now ships non-CurseForge mods as real jars into `overrides/mods/`,
   and a missing jar fails loudly with a named error (`:104-110`), never a silent drop.
7. **Silent cross-version adapter fallback** — a pack whose MC version has no adapter card
   (e.g. 1.19.2, or a minor like 1.20.4) resolved to the default 1.21.1/NeoForge card with
   only a console warning (`adapters/factory.ts:46-83`), so the app would write wrong-version
   syntax into the pack with no user-visible signal. **RESOLVED (s51-followup):** the
   major-versions-only adapter scope is now a written policy (AGENTS.md), and the
   `UnsupportedVersionBanner` (`components/common/UnsupportedVersionBanner.tsx`,
   `adapters/support.ts`) surfaces cross-version fallbacks at the workspace level (above the
   tabs, so quest/recipe/loot writers are all covered). The former `NewProjectModal` 1.19.2
   lie is also gone — it was deleted in `a2b4753` (s49) and the wizard hardcodes the one
   supported combo (1.21.1/NeoForge).
8. **300-line rule violations** — **mostly paid down by splits since s34** (measured s52):
   the largest frontend file is now `recipe-store.ts` 294, `useModState.ts` 298; all seven
   files cited in the s34 roster are under 300 (`texture-loader.ts` 31 — now a facade over
   `texture-loader/`, `quest-types.ts` 8, `useQuestAssetPipeline.ts` 75, `checks/quests.ts`
   28, `config-editor.tsx` 184). Rust: `recipes/mod.rs` 101, `quest_config.rs` 67,
   `path_safety.rs` 237, `db.rs` 123, `modrinth.rs` 84, `analysis.rs` 131;
   `scriptgen/kubejs.rs`/`crafttweaker.rs` are now directories. Run `pnpm integrity` for the
   current roster; the gate remains the source of truth.
9. **`ws_ipc.rs` was 404 lines with zero tests** — **now tested (s52 measurement):** the hub
   is 213 lines with `ws_ipc/tests.rs` (143 lines, 16 test fns: handshake arms, routing
   predicates, frame parsing). `quest/analysis.rs` (131 lines) still has zero tests, and
   `db.rs` has 3 (`db/tests.rs`). The WebSocket hub is the most security- and
   reliability-sensitive surface in the app; the remaining gap is the live-socket path
   (no broadcast-counting / connection-lifecycle / emit-status integration test).
   (Companion Java has no tests by design — in-game verified only, `engine-renders.md:272-278`.)
10. **`quest/analysis.rs` — dead-end command** — `analyze_quest_graph` is registered
    (`lib.rs:191`), wrapped in a service (`services/quest.ts:13`), and **called by no
    frontend consumer** (grep s52: zero callers outside the wrapper). Zero tests. The
    structural analysis it performs overlaps the frontend's `analyzePackHealth`
    (`core/validation/quest-validator.ts` cycle detection). Not harmful, but it is a
    dead-end IPC surface: either wire a consumer or prune the command. Ownership boundary
    (Rust vs TS health) should be stated, not drifted (§10.5).

### 3.5 Documented-vs-code mismatches to correct in the docs

The 2026-08-13 **critical product audit** (`docs/CRITICAL_PRODUCT_AUDIT.md` +
`docs/CRITICAL_PRODUCT_ACTION_PLAN.md`, s52) re-verified §3.2 and §3.4 against
the tree and corrected the stale rows directly (hot-swap freeze myth, CF
export "bug" that was already fixed, the 300-line roster, ws_ipc test
status) — see the audit's findings ledger. Remaining OPEN rulings (dead
`core/sync/` layer, dead-end `analyze_quest_graph`, protocol dead items,
Beginner Mode scope) live in that ledger, not here.

All items in this list were fixed by the 2026-08-13 docs audit (`docs/audit-2026-08-13.md`),
except where noted. The list is kept for the record of what the audit found; do not treat
its entries as current drift.

- ~~`workspace-actions.md:15` lists a progression tab that was killed~~ — **fixed** in the
  audit (diagram now shows all 7 tabs: health/mods/configs/quests/recipes/loot/behaviors).
- ~~`README.md:31` says the beginner layer "is the active focus" — no code exists~~ —
  **superseded**: Beginner Mode shipped (s47–s49, see §3.3 row) and README was updated to
  state the beginner layer "is in place" with hot-swapping as the focus.
- `docs/audit-2026-08-05.md` cites deleted files (`progression.rs`, `commands/progression.rs`,
  `ingest.rs`, `imports/snbt.rs`) — dated snapshot by definition (it is a historical record);
  the "remaining debt" list needs a refresh pass against the current tree.
- `docs/config-editor.md` lists HOCON among parsed formats; the parser has no HOCON arm.
  **Still open** (P1-HYGIENE).
- ~~`docs/engine-renders.md` and `featureparity.md` audit notes~~ — **fixed** in the audit:
  featureparity.md was a phantom (never committed), unlinked everywhere; parity checklist
  lives in this document's §13 P1-PARITY.

### 3.6 Architecture state (what the roadmap builds on)

- **Three machines** (per the curriculum map): frontend asks, Rust backend does, companion =
  in-game truth. The frontend is React 19 + TypeScript; backend is Tauri v2 (Rust, 31k
  lines, 286 `#[test]` fns); companion is a NeoForge 1.21.1 mod speaking WebSocket to
  `127.0.0.1:9876` (`ws_ipc.rs:16`).
- **Layering** (AGENTS.md 3-layer rule): `frontend/src/core` pure, `services` state+IPC,
  `components` UI; Rust has no formal `/src/drivers/` dir (the audit's M2 finding) but the
  spirit holds — `path_safety.rs` gates all writes, `minecraft/` encapsulates launcher and
  companion drivers.
- **Model layer is central**: `models.rs` (284 lines) + `shared.rs` (321 lines) + the quest
  domain (`quest/types/`) are shared across DB rows, IPC payloads, `.modcanvas/quests.json`,
  and SNBT import/export. `QuestGraph` is the single source of truth for the editor working
  state.
- **Adapter matrix is frontend-only** (`adapters/`): 1.20.1 (Forge/NeoForge/Fabric),
  1.21.1 (NeoForge/Forge/Fabric/Quilt), `getAdapter` with exact → same-version-any-loader →
  hard 1.21.1/neoforge fallback. The Rust side handles version differences via scattered
  hardcoded checks (`recipes/mod.rs:203-208` recipe-vs-recipes folder, `instance_textures/
  tags.rs:46-57` tags/item-vs-tags/items, `recipes/vanilla.rs` result.id vs result.item).
- **Scan → index → editor pipeline already exists** and is the seed of the Pack Index (§7):
  `scan_instance_items_cmd` (item registry), `scan_instance_textures_cmd` (descriptor
  index), `resolve_item_tags_cmd` (tag index), `scan_pack_recipes_cmd` (recipe scan cache),
  `get_quest_graph` (quest graph). Pack Health already consumes several of these.
- **Persistence**: SQLite (`db.rs`: projects, mods, settings; `mod_metadata` dead), atomic
  file writes with EBUSY retry (`path_safety.rs:138`), `.modcanvas/` private editing state
  (quests.json, history journal), texture caches keyed per instance with jar-signature
  validation.

---

## 4. Existing capability inventory (the "do not rebuild" list)

Every item here exists and works. The roadmap's relationship to each is
**Keep / Harden / Expand / Integrate** — never rebuild.

| # | Capability | Location | State | Roadmap action |
|---|---|---|---|---|
| 1 | FTB Quests canvas editor (nodes, edges, chapters, groups, decorations) | `components/quest/` | Deep | **Keep**; feed mini-wizards (§9.5) |
| 2 | Task/reward authoring incl. smart filters | `quest-section-groups.tsx`, `core/quest/smart-filter.ts` | Deep | **Keep**; fill §13 P1-PARITY gaps |
| 3 | Progress simulation | `core/quest/progress.ts`, `QuestCanvas.tsx:249` | Works | **Keep**; Pack Health Tier 2 consumes it (§10) |
| 4 | Recipe editor (grid, 6 types, disable, bulk replace, JSON import) | `RecipeEditor.tsx`, `core/recipe/*` | Deep | **Keep**; templates/cheat-sheet follow-ups (todo.md:349-361) |
| 5 | Recipe scan + script generation (KubeJS/CT) | `recipes/mod.rs`, `scriptgen/*` | Deep | **Keep**; behavior-system compiler backend (§11.4) |
| 6 | Config structured+raw editor | `config-editor.tsx`, `config_parser/` | Works | **Keep**; add HOCON arm or drop from docs (P1-HYGIENE) |
| 7 | Mods search/install/compat | `ModsTab.tsx`, `mod_intelligence/` | Works (search/install) | **PRISM-LEAN (s53)** — in-app search/install DEPRECATED; Mods tab hands off to Prism (`open_prism_instance`). Diagnosis (scan, track, compat-check) stays. Chunk-2 deletion booked (§0 row 6). |
| 8 | Pack Health Tier 1 | `core/pack-health/*` | Works | **Harden** (trust-scope gaps) + **Expand** to Tier 2 (§10) |
| 9 | History/undo w/ journal | `core/history/*`, `history-provider.tsx` | Works | **Keep**; mini-wizards must route through it |
| 10 | Pack import (mrpack/CF/packwiz/instance) + FTB import | `imports/*` | Works (entry points partially dead) | **Integrate** into wizard's instance-pick; wire or prune dead variants |
| 11 | Pack export (mrpack, CF zip, FTB layout-aware export) | `imports/mod.rs:294`, `imports/curseforge.rs:293`, `export/mod.rs:26` | Works; **CF export drops Modrinth mods** (bug); quest export layout version-aware since s42 (1.21.x → FlatChapters only) | **Harden** — fix the bug (P1-HYGIENE-2) |
| 12 | Launcher attach + Test launch | `launcher.rs`, `minecraft/launch.rs` | Works | **Keep**; the wizard's final Launch button |
| 13 | Companion rendering/texture extraction | companion Java, `engine-renders.md` | Works | **Harden** for wizard-driven first launch (P0-LAUNCH) |
| 14 | Texture pipeline (index, lazy materialization, animations, tags) | `instance_textures/`, `texture-loader.ts` | Works | **Keep**; Pack Index item/tag spine (P1-PACKINDEX) |
| 15 | Global search, status bar, connection pill | `components/common/*` | Works | **Keep** |
| 16 | Maintainer tooling suite | `scripts/*.mjs` | Works | **Keep**; extend integrity with new rules as roadmap lands |

**Do not rebuild:** any of the above. Where the roadmap needs "more" of one of these, it is
an Expand/Harden/Integrate line item with a specific gap named.

---

## 5. Research-derived problem areas

The product research (recorded in `PROJECT_BIBLE.md:25-66`) identifies the recurring pack-
creator problems. This section maps each problem to the current-state reality and the
roadmap response.

### 5.1 The boot-to-test loop (`PROJECT_BIBLE.md:29-34`)

**Problem:** testing any change means restarting the game. **Current state:** ModCanvas
removes file-level errors before boot (Pack Health), and the companion provides live
reload for quests + KubeJS behind the reload-evidence gate (s42–s44, `core/sync/config.ts`,
§13 P2-HOTSWAP); config/CraftTweaker reloads stay disabled with a written reason.
**Roadmap:** P0 ships the "green check → Launch" loop for beginners; extending hot reload
beyond the current evidence-gated pair is an explicit P2 item (§13 P2-BEHAVIOR, note on
hotswap) and must be gated on stability, not novelty.

### 5.2 The coding prerequisite (`PROJECT_BIBLE.md:36-40`)

**Problem:** standard advice is "learn KubeJS and programming." **Current state:** quests
and recipes are already no-code. **Roadmap:** extend no-code to behaviors (P2), then loot
and worldgen (P3); quantify with the coverage map (§6).

### 5.3 Raw config torture (`PROJECT_BIBLE.md:42-46`)

**Problem:** twenty minutes hunting TOML for one setting. **Current state:** structured
config editor shipped. **Roadmap:** beginner-mode config forms (simplified presets, §9.4)
and a **config recommendation surface** (P2): "change X" as a typed search over structured
config values, not files.

### 5.4 In-game editors are not workbenches (`PROJECT_BIBLE.md:48-52`)

**Problem:** in-game quest editing is tedious, no copy/paste, no validation. **Current
state:** ModCanvas beats it on every axis (§13 capability rows mostly ✅).
**Roadmap:** the remaining parity gaps (§13 P1-5: theme-file fidelity, description editor,
book-level settings) close the last "I'll just do it in-game" escape hatches.

### 5.5 Tool fragmentation (`PROJECT_BIBLE.md:54-57`)

**Problem:** 50+ single-purpose mods, each with its own authoring language. **Current
state:** ModCanvas already orchestrates four formats. **Roadmap:** the Pack Index (§7) is
the first step toward a unified *authoring surface* without a unified *format* — the user
designs concepts, ModCanvas emits the right artifact per ecosystem.

### 5.6 Veterans live on plain text and VCS (`PROJECT_BIBLE.md:59-64`)

**Problem:** veterans won't adopt a tool that owns content. **Current state:** all outputs
are real artifacts; `git diff`-ability is preserved (history journal is private convenience).
**Roadmap:** keep this absolute. Any new backend (behaviors, loot) must emit real `.js` /
datapack JSON, never a ModCanvas-proprietary output format.

---

## 6. No-code coverage map

Qualitative by design — do not read false precision into these ranges. "Current coverage"
is what the shipped editors can do for a domain without code; "potential" is the roadmap
ceiling.

| Domain | Common use cases | Current | Potential | Remaining code cases | Difficulty to close |
|---|---|---|---|---|---|
| Recipes | craft/smelt/stonecut/smith/shapeless, disable, replace ingredient | **~85%** — grid editor, 6 types, unified disable, bulk replace | ~95% | NBT/tag-edge cases, `replaceOutput`, startup-event recipes | Low–Medium (todo.md:349-361 follow-ups) |
| Quests | tasks, rewards, tables, links, gating, milestones | **~90%** — full canvas parity | ~97% | `quest tags`, multi-page descriptions w/ inline images, theme-file WYSIWYG | Medium (§13 P1-PARITY) |
| Configs | flip a setting safely, find a setting | **~60%** — structured forms | ~85% | settings with no typed schema, cross-mod interdependencies | Medium (HOCON arm + schema heuristics + config recommendations) |
| Mods | find, add, remove, enable/disable, compat-check | **~60% (s53 PRISM-LEAN)** — install/search DEPRECATED (Prism owns execution: versions + deps); ModCanvas keeps scan, tracking, remove/toggle, compat DIAGNOSIS + curated list | ~90% | chunk-2 deletion of the deprecated machinery; compat panel install buttons → Prism handoff | Low–Medium |
| Progression | gating, ordering, bottlenecks, walls | **~50%** — per-quest fields + sim mode; no campaign surface | ~85% | progression-topology analytics (pure math), cross-chapter staging | Medium |
| Behaviors | "when X, if Y, do Z" (commands, loot on kill, stage gating) | **~5%** — nothing authorable | ~65% | anything requiring custom logic beyond the action library | **High** (the hard no-code problem; §11) |
| Loot | table edits, drops, weighted tables | **~5%** — nothing | ~60% | deep loot-table composition (nested pools, conditions-in-JSON) | Medium–High |
| Worldgen | ores, features, structures, biomes, dimensions | **~0%** | ~40% | anything beyond datapack-JSON scope | **Very High** (dimension/terrain is the deepest) |
| Pack health | "is my pack sound before boot" | **~95%** of Tier-1 scope | Tier 2 topology pure math | runtime-only failures (never claimable offline) | Medium |
| Testing | launch, capture, verify | **~50%** — Test launch + companion capture | ~80% | automated in-game verification loops | High |
| Distribution | export mrpack/CF zip, share | **~60%** — exports work, no publish | ~80% | publishing/curation integrations | Low–Medium |

**Honest read:** the roadmap can plausibly get "author a pack without code" to ~75–80% of
realistic authoring work by the P3 horizon, with recipes/quests/configs near-complete and
behaviors the long tail. Worldgen authoring is the least tractable and should be the last
frontier — it is where the cost-per-nocode-point is highest.

---

## 7. Modpack Model proposal

### 7.1 The question

The long-term opportunity is a **unified modpack authoring model**: items, blocks, entities,
fluids, materials, tags, recipes, loot, quests, tasks, rewards, progression stages,
worldgen, behaviors, configs, assets, and their relationships (crafted-by, used-by, belongs-
to, appears-in, required-by, gated-by). Should ModCanvas build one?

### 7.2 What already exists (the audit answer)

There is **no unified model** — and yet the pieces of one are already scattered through the
codebase as *indexes*:

- **Item registry** — `scan_instance_items_cmd` (`indexer/mod.rs:147`) → per-mod items.
  **Companion-authoritative since s59:** the game's `BuiltInRegistries.ITEM` dump
  (`save_item_registry_cmd`, cache v4) is the source; `scan_instance_items` is
  cache-or-empty. The legacy lang-key scan is parked (see pack-health.md "Item-existence
  findings" for trust semantics).
  **UI-label filtering hardened (s44):** lang keys like `item.canUse.unknown`, `item.modifiers.*`,
  and the no-path labels (`item.color`, `item.disabled`) are vanilla UI strings, not items —
  the pre-s44 parser emitted `canUse:unknown` (mod_id `canUse`) into the registry (caught by the
  Pack Index probe on the real client jar). `is_real_item_key` (`indexer/jar.rs`) now requires
  `item.<ns>.<path>` with a non-UI namespace, verified against the vanilla 1.21.1 client lang.
- **Tag index** — `resolve_item_tags_cmd` / `list_item_tags_cmd` (`instance_textures/tags.rs`)
- **Texture descriptor index** — `scan_instance_textures_cmd` (`instance_textures.rs:267`)
- **Recipe scan cache** — `scan_pack_recipes_cmd` (`recipes/mod.rs:85`)
- **Quest graph** — `get_quest_graph` (`quest_graph.rs:18`), persisted `.modcanvas/quests.json`
- **Mod inventory** — `get_project_mods` (`project.rs:258`) + `db.rs` `mods` table
- **Config inventory** — `list_config_files` (`config.rs:84`)
- **Pack Health's input set** — already reads quest graph + item registry + recipe store
  (`core/pack-health/index.ts:77`)

These are exactly the "important objects" of the model, already keyed and already derived
from the instance. What is missing is **the spine**: stable IDs, back-references, and a
consumption API that lets any editor (and Pack Health) answer "what references X?" and
"what does X reference?"

### 7.3 The decision: a derived Pack Index, not a monolithic model

**Do not build a unified authoring model as a single graph that editors write through.**
That is a rewrite: every editor's save path, every IPC payload, every import/export
serializer would have to route through it, and it would violate the project's own
determinism discipline (a write-through model is shared mutable state — the exact thing the
3-layer rule and the "pure function of materialized state" rule exist to prevent).

**Instead, the Pack Index is a derived, read-mostly reference spine:**

```
instance scans ──► (item registry, tag index, texture index, recipe cache)
                          │
                    Pack Index (read-mostly, keyed by stable IDs)
                          │
        ┌──────────────┬──┴───────┬───────────────┐
   Pack Health   cross-editor    wizard       progression
   (already)     linking         validity     topology (Tier 2)
```

Properties:

- **Derived, never authoritative.** The editors remain the source of truth for their own
  content. The index is rebuilt from scans and caches, deterministically.
- **Stable ID forms** — reuse the ones that already exist: item IDs, `#tag` references,
  `jar:<path>!<zip>` descriptors, mod IDs (`project_id, mod_id` DB key), chapter/quest IDs.
  The curriculum's "maps & key contracts" lesson applies: one canonical key per store, one
  owner, silent misses are the failure class to design against.
- **Back-references as a service**: "recipes using this item", "quests rewarding this
  item", "tags containing this item", "progression gating this recipe". Built by *inverted
  indexes* over the existing scans — no new scanning of the instance required.
- **Consumed by**: Pack Health (reference integrity becomes cross-domain: quest → item →
  recipe → tag chains), the recipe/quest editors (click item → see all references), the
  wizard (validity of scaffolded content), and progression topology.

### 7.4 Entities the index should eventually carry

Phase in, never all at once:

1. **Items, tags, mods, recipes, quests** (all exist today as separate indexes) — first
   spine: item ↔ recipe ↔ quest ↔ tag with back-references. P1.
2. **Loot tables** — scanned from `data/*/loot_table(s)/*.json` (a scan, like recipes).
   P2.
3. **Advancements** — needed by progression gating and quest advancement tasks. P2.
4. **Worldgen** (features, structures, biomes, dimensions) — scanned, *read-only*, never
   edited through the index. P3.
5. **Behaviors** — as they become authorable (§11), the index stores the "what does this
   reference" side. P2+.

### 7.5 Introduction path (no rewrite)

1. Define the Pack Index **schema as an internal Rust type** (`models.rs`-adjacent) fed by
   the existing scan caches — no new I/O on load.
2. Expose a **`get_pack_index` command** (batched, like `get_texture_files`) that returns
   slices by domain.
3. Land the **first consumer**: Pack Health Tier 2 progression topology is *pure graph
   math over the index* — zero risk, immediate veteran value.
4. Land **cross-editor linking**: "where is this used" in the recipe editor and item picker.
5. Then the wizard and behaviors consume it.

---

## 8. Cross-system integration strategy

### 8.1 Existing integration points (working today)

- **Pack Health ↔ quest graph, item registry, recipe store, pack metadata** — the only
  cross-domain consumer (`core/pack-health/index.ts:77`).
- **Smart-filter registries ↔ tag index** — `smart-filter-mods.ts` / `smart-filter-tags.ts`
  resolve DSL members against local registries + `resolve_item_tags_cmd`.
- **Recipe editor ↔ item/texture indexes** — `useInstanceTextures.ts`, `texture-loader.ts`.
- **Quest editor ↔ item registry + engine renders** — icons and `bake:` resolution
  (`useQuestAssetPipeline.ts`).
- **Companion ↔ WS hub ↔ frontend** — live runtime truth for textures/renders.

### 8.2 Missing integration points (the roadmap's connective tissue)

| Gap | From → To | Roadmap home |
|---|---|---|
| Item references across editors | item → recipes/quests/loot that use it | Pack Index back-references (P1-PACKINDEX) |
| Quest → recipe → item chain | Pack Health checks cross the chain, not just one hop | Pack Index + Tier 2 (P1-HEALTH-2) |
| Config ↔ mod ownership | which mod owns which config file; which setting breaks what | Config recommendations (P2-CONFIG) |
| Progression ↔ quests | campaign-level staging above chapter level | Progression topology (P1-HEALTH-2) + campaign surface (P2-PROGRESSION) |
| Wizard ↔ everything | scaffold validity + green check | Wizard consumes Pack Health + Pack Index (P0-WIZARD) |
| Behaviors ↔ quests/recipes/items | behavior references resolve like any other content | Behavior IR consumes the index (P2-BEHAVIOR) |
| Loot ↔ recipes ↔ items | drop-based progression loops | Loot editor (P3-LOOT) |

### 8.3 Architectural risks in the integration

1. **Key drift** — the classic failure class in this repo (the `238222` vs
   `curseforge:238222` lesson, s33's base62-id sort bug). Every integration point must
   state its canonical key and its owner, and the integrity suite should gain a
   **reference-integrity check over the Pack Index** (every reference resolves or is
   reported dead — the "never silently miss" rule, at repo scale).
2. **Health losing its purity** — Pack Health must stay a pure function of materialized
   state. The Pack Index must be materialized *before* health runs, on the same load path,
   never fetched on-demand inside a health recompute.
3. **Cross-editor mutation storms** — editors remain authoritative for their own content;
   the index never writes back. If a future feature needs write-through (e.g. bulk rename
   of an item ID across recipes), it must be a **bounded, user-initiated migration
   operation**, not a background writer.
4. **Undo boundaries** — history is per-project and journal-based (`core/history/store.ts`).
   Any new editor (behavior, loot) must route through the same `HistoryStore`, not its own
   stacks (the recipe store's private undo/redo — `core/recipe/recipe-store.ts:70-72` — is
   the anti-pattern to avoid duplicating).

### 8.4 Migration strategy

Incremental only. Each integration ships with (a) a documented key contract, (b) tests for
reference resolution and silent-miss detection, (c) a Pack Health check that would have
caught the pre-integration bug. No big-bang migrations; the `.modcanvas/quests.json`
working-state pattern (private, disposable) extends to any new working state the index or
behaviors need.

---

## 9. Beginner workflow

### 9.1 The target path

```
New User
   ↓
Create Pack (wizard: instance pick → "what's your pack about?" → template)
   ↓
Add Mods (curated picks, pre-checked defaults)
   ↓
Customize (guided first quest → mini-wizards for more)
   ↓
Health (persistent go/no-go; green check = ready to test)
   ↓
Launch (Test → Prism, companion attached)
   ↓
Fix Problems (health findings + crash path)
   ↓
Export (mrpack/CF zip) → Playable Modpack
```

### 9.2 Where the workflow breaks today (verified)

| Step | Status | Breakage |
|---|---|---|
| Create Pack | **StartChooser + wizard shipped (P0-WIZARD chunks 1–3; s49 reshape):** four-card start (intro / IDE tour / blank / load), name your pack (auto-creates a Prism instance), curated mod picks, **green check + Launch** + guided first quest **moved to the live surface** (s53 — Beginner Mode banner on first companion connect; the pre-launch wizard step was removed). Blank starts skip the post-create steps and land straight in the IDE. Scaffold refuses instances that already have a quest book (no clobber) | User can now reach a scaffolded, coherent pack in one flow |
| Add Mods | Full search works (`ModsTab.tsx`) but no curated picks, no "these go together" defaults | User must know mod names to search |
| Customize | Full editors exist; zero guidance; raw surfaces visible (KubeJS drawer, raw config) | First-time user faces an IDE |
| Health | Tier 1 works, always visible | No wizard-driven green-check moment |
| Launch | Test works (`test_project`, `minecraft/launch.rs`); companion deploy works (NeoForge only) | "Launch your pack" is buried in a veteran-shaped toolbar |
| Export | mrpack + CF zip exist; **CF export drops Modrinth mods** (`imports/curseforge/export.rs`) | A first-timer's export can be silently incomplete |
| Error recovery | No crash-help path; no log-deciphering (by design, no AI) | "It crashed after GO" has no in-app response |

### 9.3 First-Pack wizard (P0-WIZARD) — implementable spec

Per `PROJECT_BIBLE.md:258-269`, made concrete against today's code:

1. **Instance** — reuse `list_prism_instances` (`commands/mod.rs:243-284`) + instance
   root discovery (`minecraft/instances.rs`). Offer existing instances or browse-for-folder.
   ~~Never create instances (out of scope, Bible §10.2)~~ **OVERRIDDEN 2026-08-10** (maintainer
   decision): the wizard now creates instances. Fix the **1.19.2/Quilt adapter lie**
   in the same pass (P0-HYGIENE-1). **Status (P0-WIZARD chunks 2–4):** the wizard lists
   `list_mc_instances` (full metadata — version, loader, game_dir, status) and derives the
   project's version/loader/path from the pick, so no technical question is asked; running
   and unparseable instances are excluded; the classic 3-field form lives inside as "start
   from scratch"; a **"Create a new instance"** card builds a fresh Prism instance for the
   pack —    one combo (MC 1.21.1 · NeoForge), loader version auto-resolved from **Prism's own
   index** (`meta.prismlauncher.org/v1/net.neoforged/` — the set Prism can actually
    serve; the raw Maven list contains retracted builds Prism never indexes, and
    Maven-latest races Prism's index into "could not download metadata" launch
    failures; `commands/modpack/loader_version.rs`; the mmc-pack generator's "0.0.0"
    fallback is never reached — unresolved = loud failure). The resolver skips
    versions inside a 24h settling window and verifies the chosen component serves,
    so the wizard never pins a just-released loader whose files are still
    propagating through Prism's CDN/caches (21.1.248 failed this way an hour after
    release, 2026-08-10). Instance created at the commit
   point, game downloads on Prism's first launch (auto-install; verify in the journey
   test). More combos unlock by extending the resolver + the card — never before. The
   adapter lie is already fixed (`servedMatrix`). Browse-for-folder
   deferred (written reason: `import_instance_folder` covers it; every extra step is
   surface a first-timer can trip on — revisit when a user asks). **s49 reshape:** the
   where-picker is GONE — the wizard no longer lists instances or offers
   instance/scratch/new modes. Every wizard start auto-creates a fresh Prism instance
   (the "create a new instance" card became the only path; the resolver detail above is
   unchanged and load-bearing). `WizardWhereStep.tsx` + `scratch-form.tsx` were deleted;
   `list_mc_instances` remains for `restart-instance` + the connection pill.
2. **"What's your pack about?"** — one plain-language question (vibe, not mod list). The
   answer selects a **template pack**. **Status (s49):** this decision moved OUT of the
   wizard into the four-card **`StartChooser`** (intro / IDE tour / blank / load) at the
   launcher's New Pack entry — a user choice on every project start, never first-run
   detection. The wizard receives the picked template as a preset and no longer offers a
   template step; blank starts skip the post-create steps and land straight in the IDE.
3. **Template** — a content skeleton: starter quest chapter(s), a handful of coherent
   starter recipes, a config profile. Templates are **real content files shipped in the
   bundle** (self-authored JSON/SNBT — not game assets, so the no-bundling rule is
   unaffected) scaffolded into the instance on create. First template: "Skyblock-ish",
   "Exploration", "Tech intro" — keep the set small (2–3) and coherent-by-default
   (Bible §10.3: "probably a bad pack" is a win). **Status (P0-WIZARD chunks 1–2; s49):**
   the scaffold path is implemented — `create_project` takes an optional `template_id`,
   template packages are embedded in the Rust binary (`src-tauri/templates/`, format in
   `docs/templates.md`), and two templates ship with fidelity tests: `intro` (6-quest
   core loop + Shed the Guide, lands in Beginner Mode) and `ide-tour` (21-quest feature
   walkthrough with a 10-quest teaching spine + ten side branches + Shed the Guide;
   health quest converges all content branches; 3 example behaviors). The four-card
   `StartChooser` (chunk 2/3) lets the user pick which to start with.
 4. **Curated mod picks (optional)** — a short "these go well together" list with defaults
    pre-checked. **Not** a 10k-item browser (Bible §10.2 step 4). Needs a small, maintained curation
    file (mod IDs + one-line "why this").     **Status (chunk 3; s53 PRISM-LEAN):** implemented — `list_curated_mods` (`commands/modpack/curated.rs`)
    serves the list filtered per pack by loader/version (trust rule: unknown support = kept,
    not dropped). Two **core** picks back ModCanvas's own features — FTB Quests (the quest
    book, CurseForge-only, id 289412) and KubeJS (recipe scripts, Modrinth, all loaders) —
    and render in their own "Needed by ModCanvas" section. **Execution splits on
    registry (s54):** Modrinth picks install in-app with one click
    (`install_modrinth_mod` — keyless, the honest one-click); CurseForge picks
    (FTB Quests) hand off via "Open Prism to install these"
    (`prismlauncher --show <instanceId>`) — Prism resolves versions AND the CF
    dependencies ModCanvas cannot parse, and the step's guide names FTB
    Quests' three required deps (FTB Library, FTB Teams, Architectury). The
    step closes its own dep loop (s54-A): after a Modrinth install it runs the
    compat check and offers missing required deps (e.g. KubeJS → Rhino) with
    the same one-click, inline — the fix appears where the friction happened,
    not in the Mods tab. The old dual-source search surface is deleted (chunk
    2, s54). Non-instance packs fall back to manual project-page links.
    Continue refreshes the pack so the green check sees Prism-installed mods.
    (Dep-gating the green check itself is booked as roadmap §0 row 7.)
 5. **Guided first quest** — "pick an item → pick a goal → wizard writes the quest" through the
    **same quest editor** (mini-wizard, §9.5), emitted as real SNBT via the existing
    export path. The zero-code proof point. **MOVED TO THE LIVE SURFACE (s53):** the wizard
    no longer hosts the step — calling it before the instance has ever run handed the user
    an empty item picker (no game data = no registry). The teaching moment now happens when
    the companion connects in **Beginner Mode**: a one-time-per-session banner in the quest
    editor ("Your pack is running — add a quest and watch it change in-game") opens the
    same mini-wizard, where the picker is full (game downloaded → real registry + textures)
    and hotswap is on display. The `✨ Add a quest` toolbar button remains for everyone.
    The external handoff (close wizard → switch tab → open modal) was removed with the step.
 6. **The green check + Launch** — run Pack Health's `analyzePackHealth` over the scaffolded
    pack; show blocking/recommended; one button: **Launch** (reuse `test_project`).
    **Status (chunk 3; s49 + s53):** implemented — the wizard's step 3 (renumbered when the
    where-picker was removed, s49; renumbered again when the guided-quest step moved to the
    live surface, s53) computes the same pure report
    the Health tab renders (from the already-materialized stores, no rescans) and offers
    Launch via `test_project` with the same defaults as the topbar Test button. Every
    pack now has a Prism instance (s49: the wizard auto-creates one; scratch mode was
    deleted), so Launch is always available — the old "launch hidden for scratch packs"
    rule and the parked "link a scratch pack to an instance" entry are obsolete.
    **The core-mod gate (s53):** the report now carries a **Mods** section —
    `checkCoreMods` (`core/pack-health/checks/mods.ts`) verifies ModCanvas's own
    dependencies (FTB Quests + KubeJS) against the scanned mods/ jar names riding the
    ingest result (null = no mods dir = silent, Trust Rule). Missing core mods are
    **blocking** and Launch is disabled until they land — "ready to test" must not bless a
    pack whose quest book cannot appear in-game (the wedge gap observed live 2026-08-13:
    the wizard launched a pack with no FTB Quests). Blocking findings render inline with
    the fix hint (install from Prism, then continue — Continue refreshes the pack and the
    gate re-evaluates).

Completion criteria (P0-WIZARD): a fresh-eyes tester completes steps 1–6 on 1.21.1/NeoForge
without opening a code file, a raw config, or the KubeJS drawer; the wizard is restartable
at any step; every scaffolded artifact is diff-able plain text.

**Journey test status (s42):** the fresh-eyes completion pass has been *partially* run by
the maintainer (wizard → pack → mini-wizards; steps 1–5 of 6) and was interrupted by the
pre-first-launch "no config files" dead-end (now resolved: empty states name the launch-once
fact). **PARKED until the P2-HOTSWAP prototype + its mini-wizard exist** — written reason:
the launch/capture leg (step 6) is exactly the surface hotswap reshapes (reload evidence
loop, reload-vs-restart honesty), so the full fresh-eyes pass runs once, against the final
shape, instead of twice. **Tripwire:** run the full 6-step pass in the P2-HOTSWAP landing
review, before any further P0/P2 item is declared done.

### 9.4 Beginner Mode (P0-BEGINNER)

- A mode flag on the workspace shell (`ProjectWorkspace.tsx`) that **hides raw/code
  surfaces**: KubeJS drawer, raw config textarea, script drawer, the recipes tab's script
  preview. **Status (s47):** hiding shipped. The original spec's "shows simplified forms
  instead (configs as preset forms, §5.3)" was never built — **PARKED with written reason**
  (s53): preset forms are a separate surface simplification; the coach strip is the guidance.
- **The hint strip (s53)** — a persistent coach above the workspace tabs, visible in
  Beginner Mode: the wedge journey (follow the guide → save → fix what Pack Health found →
  launch), states derived from real signals (Pack Health report, connection pill), the guide
  step never claiming quest completion. Reference: `docs/beginner-mode.md`.
- **Onboarding turns it ON for first-timers; it is off by default for everyone else**
  (Bible §11). One obvious control to flip both ways (a topbar toggle).
- Under the hood: a `useBeginnerMode` flag persisted in the DB `settings` table
  (`db.rs:75`), with per-surface visibility driven by the flag. The editors themselves are
  untouched — the same editor code renders with fewer surfaces. This is why mini-wizards
  "run through the same editor": no parallel generation paths (Bible §10.4).

### 9.5 Mini-wizards (P0-MINIWIZ)

Thin, task-scoped guides over the existing editors. First three:

1. **"Add a quest"** — pick an item → pick a goal (collect/craft) → wizard fills the
   quest node (title, task, reward) in the quest editor, visible and editable immediately.
   **Implemented (s41):** `GuidedQuestWizard.tsx` collects the spec; the editor commits it
   through `commitGraph` + history (undoable in one step) via the same path as every other
   edit — no parallel generation. Goals are item-family only (item_acquisition/craft) for
   now; kill/reach/XP are future additions to the same component.
2. **"Add a recipe"** — the wizard reads the item picker, fills the grid, validates via
   `core/recipe/validation.ts:94`, saves through the normal authored-only path.
   **Implemented (s41):** `GuidedRecipeWizard.tsx` — pick the output → set the count +
   pick ingredients (up to 9, each with a count) → review + create. Builds a shapeless
   recipe through the editor's own `addRecipe` store path (undoable, saves via
   `useRecipeSave`); live validation via `validateRecipe` blocks create on errors.
   A "✨ Add a recipe" button sits in the recipe editor header.
3. **"Add a config tweak"** — search a setting by plain words, present it as a typed form,
   save through `save_structured_config`. **Implemented (s41):** `GuidedConfigWizard.tsx` —
   pick a config file → search a setting by plain words (the editor's own
   `matchesQuery` semantics, via `findMatchingPaths`) → edit its value as a typed form
   (reuses the config field editors) → Apply routes through the editor's own
   `updateConfigValue` + `saveConfigFile` (history + `save_structured_config`). The wizard
   never parses files itself — it searches the already-open parsed tree. A "✨ Add a tweak"
   button sits in the configs tab sidebar.
   **Honesty surfaces (s42):** step 1 only lists files the parser can actually structure
   (extension-derived: toml/json/yaml/properties) — quest .snbt, kubejs .js, crafttweaker
   .zs and Forge .cfg parse to a single raw string and are named as raw-only instead of
   dead-ending with "No settings match". A file that fails to parse (opens in Raw mode)
   gets the same explanation on step 2. Opening such a file in the configs tab now defaults
   to Raw mode — a leaf-string root has no fields to structure. Fixed alongside: a React
   hooks violation (useState after the `if (!open) return null`) crashed the whole configs
   panel on every wizard open/close ("Rendered more hooks than during the previous
   render" → ErrorBoundary).

Each is a modal/side-panel that **operates the same editor state and routes through the
global HistoryStore** — so the user can undo the wizard and see exactly what it made
(Bible §10.4: "the mini-wizard is a teacher; the editor is the classroom").

**PARKED (s48, written reason) — the guided-tour driver.** The tutorial quests are
inert: they teach surfaces *by name*, but selecting a tutorial quest doesn't open its
tab or launch its mini-wizard. A driver (quest-id → destination map + a hint strip in
Beginner Mode + tab-switch wiring) was scoped and deliberately parked: Chunk 1 (content
coverage — the 20-quest tour now spans every feature) and Chunk 2 (first-boot routing)
shipped first, and the remaining plumbing (switching the workspace tab from inside the
quest editor) is the rat's-nest risk. **Tripwire:** revisit when a fresh-eyes user test
shows quests-by-name aren't enough, or when the dogfood item (authoring template content
*using* the mini-wizards) gets scheduled. *(s49: first-boot routing was REMOVED — the
onboarding entry point is now a user-choice four-card start, so any future driver hooks
the choice cards, not a first-run flag.)* *(s53: the **hint strip chunk shipped** — the
Beginner Mode coach (`docs/beginner-mode.md`) under the s52 REDESIGN ruling; the driver's
remaining direction — quest editor → workspace tab wiring — stays parked on the same
tripwire.)*

---

## 10. Pack Health strategy

### 10.1 What is shipped (Tier 1, verified)

`core/pack-health/index.ts:77` `analyzePackHealth` — a pure function over materialized
state: quest graph, item registry, recipe store, pack metadata, cover image. Three honest
states (Blocking / Recommended / Optional), severity badges, item-coverage %, quest cycle
detection, undefined reward tables, empty chapters, unreachable quests, unused reward
tables, missing-item references (gated on registry trust thresholds), authored-recipe
validation, pack-info/cover/zero-chapter recommendations. UI: `PackHealthTab.tsx:80`.

### 10.2 Tier 2 — Progression topology (P1-HEALTH-2)

Pure graph math over the quest graph + Pack Index — explicitly quarantined out of Tier 1
(`docs/pack-health.md:92-93`) and now the natural next step:

- **Bottlenecks** — quests whose completion gates a disproportionate share of the graph.
- **Walls** — progression stages reachable only through one quest.
- **Chain lengths** — longest quest chains (pacing).
- **Unreachable/uncompletable detection** — quests with unsatisfiable task requirements
  given the pack's items/recipes (this is where the Pack Index earns its keep: quest task
  → item → recipe availability chain).

No opinion labels — "bottleneck" is a measurement, not a judgment. Truthful, screenshotable,
consistent with the Trust Rule (§9.3 of the Bible).

### 10.3 Tier 3 — Flavor analytics: quarantined, with a written reason

Mod-type percentages and difficulty estimates are **not** on the roadmap. The taxonomy
maintenance burden (CF/Modrinth tags are coarse and sometimes wrong) and player-subjectivity
are real costs the Bible already names (`PROJECT_BIBLE.md:244`). Revisit only after Tiers
1–2 have earned trust — and label everything as an estimate.

### 10.4 Architecture rules (non-negotiable, from `PROJECT_BIBLE.md:235-238`)

- Pure function of materialized state. No on-demand rescans on the health path.
- Never put fuzzy analytics on the fast path.
- **New rule from this audit:** the Pack Index must be materialized before health runs
  (§8.3.2) — health's input set grows, its purity does not.

### 10.5 Ownership boundary: Rust vs TS

Today, health is 100% frontend TS; Rust has only `analyze_quest_graph`
(`quest/analysis.rs:20`) which the frontend doesn't call, and cycle detection in
`core/validation/quest-validator.ts`. **Decision:** keep health in the frontend for
Tier-1/2 (it consumes frontend-side editor state — that's where the data lives), and move
analysis into Rust **only when a check needs data the frontend doesn't hold** (e.g. deep
SNBT/script parsing for behavior validation). State this boundary in the docs so the
duplication risk (`quest/analysis.rs` vs `core/pack-health/checks/quests.ts`) is a decision,
not drift.

---

## 11. Behavior system proposal

### 11.1 The constrained model

**Do not design a generic visual programming language.** Modpack behaviors are mostly
short, straight-line "when X, if Y, do Z" rules. A constraint model with a fixed vocabulary
covers the realistic cases and stays learnable:

```text
Trigger  (when)  →  Conditions  (if)  →  Actions  (then)
```

- **Triggers (MVP):** player joins / leaves dimension, player takes damage, player kills
  entity, item crafted / picked up, block placed / broken, advancement completed, quest
  completed, timed (after N ticks / on a schedule), world spawn.
- **Conditions (MVP):** item held / in inventory, entity type, dimension, biome, quest
  state, progression stage, numeric comparison (health, score, time), random chance.
- **Actions (MVP):** give / remove items, spawn entity, damage / heal, teleport, run
  command, play sound, set quest state, unlock progression stage, toast/message.

Scope discipline: the **initial action library is small and curated** (10–15 actions).
Anything outside the vocabulary is a "raw command" escape hatch, visibly labeled — the
veteran's release valve, not the beginner's trap.

### 11.2 Backend compilation strategy

```text
Behavior (visual)
   ↓
Behavior IR (typed, serializable, persisted as ModCanvas private state)
   ↓
Backend compiler
   ├── Datapack (advancement-based triggers, loot conditions)   ← P2
   ├── KubeJS (event-driven triggers/actions)                   ← P2
   ├── CraftTweaker (event triggers)                            ← later
   └── Companion runtime (in-game runtime hooks)                ← later
```

- The **IR is a plain typed model** (`models.rs`-style), versioned, private to the app —
  the output is always real `.js` / datapack JSON. No lock-in: delete ModCanvas, the
  generated scripts remain valid ecosystem artifacts.
- **KubeJS first** (the project already ships a KubeJS script generator —
  `scriptgen/kubejs.rs` — and a comment-preserving writer path). Datapack second (advancement
  triggers + loot conditions are the most stable vanilla surface). CraftTweaker and
  companion-runtime backends are later-phase, driven by demand.
- **Validation story:** behaviors compile to scripts; the compiler emits deterministic
  warnings (unknown item ID, unreachable trigger). Reference validation against the Pack
  Index (§7) is the same machinery as Pack Health — a behavior referencing a missing item
  is a health finding. **Severity deviation (s45):** the earlier "Blocking health finding"
  wording is superseded — behavior item findings are RECOMMENDED, never blocking, per the
  Trust Rule (Project Bible §4): the scanned item registry cannot prove an item is absent
  (custom/KubeJS/data-driven items are outside the jar scan; imported packs have no
  vanilla jar), and a blocking verdict on `kubejs:custom_item` would false-GO-block a
  released pack. Behaviors follow the quest rule exactly (`checks/quests/items.ts`).

### 11.3 MVP scope vs later

| Capability | Phase |
|---|---|
| Visual editor (trigger/condition/action cards) | P2 |
| KubeJS + datapack backends | P2 |
| Pack Index reference validation | P2 |
| Loot-on-kill / advancement gating examples shipped in templates | P2 |
| Custom triggers (user-defined events) | P3 |
| CraftTweaker backend | P3 |
| Companion runtime backend (real-time in-game behaviors) | P3 / Future |
| Visual scripting beyond the constraint model (loops, variables, arbitrary logic) | **Never** — explicitly out of scope |

### 11.4 Why not earlier than P2

Behaviors are the **hardest no-code problem** (highest complexity, highest risk of
generating broken code). They must land on top of: the beginner wedge (P0), the Pack Index
(P1, for reference validation), and a stable scriptgen path. Building the behavior system
before the wedge ships would starve the one thing that makes the product *coherent for the
beginner* — the guided path to first launch. This is a deliberate "boring foundational work
outranks exciting features" ordering.

---

## 12. Mixin / backend strategy

### 12.1 Verdict

**Mixin editing is not a user feature.** It is an internal implementation backend for
behaviors that the ecosystem cannot express as scripts or datapacks.

Rationale:

- The user-facing abstraction is "**when X happens, under condition Y, perform Z**" — the
  §11 model. Which backend produces it is an implementation detail.
- Scripts (KubeJS) and datapacks cover the overwhelming majority of realistic modpack
  behaviors — the things people actually want (loot, gating, commands, stage unlocks).
- Mixins are where the hard cases live: modifying mod *class behavior* (e.g. changing a mod
  mechanic), performance-critical hooks, features with no event API. That is the long tail,
  and the tail is where bugs are expensive: a generated Mixin that conflicts with another
  mod's Mixin is a runtime-only failure — it **cannot** be validated offline, which collides
  with the Trust Rule.
- Building a no-code Mixin editor means maintaining a Java/Mixin code generator, a version
  matrix over NeoForge/Forge/Fabric Mixin APIs, and a runtime validation story — very high
  complexity, low beginner value.

**Consequence:** the §11 architecture keeps "Mixin" as a fourth backend slot in the
compiler diagram, explicitly **empty for the foreseeable future**, with a written entry
criterion: *"consider a Mixin backend only when (a) a concrete, high-demand behavior is
impossible in KubeJS/datapack, and (b) the offline validation story for generated Mixins is
solved."* Until both hold, the slot stays closed. This is the "do not force Mixins into the
product" conclusion, made explicit so a future enthusiastic agent doesn't reopen it by
default.

---

## 13. Detailed prioritized roadmap

Conventions:

- **P0** = required for the core product (the MVP exit criterion). **P1** = high-value
  expansion. **P2** = important advanced. **P3** = long-term/high-complexity.
- **Class:** Existing / Harden / Expand / Integrate / New / Investigate.
- **Completion criteria are falsifiable** — a future coding agent knows when the item is
  actually done.

### P0 — The beginner wedge + hygiene floor

#### P0-WIZARD — First-Pack wizard

- **Class:** New (nothing exists; `modals.tsx:33-82` is a 3-field form).
- **Goal:** a person with zero modpack experience creates and launches a playable pack
  without seeing code (Bible MVP exit criterion).
- **Features:** §9.3 steps 1–6: instance pick, "about" question, template scaffold,
  curated mod picks, guided first quest, green check + Launch.
- **Technical work:** ~~`createProject` gains a scaffold path~~ **DONE (chunk 1)**: `create_project` takes `template_id: Option<String>`, scaffolded via `crate::templates::scaffold_template` (atomic, path-safe, tested; see `docs/templates.md`). Remaining: a `WizardStepper` component over `useProjectState.ts`; curated-mod file; wizard → `analyzePackHealth` handoff; reuse
  `test_project` for Launch. The adapter lie is fixed (options derive from `servedMatrix`).
- **Dependencies:** none (P0 foundation). Templates must respect the no-bundling rule
  (self-authored content only).
- **User value:** the wedge. Nothing else matters until a beginner can get to Launch.
- **Complexity:** Medium.
- **Risk:** UX risk (untestable by the author — needs fresh-eyes testers, Bible risk 1);
  template content quality (coherency defaults).
- **No-code impact:** converts "must learn KubeJS" → "answers 2 questions." The entire
  beginner path hinges on it.
- **Completion criteria:** fresh-eyes tester completes the full path on 1.21.1/NeoForge
  with zero code touched; wizard restartable at any step; scaffolded pack passes Pack
  Health with no Blocking findings; Launch starts the game with the companion attached;
  every scaffold artifact is plain text diff-able.

#### P0-BEGINNER — Beginner Mode

- **Class:** New.
- **Goal:** hide raw/code surfaces from first-timers; one obvious toggle (Bible §11).
- **Features:** mode flag in `settings` table (`db.rs:75`); surface-visibility rules
  (KubeJS drawer, raw config, script preview hidden); configs as preset forms; onboarding
  turns it ON for first-timers, OFF by default for returning users.
- **Technical work:** `useBeginnerMode` hook + `ProjectWorkspace.tsx` gating; config
  preset forms (thin layer over `config-editor.tsx`, driven by a small preset schema).
- **Dependencies:** P0-WIZARD (onboarding writes the flag).
- **User value:** the difference between "IDE" and "app that made my pack."
- **Complexity:** Low–Medium.
- **Risk:** surface-hiding confusion if the toggle is hard to find — make it prominent.
- **No-code impact:** removes the last code-shaped surfaces a beginner can trip on.
- **Completion criteria:** a fresh-eyes tester never sees a code file, raw textarea, or
  script drawer in default mode; the toggle is reachable from the topbar; mode persists
  across restarts.
- **Status (s47): COMPLETE — the P0 gate is closed.** `beginner_mode` flag in the
  app-scoped settings table (`get_app_setting`/`set_app_setting` commands, `db/settings.rs`);
  `useBeginnerMode` hook (null until read, persisted toggle with honest-state revert);
  prominent topbar toggle; Raw config mode + script preview hidden (forced structured /
  toggle not offered);   onboarding (wizard Done) turns it ON for first-timers, OFF default
  for returning users. Reference: `docs/beginner-mode.md`.

#### P0-MINIWIZ — Mini-wizards (first three)

- **Class:** New (thin overlays on Existing editors).
- **Features:** "Add a quest", "Add a recipe", "Add a config tweak" — each operating the
  same editor state, undoable via the global `HistoryStore`.
- **Technical work:** wizard panels over `useQuestNodeMutations.ts`, the recipe store's
  save path, and `save_structured_config`; all routed through history.
- **Dependencies:** P0-WIZARD template content can be authored *using* the mini-wizards
  (dogfooding).
- **Complexity:** Low–Medium.
- **No-code impact:** the "teacher" layer that makes the editors approachable.
- **Completion criteria:** each wizard produces content visible in the same editor,
  undoable in one step, and byte-identical to what the veteran's manual path produces.
- **Status (s41–s42): COMPLETE.** `GuidedQuestWizard.tsx` (spec → `commitGraph` + history,
  undoable one step), `GuidedRecipeWizard.tsx` (output → grid → review; the recipe store's
  own `addRecipe` path, undoable, saves via `useRecipeSave`), `GuidedConfigWizard.tsx`
  (search → typed form → `updateConfigValue` + `saveConfigFile`; s42 honesty surfaces:
  extension-derived structured list, raw-only naming, no dead-ends). Each operates the same
  editor state — completion criteria met by construction (no parallel generation).
  **Residual:** quest goals are item-family only (kill/reach/XP are future additions to the
  same component, §9.5); the dogfood dependency (authoring template content *using* the
  mini-wizards, listed above) is open. Reference: §9.5.

#### P0-LAUNCH — First-launch hardening

- **Class:** Harden (Existing: `test_project`, `minecraft/launch.rs`, companion deploy).
- **Goal:** the beginner's "Launch" works first time, and the companion is verified present
  before the game boots.
- **Features:** pre-launch companion-version check (deploy → md5-verify like the s14
  lesson); instance-status feedback during launch (already partial:
  `useLaunchState.ts`); failure messages with Copy buttons (Trust Rule, Bible §4.5).
- **Complexity:** Medium. **Risk:** runtime-only failures the app cannot validate — honest
  messaging is the mitigation.
- **Completion criteria:** launch from a fresh wizard-created pack works; a missing/stale
  companion jar produces a *specific, actionable* message, never a silent failure.
- **PARKED SCOPE (s42, written reason):** the explicit "first launch materializes the pack"
  wizard step (state both payoffs — configs appear, 3D icons capture for offline use —
  then verify the run delivered via an evidence loop: companion connected / config dir
  grew / texture frames received) is deferred until P2-HOTSWAP builds the same
  log-evidence machinery. Building it once and reusing it for both is cheaper than two
  bespoke loops. **Tripwire:** revisit this parked scope in the P2-HOTSWAP landing pass.
  Texture capture stays **on-demand** (editor-driven materialization plan) — decided s42,
  no capture-all mode. The cheap non-step surface (configs-tab/wizard empty states naming
  "mods write configs on first launch") landed s42 instead.
- **Remaining scope is the P2-HOTSWAP ramp (s42):** the pre-launch companion md5 check and
  the "never a silent failure" messaging (incl. detecting the Prism-refusal signature —
  CLI exit 0 with no game process — from workarounds #8) are the first steps of the hotswap
  arc, not a separate item: you cannot test reloads on a launch/connection you cannot
  verify. Rolled into P2-HOTSWAP below.
- **Status (s44):** the rolled-in half shipped through the hotswap arc — pre-launch
  companion-version detection (`get_project_companion_status`, s4c) and never-silent-failure
  launch messaging (Prism-refusal signature, workaround #8, s44). The parked
  materialize-step's tripwire (P2-HOTSWAP landing) has FIRED; the step itself remains open —
  scope it or re-park with a fresh reason in a future pass.

#### P0-DISTRIB — Distribution, CI, release pipeline

- **Class:** New (Bible §8.1 item 5, risk 4).
- **Features:** CI running `cargo test` + `pnpm test` + `pnpm lint` + the integrity gate on
  every PR/commit; release artifacts (Linux .AppImage/deb; Windows + macOS when CI runners
  exist); a public home (README exists; release notes; license settled — GPL-3.0).
- **Technical work:** GitHub Actions (or equivalent) workflow mirroring the local dev loop;
  sign artifacts where feasible.
- **Complexity:** Medium. **Risk:** CI green ≠ local green (WebKitGTK differences) — keep
  the integrity gate as the source of truth and treat CI as a second witness.
- **Completion criteria:** a tagged commit produces downloadable artifacts; CI is the
  gatekeeper for the repo's "green" claim; a fresh machine can run the suite from
  `git clone`.
- **PARKED (s42, written reason):** deferred until the hotswap arc ships. No CI is not
  blocking anything local — the integrity gate is the repo's local truth and it runs
  everywhere; releasing artifacts mid-arc invites users before the flagship feature lands.
  **Tripwire:** revisit when P2-HOTSWAP lands or when a second machine needs the suite
  from a clone (then CI is the gatekeeper it claims to be).
  **TRIPWIRE FIRED (s44):** P2-HOTSWAP has landed — this park is due for revisit: scope CI
  as a real item or re-park with a fresh written reason.

#### P0-HYGIENE-1 — Dead code & lying UI

- **Class:** Harden/Cleanup.
- **Scope:** triage the 35 dead Rust commands (prune or park with a written reason — keep
  `launch_mc_instance`/runtime family as the *correct* future API; remove the per-node
  quest mutation dead ends); delete orphaned `components/canvas/**`,
  `services/graphConverters.ts`; resolve the `mod_metadata` dead schema (drop or wire);
  fix the 1.19.2/Quilt adapter lie in `NewProjectModal`; refresh `audit-2026-08-05.md`
  remaining-debt list; fix `workspace-actions.md:15` progression-tab staleness; restate
  `README.md:31` beginner status honestly.
- **Complexity:** Low (mechanical) but judgment-heavy (prune-vs-park per item).
- **Completion criteria:** `pnpm integrity` clean with no new debt; every dead command has
  a written prune/park decision recorded where the repo records debt; docs match the tree.
- **Status (s34–s36): COMPLETE.** Dead-command triage (24 pruned / 6 parked with written
  reasons), orphaned `components/canvas/**` + `graphConverters.ts` deleted, `mod_metadata`
  schema dropped, NewProjectModal options derived from the adapter registry
  (`served-matrix.ts`), integrity gate at 9 sections. Decisions recorded in
  `docs/audit-2026-08-10.md`; completion criteria met (integrity clean, no new debt).

#### P0-HYGIENE-2 — CurseForge export bug

- **Class:** Harden (real bug: `imports/curseforge/export.rs` collects Modrinth-sourced
  mods and never writes them into the zip).
- **Fix:** include non-CF mods in the overrides (download or reference-by-slug), or
  explicitly fail the export with a clear message — never silently drop.
- **Complexity:** Low–Medium. **Risk:** CF zip format expectations (slugs vs files) —
  verify against a real CF zip.
- **Completion criteria:** an export of a pack with mixed CF + Modrinth mods round-trips
  all mods; a regression test covers the mixed case; the CF exporter is doc-synced.
- **Status (s34): COMPLETE.** CF export now ships non-CF jars into `overrides/mods/`
  (path-safe) or fails loudly when the jar can't be located — never a silent drop;
  regression `mixed_export_ships_non_cf_jars_in_overrides_mods` covers the mixed case
  (`imports/curseforge_tests.rs`).

### P1 — Veteran depth + the Pack Index

#### P1-PACKINDEX — Pack Index spine

- **Class:** Integrate (New index over Existing scans).
- **Goal:** the derived reference spine (§7): items, tags, mods, recipes, quests keyed by
  stable IDs with back-references.
- **Features:** `get_pack_index` command (batched slices); inverted indexes (recipe→item,
  quest→item, quest→recipe, item→tag, tag→item); reference-resolution with explicit dead-
  reference reporting.
- **Technical work:** Rust model + build step on the existing load pipeline (after scans,
  before health); no new instance I/O.
- **Dependencies:** none. **Complexity:** Medium. **Risk:** key drift (the #1 failure
  class — mitigate with the canonical-key contract + integrity reference check, §8.3.1).
- **No-code impact:** the connective tissue that lets health, wizard, and editors answer
  cross-domain questions.
- **Completion criteria:** "where is this used" answers resolve in the recipe editor and
  item picker; a broken reference surfaces as a named finding, never a silent miss; index
  build is deterministic (same instance → same index).

#### P1-HEALTH-2 — Pack Health Tier 2: progression topology

- **Class:** Expand (Existing: `core/pack-health/`).
- **Features:** bottlenecks, walls, chain lengths, unreachable/uncompletable quest
  detection via the Pack Index (quest task → item → recipe availability).
- **Technical work:** pure graph math (`core/quest/progress.ts` + index); new check module
  `checks/topology.ts`; always behind the health recompute, never on the fast path.
- **Dependencies:** P1-PACKINDEX. **Complexity:** Medium. **Risk:** opinion creep —
  measurements only, no labels.
- **Completion criteria:** topology findings are deterministic and screenshotable; the
  veteran-facing "wall" readout is demonstrably correct on a real pack with a planted
  unreachable quest.
- **Status (s44):** topology measurements landed as `checks/topology.ts` (bottlenecks,
  walls, longest chains — pure graph math over edges, 11 tests). Wired into
  `analyzePackHealth` as `recommended` findings, behind the recompute (never fast path).
  Semantics verified by hand-computed tests: bottleneck = removal disconnects >50% of the
  graph; wall = removal strands ≥1 other quest (roots excluded — an entry point is not a
  gated stage); chains are cycle-safe (a cyclic quest graph terminates). The
  quest→item→recipe availability half is PARKED with a written reason: it needs the Pack
  Index consumer plumbing + the full objective model; the roadmap names it as the hard
  part, and the measurements here are provable from edges alone.

#### P1-PARITY — Close the remaining FTB parity gaps

- **Class:** Expand (§13 P1-PARITY open items).
- **Scope:** theme-file fidelity (`ftb_quests_theme.txt` parse → edge/panel/checkmark
  rendering — the biggest rendering gap); book icon picker / book
  default quest size / save-as-file; import/export hardening (layout choice, `min_width`/
  `invisible` alias unification, `chapter_groups.snbt`, quest `tags`); multi-page + inline
  image description editor.
- **Complexity:** Medium–High (theme-file fidelity is the hard one). **Risk:** in-game
  pixel parity is only verifiable in-game — use the existing screenshot-measure discipline.
- **Completion criteria:** each open §13 P1-PARITY item flips to ✅/🟢 with a doc-synced
  note; re-audit the parity rows against the tree.

#### P1-HYGIENE — Second hygiene pass

- **Class:** Harden. **Scope:** ws_ipc unit/integration tests (the zero-test hub —
  highest-value test gap in the repo); 300-line splits where the split improves the design
  (never for its own sake); HOCON parser arm or drop the docs claim; `quest/analysis.rs`
  boundary decision (§10.5).
- **Complexity:** Medium (ws_ipc testing is genuinely hard — WebSocket framing + role
  routing; start with routing/classification pure-function tests, `ws_protocol.rs`
  classify_client_info is the natural unit).
- **Completion criteria:** ws_ipc routing covered; integrity gate green with fewer seeded
  entries than at audit.

### P2 — Behaviors, config recommendations, progression surface

#### P2-BEHAVIOR — Behavior system MVP

- **Class:** New (§11). Trigger→Conditions→Actions cards; Behavior IR (typed, private);
  KubeJS + datapack compilers; Pack Index reference validation; 3 example behaviors in
  wizard templates.
- **Dependencies:** P1-PACKINDEX (validation), stable `scriptgen/kubejs.rs`.
- **Complexity:** High. **Risk:** generated-script correctness — the compiler must be
  covered by golden-output tests (input IR → expected script string), the same pattern as
  `scriptgen` today.
- **No-code impact:** the single largest coverage jump after P0 (~5% → ~50% of behavior
  cases).
- **Completion criteria:** an authored behavior emits real KubeJS/datapack that a test pack
  loads without syntax errors; a behavior referencing a missing item is a health finding
  (recommended severity — Trust Rule, s45 deviation); golden-output tests lock the compiler.
- **Status (s45 chunk 1):** the IR + KubeJS compiler spine landed
  (`src-tauri/src/behavior/` — typed `Behavior`/`Trigger`/`Action`/`Condition`, pure
  `compile_to_kubejs`, 5 golden-output tests, 366 Rust green). First pair implemented
  end-to-end: `PlayerJoinsGame` → `GiveItem` (starter-kit; `Item.of(id, count)` for
  stacks > 1). Golden tests already caught a real emitter bug (missing `(` before
  `event`). Deliberately NOT yet: datapack backend, conditions compile path, persistence
  (`.modcanvas/behaviors.json`), the Tauri command, UI cards, Pack Index wiring, and
  in-game API verification (the `give` count form is the flagged runtime surprise —
  roadmap §21 risk #3). Details: `docs/behaviors.md`.
- **Status (s45 chunk 2):** persistence + commands landed. `.modcanvas/behaviors.json`
  via the new single canonical `path_safety::state_file_path` (quest path is now a thin
  delegate); `behavior/store.rs` (load = missing-file→empty, save = full-list atomic
  write, deliberately no validation on save); commands `list_behaviors` /
  `save_behaviors` / `compile_behavior` (compile-for-preview, never writes) registered
  in the handler. 374 Rust green. The frontend surface is the next node (the three
  commands are its contract). Details: `docs/behaviors.md`.
- **Status (s45 chunk 3):** frontend surface landed. Behaviors workspace tab
  (`BehaviorTab.tsx` + `useBehaviors` hook + `services/behavior.ts` contract, 5 hook
  tests): list + card editor (trigger select, give-item action, item id/count) with a
  LIVE compile preview — every edit runs `compile_behavior` and shows the real emitted
  KubeJS or the real compiler error. The completion criterion "an authored behavior
  emits real KubeJS" is now visible in the app. 672 frontend green (667 → 672).
  Scope cut recorded: GiveItem uses a text input with compile validation, not the
  ItemBrowser picker (that needs the quest asset pipeline — queued). Still queued:
  conditions + remaining vocabulary, datapack backend, wizard templates. Details:
  `docs/behaviors.md`.
- **Status (s45 chunk 4):** the emission step landed — saving behaviors now compiles
  + writes `kubejs/server_scripts/modcanvas_behaviors.js` in the instance
  (`behavior/emit.rs`, dedicated file, `validate_under_root` project-root scoping,
  atomic write). Before this the game never received a script (found by in-game test).
  Honest failure contract: uncompilable behaviors are skipped in the file and reported
  as `emit_failures` on save. PATH FINDING: the recipe writer (`write_script_files`)
  resolves through config-scoped `validate_project_write` and lands recipes in
  `<root>/config/kubejs/` — a directory KubeJS never reads (its README + the
  instance's own `main.js` prove scripts load from `<root>/kubejs/server_scripts/`).
  That is a flagged latent bug in the recipe flow, not fixed in this arc. 378 Rust
  green (+4 emitter tests), 673 frontend green. Details: `docs/behaviors.md`.
- **Status (s45 chunk 5):** Pack Health integration — a behavior referencing a missing
  item now surfaces as a RECOMMENDED finding in a new Behaviors health section
  (`pack-health/checks/behaviors.ts`, shared coverage + degraded-registry guard).
  SEVERITY DEVIATION: the roadmap's earlier "Blocking" wording is superseded by the Trust
  Rule (the registry cannot prove absence; a `kubejs:custom_item` behavior would
  false-GO-block a released pack) — recorded in §11.2/§13. New
  `core/behavior/behavior-store.ts` (zustand, not persisted — the Rust command persists;
  the tab mirrors into it, health reads it). 683 frontend green (673 → 683, +10).
  Details: `docs/behaviors.md`.
- **Status (s45 chunk 6 + in-game verify):** recipe-writer path bug FIXED —
  `write_script_files` now uses `validate_under_root` (project-root scoped) for both
  KubeJS and CraftTweaker paths (the config-scoped validator silently redirected them
  under `config/`, which neither mod reads). Regression lock
  `test_under_root_resolves_to_project_root_not_config`. **IN-GAME VERIFIED (monster,
  s45):** the behavior `give` count form (`Item.of(id, count)`, count 10) fired on
  join — the flagged runtime surprise (§21 risk #3) is closed for behaviors — and a
  saved recipe hot-reloaded with evidence-verified PASS and was confirmed working
  in-game. Both handoff UNVERIFIED items are now VERIFIED. 379 Rust green.
  Details: `docs/behaviors.md`.
- **Status (s46 chunk 7 — the §11.1 vocabulary + datapack backend):** the full MVP
  vocabulary landed end-to-end. **IR:** 10 triggers, 6 conditions, 8 actions — every
  variant mapped to an API bytecode-verified against the shipped KubeJS
  2101.7.2-build.368 jar (the §21 risk #3 discipline: golden tests lock strings, javap
  locks APIs, in-game smoke remains the runtime lock). **Compiler architecture —
  subject binding:** actions run against a per-trigger subject (`event.player` /
  guarded `player` for nullable placer triggers / `event.source.player` for kills /
  all-online-players loop for timed). **Datapack backend** (`compile_datapack.rs`):
  advancement JSON + `.mcfunction` reward functions under `kubejs/data/modcanvas/`
  (KubeJS's virtual datapack, jar-verified). Faithful subset only — unexpressible
  triggers/conditions/actions are hard CompileErrors, never silently dropped or
  coarsened (two coarsenings that ship — crafted→`inventory_changed`,
  heal→`instant_health` — carry deterministic warnings). **One backend per behavior**
  (`Backend` field, defaults kubejs — stored behaviors keep loading). **Editor:**
  per-kind cards for the whole vocabulary, backend selector, live compile preview
  labeled by backend, and **ItemBrowser picking** for give/remove (the chunk-3 scope
  cut, paid — shared registry scan, never duplicated). **Templates:** 3 example
  behaviors shipped via `TemplateMeta.state_files` (project-root `.modcanvas/`, both
  backends, roadmap §11.3). **Health:** give_item + remove_item checked;
  spawn_entity deliberately not (entity registry ≠ item registry, documented). 425
  Rust + 685 frontend green. REMAINING: in-game verification of the new vocabulary on
  a real instance (the arc's final node). Details: `docs/behaviors.md`.

#### P2-CONFIG — Config recommendations

- **Class:** Expand (Existing config editor).
- **Features:** plain-language config search ("make creepers not destroy blocks"),
  typed-value recommendations per mod (a small, maintained recommendations file), applied
  through the existing structured save path, undoable.
- **Complexity:** Medium. **Risk:** recommendation-file maintenance burden — keep it tiny
  and community-extensible.
- **No-code impact:** closes the "config torture" gap for the most-requested tweaks.
- **Status (s47): COMPLETE.** `core/config/recommendations.ts` ships a curated
  plain-language list (`CONFIG_RECOMMENDATIONS` — 6 vanilla `server.properties` tweaks,
  tiny by design, one entry + a test to extend); the "Add a config tweak" wizard opens on a
  recommendation search (step 0) that maps intent → file + key path + typed value, gated on
  the target file being present in the pack (no dead ends). Apply routes through the
  editor's existing history+save path — undoable by the existing Undo button. Reference:
  `docs/config-recommendations.md`. Follow-up parked with a written reason: mod-specific
  recommendations need in-pack verification (paths vary too much to ship blind) — the
  structure is the contract, the list is data.

#### P2-PROGRESSION — Campaign-level progression surface

- **Class:** Expand (Existing per-quest fields + sim mode).
- **Features:** a progression view above chapters (stages, gating, unlocks), editing the
  same `progression_mode`/stage fields the quest model already carries; consumes
  P1-HEALTH-2 topology for feedback.
- **Complexity:** Medium–High (a new canvas view is significant UI work).
- **No-code impact:** "design the pacing" without reading SNBT.

#### P2-HOTSWAP — Re-enable in-game reload (gated)

- **Class:** Harden (the reload path was frozen before s42; quest+kubejs un-froze s42–s44
  behind the evidence gate, `core/sync/config.ts:26-27`).
- **Scope:** un-freeze `RELOAD_QUESTS`/`RELOAD_KUBEJS_SCRIPTS` behind a stability gate —
  the freeze exists because reload correctness was unproven (todo.md Phase 3). The roadmap
  only re-enables it after (a) the companion reload handlers are verified in-game across
  pack shapes, (b) a "reload vs restart" decision surfaces for the user, never silent
  divergence between what the app thinks is live and what the game runs.
- **Complexity:** Medium–High. **Risk:** the s4b lesson (event-channel drops) and the
  boot-to-test tax make this high-value but easy to get wrong.
- **Completion criteria:** a reload cycle is verified in-game with observable log evidence;
  the UI never claims reload happened when it didn't.
- **Status (s43):** the companion's reload dispatch moved from the player's command pipe to the
  integrated server's own command source (`server.getCommands().performPrefixedCommand(...)`,
  console op level) — bytecode-verified to bypass FTB's `hasEditorPermission` gate (workaround #9
  no longer applies to the app's path). The evidence loop (pin → broadcast → verify log line) is
  unchanged and still the truth source.
- **Status (s43b):** end-to-end reload verified in-game — three save→reload cycles with the full
  evidence chain observed in the game log (companion `Dispatched server-side` → FTB
  `Loading quests from`, pin-correlated). The reload-vs-restart honesty decision is made: per-type
  gates in `core/sync/config.ts` (`QUEST_HOTSWAP_ENABLED`, `KUBEJS_HOTSWAP_ENABLED` — the KubeJS
  reload stays disabled until its evidence shape is probed) and save messages surface the decision
  (quests: reload-verified; recipes: "restart the game to apply"). Companion closes an open quest
  book before the reload and reopens it once the reload sync lands — FTB does not refresh an open
  QuestScreen (red X on every chapter until reopened). Reopen runs on the CLIENT (`openGui`, the
  keybind's path) ~600ms after the server reload completes so the sync is applied, and overrides
  the vanilla pause menu (auto-opens on window focus loss while saving from the app) but never a
  screen the user opened themselves. Three FTB behaviors drove the design: FTB Library wraps all
  GUIs in a `ScreenWrapper` (the book is never the vanilla `Screen`); the client's reload sync
  arrives AFTER the server reload completes; `pauseOnLostFocus` opens the pause menu the moment
  the book closes.
- **Status (s44):** the KubeJS gate is now ENABLED behind a two-line evidence shape, and the
  Prism-refusal launch detection landed. KubeJS evidence was probed against the SHIPPED jar
  (2101.7.2-build.368) — not assumed from the quest shape: bare `kubejs reload` has no executor
  on 1.21.1 (the tree is `reload config|startup-scripts|server-scripts`), and the script reload
  alone does not apply recipes (KubeJS's own command message says run `/reload` for datapack
  things). The companion therefore runs `kubejs reload server-scripts` + `/reload` as a two-
  command sequence (server-thread FIFO), and the evidence matcher (`commands/hotswap.rs`
  `ReloadKind::KubeJs`) requires BOTH lines after the pin: "KubeJS server scripts in" (script
  reload) and "Server resource reload complete!" (datapack apply). Recipe save now runs the
  evidence-gated loop and reports PASS/FAIL/rotated/no-companion honestly — never an unverified
  claim. Launch: `do_launch` watches a 20s grace window; a wrapper that exits 0 while no game
  process appears (the workaround #8 stale-Prism signature) now fails with a specific "close
  Prism and retry" message instead of reporting "Game exited (code 0)" as success. Both reload
  types' world-load false-pass lines are handled by the existing pin (never whole-log grep).

### P3 — Loot, worldgen, distribution depth

- **P3-LOOT** — loot-table editor (scan `data/*/loot_table(s)/*.json`; weighted pools,
  conditions; emits real JSON; Pack Index validated). Class: New. Complexity: Medium–High.
  **COMPLETE (s47).** Read-only scan MVP (s44): `src-tauri/src/loot/` walks pack `data/` +
  mod jars for both historical dir names (`loot_table` 1.21+ / `loot_tables` pre-1.21),
  parses each into a typed summary via the pure `parse.rs`, dedups by resource id with
  full-path keys (`minecraft:chests/simple_dungeon` — the game's key form, NOT the bare
  filename). Editor (s47): full-depth model with preserve-unknown (`loot/model.rs` + the
  frontend mirror `core/loot/model.ts`), verbatim atomic save (`loot/editor.rs`, root-scoped
  path gate), Pool-Index-style item validation as warnings never gates
  (`core/loot/validation.ts`), typed condition editors for the common five
  (`core/loot/conditions.ts`), and new-table creation with the version-derived dir via the
  adapter matrix (`IMinecraftVersionAdapter.getLootDirName()`, locked in matrix.test.ts;
  `loot/create.rs`). Reference: `docs/loot-editor.md`.
- **P3-WORLDGEN** — worldgen authoring: features/ores first (datapack-JSON-scoped), biomes
  later, dimensions last. Class: New. Complexity: **Very High** — the lowest no-code
  ROI-per-effort; scope tightly or cut. **Recommendation: keep as a "scoped features/ores
  surface only" item until P3-LOOT and behaviors prove the model; treat full dimension
  authoring as Future/Investigate.**
- **P3-DISTRIB-DEEP** — publish/curation integrations (PW-GUI-style packaging, modpack
  sharing). Class: Investigate. Depends on P0-DISTRIB existing.

---

## 14. Technical architecture roadmap

Incremental evolution of the existing architecture — **no rewrite**.

### 14.1 What stays (architecture invariants)

- **Three machines** (frontend/backend/companion) with the WS hub as the runtime bridge.
- **3-layer rule** in the frontend; path-safety gate on all writes.
- **Scan → index → editor pipeline** (it becomes the Pack Index, §7).
- **Deterministic, pure analysis** (Pack Health + Pack Index both).
- **Adapter matrix** as the version/loader boundary — with one correction: the Rust side's
  scattered hardcoded version checks should eventually read a **Rust-side VersionProfile**
  extracted from those hardcoded points (recipe folder names, tag folder names, result
  field names). Extract incrementally as each P1/P2 feature touches a version boundary;
  never build a parallel full matrix in one go.

### 14.2 What gets added

1. **Pack Index model + build step** (P1-PACKINDEX) — Rust types, one build pass on the
   load pipeline, batched `get_pack_index` command.
2. **Behavior IR + compilers** (P2-BEHAVIOR) — typed IR model, `scriptgen`-style compilers
   with golden-output tests.
3. **VersionProfile (Rust)** — extracted from `recipes/mod.rs`, `instance_textures/tags.rs`,
   `recipes/vanilla.rs` hardcoded checks as features touch them.
4. **New editors** (P3) reuse the existing shell: workspace tabs, `HistoryStore`, item
   picker, texture pipeline.

### 14.3 What gets removed or parked (with reasons)

- Orphaned `components/canvas/**`, `graphConverters.ts` — deleted (superseded).
- `core/sync/` — quest+kubejs reloads are live via `services/hotswap.ts`; the `SyncPipeline`
  class itself is unwired (exported, never constructed — s52 grep) and its status as
  "re-enable path" vs dead code needs a decision, not a default.
- Dead Rust commands — pruned or parked per P0-HYGIENE-1, with written reasons.
- `mod_metadata` table — drop or wire; dead schema is misleading schema.

### 14.4 Persistence & undo

- New working states (Behavior IR, future editors) follow the `.modcanvas/` private-state
  pattern and route through the global `HistoryStore` (journal + timeline). The recipe
  store's private undo stack is the anti-pattern — new editors must not replicate it.

### 14.5 Project boundaries

- Project root = instance root (`path_safety.rs` scoping). Wizard scaffolding writes inside
  that root. The Pack Index is per-project derived state (like the texture caches) or
  rebuilt on load — cheap because it is a rearrangement of existing scan output.

---

## 15. Feature dependency map

```
P0-WIZARD ────────► P0-BEGINNER (onboarding sets mode flag)
   │                    │
   ├──► P0-MINIWIZ (templates dogfood mini-wizards)
   ├──► P0-LAUNCH (Launch button depends on hardened launch path)
   └──► P0-DISTRIB (release needs a working wizard to be meaningful)

P0-HYGIENE-1/2 (parallel; unblocks everything by keeping the tree honest)

P1-PACKINDEX ──────► P1-HEALTH-2 (topology consumes index)
   │                    │
   ├──► P2-BEHAVIOR (reference validation)
   ├──► P1-PARITY (independent — can run in parallel)
   └──► P2-PROGRESSION (topology feedback)

P2-BEHAVIOR ───────► P3-LOOT (loot editor reuses IR validation + index)
P3-LOOT ───────────► P3-WORLDGEN (worldgen last — hardest, lowest ROI)

P2-HOTSWAP: gated on companion stability; independent of the index spine.
```

**Critical path:** P0-WIZARD → (P1-PACKINDEX → P1-HEALTH-2) → P2-BEHAVIOR. Everything
else hangs off it.

---

## 16. P0/P1/P2/P3 summary

| Priority | Items | Theme |
|---|---|---|
| **P0** | P0-WIZARD, P0-BEGINNER, P0-MINIWIZ, P0-LAUNCH, P0-DISTRIB, P0-HYGIENE-1, P0-HYGIENE-2 | Beginner wedge + hygiene floor |
| **P1** | P1-PACKINDEX, P1-HEALTH-2, P1-PARITY, P1-HYGIENE | Veteran depth + the reference spine |
| **P2** | P2-BEHAVIOR, P2-CONFIG, P2-PROGRESSION, P2-HOTSWAP | Advanced no-code + runtime |
| **P3** | P3-LOOT, P3-WORLDGEN (scoped), P3-DISTRIB-DEEP | Long-tail authoring + distribution |
| **Future / Investigate** | Mixin backend (closed slot), flavor analytics, full dimension authoring, custom entities, AI log-deciphering, publish integrations | Explicitly not committed |

---

## 17. Explicit non-goals

Evaluated against the code and the research, each with the reasoning:

1. **Mandatory AI / AI content generation.** Project rule (Bible §5.1): "No AI integration
   at launch, full stop." The roadmap adds nothing AI. The only sanctioned future path is
   community-demanded **log deciphering** — and even that is gated on community demand,
   not now.
2. **A generic visual programming language.** The behavior system (§11) is a constrained
   Trigger→Conditions→Actions model with a curated action library. Loops, variables,
   arbitrary logic composition: out of scope forever. The escape hatch is a labeled raw-
   command action, not a scripting surface.
3. **A universal Minecraft simulator.** Directly contradicts the Trust Rule
   (`PROJECT_BIBLE.md:98-101`). ModCanvas validates files; boot time is reserved for
   runtime-only surprises. Simulating classloading/mixin conflicts is a research project
   the size of reimplementing a loader — rejected.
4. **A custom launcher / OAuth handling.** Prism and CurseForge own launch and trust;
   ModCanvas attaches (`PROJECT_BIBLE.md:141`). Never.
5. **A proprietary pack format.** Outputs are real ecosystem artifacts; private state is
   disposable. A proprietary format would kill the veteran audience and the no-lock-in
   promise (`PROJECT_BIBLE.md:59-64`).
6. **Supporting every Minecraft version simultaneously.** Version discipline is
   demand-driven (`PROJECT_BIBLE.md:130-134`). One primary target (1.21.1/NeoForge), full
   fidelity, then expand. The 1.19.2 option in the new-pack modal is a *lie to remove*,
   not a version to support.
7. **Universal Mixin editing.** Internal backend only, closed slot (§12), with a written
   entry criterion.
8. **Custom entities before foundational systems are mature.** Entity authoring (model,
   textures, AI, spawning, registration) is a whole modding subfield with no offline
   validation path — the definition of a P3/Future trap. Rejected until behaviors + Pack
   Index prove the model.
9. **Mod installation/distribution at MVP.** Curated recommendations may appear (wizard
   picks), full install management is post-MVP (`PROJECT_BIBLE.md:144`).
10. **Flavor analytics (mod % / difficulty) now.** Quarantined with a written reason
    (§10.3).

---

## 18. Risks and unknowns

| # | Risk | Mitigation | Severity |
|---|---|---|---|
| 1 | **Beginner UX untestable by the author** (Bible risk 1) | Fresh-eyes testers as an explicit P0 milestone — the wizard's completion criteria includes "fresh-eyes tester completes the path" | High |
| 2 | **Pack Index key drift** — the repo's classic failure class | Canonical-key contracts per store, integrity-suite reference check, silent-miss reporting (§8.3.1) | Medium |
| 3 | **Generated behavior code can be broken at runtime** (scripts load, but run wrong) | Golden-output compiler tests; deterministic compile warnings; Pack Index validation; honest "file-level sound, runtime-only surprises remain" framing | High |
| 4 | **Hotswap reload regresses** (the s4b event-drop class) | Per-type gates stay evidence-locked: a reload type ships only behind its verified log signature (s42–s44 discipline); explicit reload-vs-restart honesty; no silent divergence | Medium |
| 5 | **Windows reality** (Bible risk 7): EBUSY paths, WebKitGTK differences | CI Windows runner when feasible; keep the atomic-write + retry discipline; real-device verification before launch audience | Medium |
| 6 | **CI green ≠ local green** | Integrity gate is the source of truth; CI is a second witness | Low |
| 7 | **Template content quality** | Coherency-over-ownership default ("probably a bad pack" is a win); templates editable and visible | Low |
| 8 | **300-line debt growth** | Integrity gate already seeds; splits where the split improves the design | Low |
| 9 | **ws_ipc reliability** (zero tests, security-sensitive hub) | P1-HYGIENE test investment; classify/routing pure functions first | Medium |
| 10 | **Scope creep from exciting features** | This roadmap's P-order is binding: nothing ships ahead of the wedge; future/Investigate list is explicit | — |
| 11 | **CF/Modrinth API drift** (search shapes, version fields — the s33 class) | Live-API probes in the test loop; tolerance per-source; slug fallback pattern extended | Medium |
| 12 | **Curated-mod / config-recommendation maintenance burden** | Keep files tiny, community-extensible, doc'd as maintained artifacts | Low |

**Unknowns:** real beginner behavior on the wizard (until tested); CF zip expectations for
mixed-source exports (until verified against a real pack); in-game verification budget for
P2-HOTSWAP; whether the ecosystem will adopt the generated behavior scripts (KubeJS API
drift).

---

## 19. Success criteria

- **MVP (P0 done):** the Bible's exit criterion is met and *verified by fresh-eyes testers*:
  zero-code beginner creates + launches a playable 1.21.1/NeoForge pack.
- **P1 done:** "where is this used" works across recipes/quests/items; Pack Health reports
  progression topology truthfully; the §13 P1-PARITY items are closed or explicitly parked.
- **P2 done:** a behavior authored visually compiles to loadable KubeJS/datapack with
  golden-output coverage; config recommendations apply undoable tweaks; the campaign
  progression surface ships.
- **Repo health:** `pnpm integrity` and `pnpm health` are green at every boundary; the
  seeded debt list shrinks, never grows; docs match the tree (doc-sync rule).
- **The metric that matters:** the no-code coverage map (§6) is periodically re-scored
  against the shipped editors — each phase moves a domain column from "current" toward
  "potential" with evidence, not aspiration.

---

## 20. Long-term vision

If the roadmap lands:

- ModCanvas is the **one authoring surface** for a pack: quests, recipes, configs, loot,
  behaviors, progression — all edited as Minecraft concepts, all emitted as real ecosystem
  artifacts. The user never learns KubeJS, CraftTweaker, datapack JSON, or SNBT.
- The **Pack Index** is the pack's living reference spine: every editor, the health panel,
  and the wizard answer cross-domain questions from one deterministic, offline model.
- The **companion** is a stable runtime bridge: capture, verify, reload-when-proven —
  never a black box, never a lock-in.
- The **health panel** is trusted: file-level sound before boot, honest about the runtime
  ceiling, screenshotable proof of pack quality.
- **Third-party editing always remains.** ModCanvas is the cockpit, not the owner. The
  KubeJS drawer stays for the veteran; the beginner never needs it.
- **No AI, ever, by default.** Offline-first determinism is the product's spine, and the
  roadmap protects it structurally (every analysis is a pure function; every output is a
  real artifact).

---

## 21. The no-code boundary (the final answer)

> **If ModCanvas succeeds, what can a person with zero programming knowledge realistically
> create that they could not reasonably create today without learning KubeJS, CraftTweaker,
> datapacks, configuration syntax, or Java?**

**The technically grounded answer, derived from the architecture in this document:**

A complete, launchable, file-level-sound modpack — with authored quest lines, custom
recipes, balanced progression, and a curated set of scripted behaviors — built entirely
through visual surfaces, with the app emitting the real KubeJS, CraftTweaker, datapack, and
SNBT artifacts underneath.

Concretely, by the P2 horizon a zero-code creator can:

1. **Take an existing Prism/CurseForge instance or fresh pack and reach Launch through the
   wizard** — instance attach, template scaffold, curated mods, guided first quest, green
   check (P0). Today this is the single biggest gap: the app has the IDE but no door.
2. **Author the content veterans author by hand** — quests with tasks/rewards/gating
   (already true today, ~90% parity), recipes of all six types with disable/replace
   (already true), and structured config tweaks (already true). The formats are
   indistinguishable from hand-written ones: real `.snbt`, real `.js`, real `.json`,
   diff-able, versionable, portable (already true today).
3. **Do what currently requires scripting** — loot-on-kill, advancement gating, stage
   unlocks, commands, item gating — via the constrained Trigger→Conditions→Actions editor
   compiled to KubeJS/datapack (P2). This is the step that closes the "learn KubeJS"
   prerequisite for the *common* cases.
4. **Know it is sound before boot** — Pack Health's go/no-go with cross-domain reference
   integrity (P0–P1), then progression topology (bottlenecks, walls, unreachable quests)
   (P1).

**The boundary — stated honestly, not aspirationally:**

- **The ceiling is file-level correctness, not runtime guarantee.** The Trust Rule is
  load-bearing: ModCanvas catches everything that is a file problem, so boot time is
  reserved for runtime-only surprises. A zero-code creator still launches and observes —
  the app cannot promise "it will run."
- **The long tail stays out of reach without code:** behaviors beyond the action library
  (custom mechanics, complex mod interactions), anything requiring a Mixin (mod-class
  behavior changes — the closed backend slot), worldgen beyond datapack-JSON scope, and
  custom entities. The roadmap explicitly refuses to fake coverage here rather than claim
  it (P3 scoping, §17 non-goals).
- **"Zero programming knowledge" is literal about syntax, not about thinking.** The user
  still learns game-design concepts (gating, pacing, balancing, references) — but those
  are Minecraft concepts, which is the point: the product translates game-design intent
  into implementation, and never asks the creator to think in implementation terms.

So the final answer is: **a person with zero programming knowledge can, by the P2 horizon,
design, balance, validate, and launch a complete modpack — every artifact hand-authored by
ModCanvas in real ecosystem formats — provided the content stays within the curated
vocabulary (recipes, quests, progression, configs, and the constrained behavior library).**
What they cannot do without code is the long tail the industry itself cannot ship no-code:
custom mechanics, Mixins, deep worldgen, and custom entities. That boundary is the honest
product definition, and this roadmap protects it from both directions — never claiming
simulation, never refusing the next tractable no-code surface.

---

*End of roadmap. Amend deliberately; the repo's own rules apply to this document: when
behavior changes, this doc (and the docs it points to) change in the same pass.*
