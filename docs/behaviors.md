# Behaviors — no-code Trigger → Conditions → Actions (P2-BEHAVIOR)

Status: **chunk 5 (s45)** — Pack Health integration landed: behaviors
referencing missing items surface as recommended findings in a new Behaviors
health section (Trust-Rule-consistent severity, degraded-registry guard,
shared coverage). See `docs/MODCANVAS_ROADMAP.md` §11 for the full proposal
and §13 P2-BEHAVIOR for status. The roadmap's model is binding: **a constrained
Trigger → Conditions → Actions rule with a small curated action library, NOT a
generic visual programming language** (§11.1). Anything outside the vocabulary
is a "raw command" escape hatch, visibly labeled — the veteran's release
valve, not the beginner's trap.

## The IR (`src-tauri/src/behavior/mod.rs`)

Typed, serializable, private to the app — the compiled output is always real
KubeJS/datapack artifacts, never a lock-in (delete ModCanvas, the scripts
remain valid ecosystem files). Versioned via serde as the vocabulary grows.

```rust
pub struct Behavior {
    pub id: String,              // stable id, ns:name (e.g. starter:kit)
    pub name: String,
    pub trigger: Trigger,
    pub conditions: Vec<Condition>,  // empty = unconditional
    pub actions: Vec<Action>,        // run in order
}

pub enum Trigger { PlayerJoinsGame }                  // §11.1 list grows variant-by-variant
pub enum Action  { GiveItem { item: String, count: u32 } }
pub enum Condition {}                                 // reserved shape, zero variants today
```

Deliberately NOT modeled up front: the full §11.1 vocabulary. The enum shapes
leave room; each variant lands with its compile path and golden tests. The
empty `Condition` enum means a behavior with conditions is **unconstructible**
today — and the compiler refuses rather than silently dropping conditions the
moment variants appear.

## The compiler (`src-tauri/src/behavior/compile.rs`)

Pure function: typed IR in, script string out, no I/O.

```rust
pub fn compile_to_kubejs(b: &Behavior) -> Result<(String, Vec<CompileWarning>), CompileError>
```

- `CompileError` — structurally invalid IR (e.g. an unnamespaced item id), or
  a not-yet-implemented construct (conditions, when they exist).
- `CompileWarning` — deterministic, non-fatal notes. Empty today; the seed of
  the Pack Index validation story (§11.2: a behavior referencing a missing
  item is a Blocking health finding).

### What chunk 1 emits

`PlayerJoinsGame` → `GiveItem { item, count }` compiles to:

```js
// ModCanvas Generated Behavior
// starter:kit — Starter Kit

PlayerEvents.loggedIn(event => {
  event.player.give('minecraft:diamond')
})
```

- `count == 1`: bare string argument (`give('minecraft:diamond')`).
- `count > 1`: `Item.of(id, count)` factory (`give(Item.of('minecraft:diamond', 4))`).

## Verification story (the honest boundary)

- **Golden-output tests** (`behavior/tests.rs`, 7 tests) lock every emitted
  string byte-for-byte. They already caught a real emitter bug (missing `(`
  before `event` — `loggedInevent => {`).
- **What golden tests do NOT prove:** KubeJS method signatures at runtime.
  `PlayerEvents.loggedIn` and `give(ItemStack)` are verified to exist in the
  shipped KubeJS 2101.7.2 jar (`KubeJSPlayerEventHandler.loggedIn`,
  `PlayerKJS.kjs$give`), but the two-arg/count forms and script-loading
  behavior are exactly the "file-level sound, runtime-only surprises remain"
  class (§21 risk #3). In-game verification against a real instance is a
  later node of this arc.

## Persistence & commands (chunk 2)

- **File:** `.modcanvas/behaviors.json` per project, resolved through the
  single canonical scoping function `path_safety::state_file_path`
  (`quest_graph_path` is now a thin delegate — one escape guard for all
  `.modcanvas/` state, not one per feature).
- **Store (`behavior/store.rs`):** `load_behaviors` (missing file = empty
  list, never an error) and `save_behaviors` (full-list atomic write, tmp +
  rename with EBUSY retry — a crash never leaves a zero-byte file).
- **Deliberately dumb:** no validation on save. A partially-authored behavior
  MUST be saveable — validation is the compiler's and (later) the Pack
  Index's job, surfaced to the user, never a save blocker.
- **Commands (`commands/behavior.rs`):** `list_behaviors(project_id)`,
  `save_behaviors(project_id, behaviors)` (full-list semantics, matching the
  quest-graph store), `compile_behavior(behavior)` — compile-for-preview,
  never writes. The compile result is `CompileOutput::{Ok{script,
  warnings}|Err{reason}}`, serialized for the frontend.

## Frontend surface (chunk 3)

- **Tab:** Behaviors added to the workspace (`AppTab` union + `ProjectWorkspace`
  tabpanel + `styles/app-behaviors.css`, dark-only, flex-fill invariant from the
  s43 lesson honored — the panel inherits the tabpanel rule, no height link).
- **Contract:** `services/behavior.ts` — the ONLY place the IR shape is known on
  the frontend (types mirror the Rust IR; components never see raw invoke args).
  The three commands from chunk 2 are its full surface.
- **Hook:** `hooks/useBehaviors.ts` — loading/error/loaded + dirty tracking
  (divergence from last saved list), save returns ok/error honestly (never a
  silent success claim). 5 tests.
- **Editor:** `components/behavior/BehaviorTab.tsx` — list + per-card editor for
  the CURRENT vocabulary: trigger select (one option today), action select
  (give-item), item id + count inputs, and a **live compile preview** — every
  edit (debounced 250ms) runs `compile_behavior` and shows the real emitted
  KubeJS or the real compiler error. This is the P2-BEHAVIOR completion
  criterion made visible: an authored behavior emits real KubeJS.
- **Deliberately NOT a generic VPL:** no loops, no variables, no condition
  wiring UI. The vocabulary grows server-side (IR variants land with compile
  paths); this surface renders what the IR declares. When Condition gains
  variants, the editor gains condition cards — not a visual programming
  language.
- **Scope cut (honest):** the GiveItem item id is a text input with live
  compile validation, not the full ItemBrowser picker — wiring ItemBrowser
  needs the texture/registry/engine pipeline (the quest editor's
  `useQuestAssetPipeline`); that integration is queued, not skipped silently.

## Emission (chunk 4) — the missing link

- **The bug it fixes:** before chunk 4, save wrote only the IR to
  `.modcanvas/behaviors.json`. The game never received a script — the
  behavior "didn't go off" because the emitter didn't exist. (Found by
  in-game test, s45.)
- **`behavior/emit.rs`:** compiles every behavior and atomic-writes
  `kubejs/server_scripts/modcanvas_behaviors.js` — a DEDICATED file so a save
  never clobbers a pack-author's own scripts (the recipe writer's rule).
- **Honest failure contract:** a behavior that fails to compile is SKIPPED in
  the emitted file and reported as `SaveBehaviorsOutcome.emit_failures` —
  the IR save still succeeds (partial authoring is legal), but the UI shows
  exactly which behaviors did not ship and why. The game never silently runs
  a stale or broken partial script.
- **PATH FINDING (s45, FIXED):** the script goes to `<project>/kubejs/server_scripts/`
  — the project ROOT, NOT `<project>/config/`. KubeJS reads server scripts
  from the game dir's `kubejs/server_scripts/` (verified: the instance's own
  `main.js` example lives there; the shipped KubeJS README says so). The
  recipe writer (`commands/mod.rs` write_script_files) used to resolve through
  the config-scoped `validate_project_write`, landing recipe scripts (and
  CraftTweaker `.zs`) in `<root>/config/kubejs/...` — directories neither mod
  ever reads, silently never applying, and masquerading as config files in the
  config browser. **Fixed s45** (chunk 6): `write_script_files` now uses
  `validate_under_root` for both KubeJS and CraftTweaker; regression lock
  `test_under_root_resolves_to_project_root_not_config`. Behavior emission had
  already diverged correctly and documented the recipe bug as the reason;
  now the divergence is gone. Remaining: in-game verify that recipe scripts
  actually apply.

## Pack Index validation (chunk 5) — Pack Health integration

- **The check:** `pack-health/checks/behaviors.ts` — every `give_item` target is
  normalized (namespaced-only, tags/unnamespaced skipped — the quest rule) and
  checked against the item registry. Missing items surface in the Behaviors
  health section.
- **SEVERITY DECISION (s45, your call):** RECOMMENDED, never blocking. The
  roadmap's "Blocking health finding" line (§11.2) predates the Trust Rule's
  registry-incompleteness analysis (Project Bible §4; see the quest check).
  The scanned registry cannot prove an item is absent — a behavior referencing
  `kubejs:custom_item` is "missing" from the registry but valid at runtime;
  blocking it would false-GO-block a released pack. Recorded as a written
  deviation in the roadmap §11.2/§13.
- **Guardrails:** behaviors share the quest degraded-registry guard — item
  findings only fire when the registry is trusted (≥100 items, ≥50% coverage,
  ≥20-reference sample); otherwise one `pack.item-registry-degraded`
  diagnostic. Behavior references fold into the shared coverage metric.
- **Wiring:** the Behaviors tab mirrors its working list into a new
  `core/behavior/behavior-store.ts` (zustand, NOT persisted — the Rust
  command is persistence; the store is the live truth both the tab and health
  read, avoiding the recipe store's private-undo anti-pattern, roadmap §14.4).
  `PackHealthProvider` + `HealthLaunchStep` pass it to the analyzer; the
  Behaviors section renders via the existing generic section UI.

## Not in chunk 5 (queued)

- Conditions compile path + editor cards; remaining §11.1 triggers/actions.
- ItemBrowser integration for GiveItem (needs the asset pipeline).
- Datapack backend (advancement triggers / loot conditions).
- 3 example behaviors in wizard templates.
- **In-game API verification — DONE (s45, monster):** the `give` count form
  (`Item.of(id, count)` for stacks > 1) was proven in a real game — a behavior
  giving `minecraft:diamond` count 10 fired on join. The flagged runtime
  surprise (roadmap §21 risk #3) is closed for the behavior path.
- **Recipe-writer path fix in-game verify — DONE (s45, monster):** a saved
  recipe hot-reloaded with evidence-verified PASS and was confirmed working
  in-game; `modcanvas_recipes.js` confirmed in `kubejs/server_scripts/`
  (project root, no `config/kubejs`). The s44 evidence gate's blind spot is
  closed.
