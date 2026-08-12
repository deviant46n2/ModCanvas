# Behaviors — no-code Trigger → Conditions → Actions (P2-BEHAVIOR)

Status: **chunk 1 (s45)** — IR + KubeJS compiler spine, one pair implemented.
See `docs/MODCANVAS_ROADMAP.md` §11 for the full proposal and §13 P2-BEHAVIOR
for status. The roadmap's model is binding: **a constrained
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

- **Golden-output tests** (`behavior/tests.rs`, 5 tests) lock every emitted
  string byte-for-byte. They already caught a real emitter bug (missing `(`
  before `event` — `loggedInevent => {`).
- **What golden tests do NOT prove:** KubeJS method signatures at runtime.
  `PlayerEvents.loggedIn` and `give(ItemStack)` are verified to exist in the
  shipped KubeJS 2101.7.2 jar (`KubeJSPlayerEventHandler.loggedIn`,
  `PlayerKJS.kjs$give`), but the two-arg/count forms and script-loading
  behavior are exactly the "file-level sound, runtime-only surprises remain"
  class (§21 risk #3). In-game verification against a real instance is a
  later node of this arc.

## Not in chunk 1 (queued)

- Persistence: `.modcanvas/behaviors.json`, following the `quest_graph_path`
  private-state pattern (`src-tauri/src/path_safety.rs:108-125`).
- The Tauri command + frontend surface.
- Conditions compile path; remaining §11.1 triggers/actions.
- Datapack backend (advancement triggers / loot conditions).
- Pack Index reference validation wiring (Blocking health finding).
- 3 example behaviors in wizard templates.
