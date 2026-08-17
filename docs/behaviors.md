# Behaviors — no-code Trigger → Conditions → Actions (P2-BEHAVIOR)

Status: **s46** — the §11.1 MVP vocabulary is implemented end-to-end: 10
triggers, 6 conditions, 8 actions, two backends (KubeJS + datapack), the
full editor with a live compile preview and ItemBrowser picking, Pack Health
integration, and 14 example behaviors in the wizard template. See
`docs/MODCANVAS_ROADMAP.md` §11 for the full proposal and §13 P2-BEHAVIOR for
status. The roadmap's model is binding: **a constrained Trigger → Conditions
→ Actions rule with a small curated action library, NOT a generic visual
programming language** (§11.1). Anything outside the vocabulary is a
"raw command" escape hatch (`run_command`), visibly labeled — the veteran's
release valve, not the beginner's trap.

## The IR (`src-tauri/src/behavior/mod.rs`)

Typed, serializable, private to the app — the compiled output is always real
KubeJS/datapack artifacts, never a lock-in (delete ModCanvas, the scripts
remain valid ecosystem files). Versioned via serde as the vocabulary grows.

```rust
pub struct Behavior {
    pub id: String,              // stable id, ns:name (e.g. starter:kit)
    pub name: String,
    pub backend: Backend,        // kubejs (default) | datapack
    pub trigger: Trigger,
    pub conditions: Vec<Condition>,  // empty = unconditional
    pub actions: Vec<Action>,        // run in order
}
```

**One backend per behavior.** The game can only run the artifact once —
emitting both would double-fire every rule. `Backend` defaults to kubejs via
serde, so behaviors authored before the datapack backend keep loading
unchanged.

### Triggers (10)

Each maps to a KubeJS event handler VERIFIED against the shipped KubeJS
2101.7.2-build.368 jar (s46): event class bytecode for the handler name, the
targeted-event "any" semantics (`EventHandlerContainer` — no/blank target
listens for all), and the per-event subject. Optional target fields map to
KubeJS targeted handlers: `None` = any, `Some` = that registry id.

| Variant | KubeJS event | Subject |
|---|---|---|
| `player_joins_game` | `PlayerEvents.loggedIn` | `event.player` |
| `player_leaves_game` | `PlayerEvents.loggedOut` | `event.player` |
| `player_takes_damage` | `EntityEvents.afterHurt('minecraft:player', …)` | `event.player` |
| `player_kills_entity { entity? }` | `EntityEvents.death(<entity>, …)` | `event.source.player` (guarded) |
| `item_crafted { item? }` | `ItemEvents.crafted(<item>, …)` | `event.player` |
| `item_picked_up { item? }` | `ItemEvents.pickedUp(<item>, …)` | `event.player` |
| `block_placed { block? }` | `BlockEvents.placed(<block>, …)` | `event.player` (guarded — placer may be a piston) |
| `block_broken { block? }` | `BlockEvents.broken(<block>, …)` | `event.player` (guarded) |
| `advancement_completed { advancement }` | `PlayerEvents.advancement(<id>, …)` | `event.player` |
| `timed_every { ticks }` | `ServerEvents.loaded` + `scheduleRepeatingInTicks` + `players.forEach` | every online player |

### Conditions (6)

All compile to `return` guards: if any condition fails, the actions never
run. Accessors verified in the jar: `mainHandItem.id` (LivingEntityKJS +
ItemStackKJS), `inventory.count(id)` (InventoryKJS), `event.entity.type`
(EntityKJS), `level.dimension` (LevelKJS), `Math.random()`, `health` (vanilla
wrapper).

| Variant | Guard |
|---|---|
| `item_held { item }` | `player.mainHandItem.id == item` |
| `item_in_inventory { item, min_count }` | `player.inventory.count(item) >= min_count` |
| `entity_type { entity }` | `event.entity.type == entity` — **only legal on entity-scoped triggers** (kills, damage, crafted, picked up, placed, broken); elsewhere it is a CompileError, never silently dropped |
| `dimension { dimension }` | `player.level.dimension == dimension` |
| `random_chance { chance }` | `Math.random() < chance` (0.0..1.0 enforced) |
| `health_below { health }` | `player.health < health` |

### Actions (8)

Calls verified in the jar (PlayerKJS, ServerPlayerKJS, EntityKJS,
InventoryKJS, MinecraftServerKJS, LevelKJS, Stages).

| Variant | Emits |
|---|---|
| `give_item { item, count }` | `player.give(item)` / `player.give(Item.of(item, count))` for stacks > 1 |
| `remove_item { item }` | `player.inventory.clear(item)` — removes ALL of that item |
| `run_command { command }` | `event.server.runCommandSilent(command)` — the raw escape hatch; a leading `/` is a warning, not an error |
| `message { text }` | `player.tell(text)` |
| `heal { amount }` | `player.heal(amount)` |
| `teleport { x, y, z, yaw, pitch }` | `player.setPositionAndRotation(x, y, z, yaw, pitch)` |
| `spawn_entity { entity }` | `player.level.spawnEntity(entity, e => {})` |
| `set_stage { stage }` | `player.stages.add(stage)` |

## SUBJECT BINDING (the s46 compiler architecture)

Actions run against a subject, but the subject expression differs per
trigger. `compile.rs` emits a per-trigger binding:

- **Always-player triggers** (joins, crafted, picked up, advancement,
  damage): subject is `event.player` directly — safe, no guard.
- **Nullable triggers** (block placed/broken): `const player = event.player;
  if (!player) return;` — the placer may be a piston or other non-player
  entity.
- **Kills**: `const player = event.source.player; if (!player) return;` —
  the dying entity's killer (verified via `DamageSourceMixin.kjs$getPlayer`);
  the guard IS the "player kills" semantic.
- **Timed**: `event.server.players.forEach(player => …)` — no single event
  player; every online player is the subject each interval.

Conditions and actions both address this subject variable. This is why the
kills trigger's `event.source.player` guard and the placed trigger's placer
guard are structurally different — they guard different nullability
realities.

## The compilers

### KubeJS (`compile.rs` + `compile_conditions.rs` + `compile_actions.rs`)

```rust
pub fn compile_to_kubejs(b: &Behavior) -> Result<(String, Vec<CompileWarning>), CompileError>
```

Pure: typed IR in, script string out, no I/O. `CompileError` = structurally
invalid IR (unnamespaced id, `entity_type` condition on a join trigger,
`random_chance` out of range, zero tick interval). `CompileWarning` =
deterministic non-fatal notes (leading `/` on a command). The emitted script
rides the same evidence loop as the hotswap gate (`kubejs reload
server-scripts` picks it up).

### Datapack (`compile_datapack.rs`)

```rust
pub fn compile_to_datapack(b: &Behavior) -> Result<(DatapackOutput, Vec<CompileWarning>), CompileError>
```

Advancement JSON + `.mcfunction` reward function. **Faithful subset only** —
the honest boundary is a hard CompileError naming the construct, never a
silent drop or coarsening:

- Triggers: `player_kills_entity` → `minecraft:player_killed_entity`
  (EntityType condition folds into the entity predicate — the one faithful
  fold); `item_crafted` → `minecraft:inventory_changed` (with a coarseness
  warning — datapack cannot tell crafting from pickup); `block_placed` →
  `minecraft:placed_block`; `advancement_completed` → a hidden child
  advancement with an `impossible` criterion whose `parent` is the referenced
  advancement (completes exactly when the parent does). Joins, leaves,
  damage, and timed have no datapack criterion → CompileError.
- Conditions: only `entity_type` (folds into the kills predicate); everything
  else → CompileError.
- Actions → function commands: `give`, `clear`, raw command, `tellraw`,
  `effect give … instant_health` (2-half-heart granularity warning), `tp`,
  `summon`. `set_stage` has no command form → CompileError.

Every name is verified against the shipped jars at s46: trigger ids from
`CriteriaTriggers` bytecode, advancement JSON keys from `Advancement.class`,
the rewards `function` field, the 1.21 singular `advancement/` datapack
folder (`Registries.elementsDirPath`), and `kubejs/data/` as KubeJS's
virtual datapack (`KubeJSPaths` + `ServerScriptManager`).

## Emission (`emit.rs`)

`emit_behavior_scripts` writes the real artifacts on every save:

- **KubeJS behaviors** → `kubejs/server_scripts/modcanvas_behaviors.js` (the
  dedicated file — a save never clobbers a pack-author's own scripts).
- **Datapack behaviors** → `kubejs/data/modcanvas/advancement/*.json` +
  `kubejs/data/modcanvas/function/*.mcfunction`. The whole `modcanvas`
  namespace is **cleared and re-emitted** on every save, so the on-disk
  datapack always mirrors the IR exactly — a deleted behavior cannot leave a
  stale advancement firing in-game.

Honest failure contract (unchanged from chunk 4): a behavior that fails to
compile is SKIPPED and reported as `SaveBehaviorsOutcome.emit_failures` —
the IR save still succeeds (partial authoring is legal), but the UI shows
exactly which behaviors did not ship and why.

## Persistence & commands (chunk 2, unchanged)

- **File:** `.modcanvas/behaviors.json` per project, resolved through
  `path_safety::state_file_path`.
- **Store (`behavior/store.rs`):** full-list load/save, atomic write, missing
  file = empty. No validation on save — partial authoring must always be
  saveable; validation is the compiler's job.
- **Commands (`commands/behavior.rs`):** `list_behaviors`,
  `save_behaviors` (full-list + emit), `compile_behavior` (compiles on the
  behavior's declared backend, never writes).

## Frontend surface

- **Editor:** `components/behavior/` — `BehaviorTab` (list + save), per-card
  `BehaviorCard`, `TriggerEditor` / `ConditionEditor` / `ActionEditor` (per
  §11.1 kind, with defaults via `blank*` in `services/behavior.ts`). The
  "when / if / then" rows render exactly what the IR declares; growing the
  vocabulary is a Rust-side change + a contract update, never an editor
  rewrite. Deliberately NOT a generic VPL — no loops, no variables, no
  condition wiring UI.
- **Backend selector:** per-card select (KubeJS / datapack) with a tooltip
  explaining the trade-off. The live compile preview labels which artifact
  it shows and renders warnings inline.
- **Live compile preview:** every edit (debounced 250ms) runs
  `compile_behavior` and shows the real emitted script/JSON or the real
  compiler error — the P2-BEHAVIOR completion criterion made visible.
- **ItemBrowser picking (s46):** GiveItem/RemoveItem item fields have a
  browse button opening the shared JEI-style `ItemBrowser` (the recipe
  editor's `RecipeItemPicker` shell), fed by `useBehaviorItemPicker` — the
  pack-health item registry (shared scan, never duplicated), tag catalog,
  and instance texture index. Picked ids land in the same IR the compiler
  reads. UI-layer only (3-layer rule).
- **Contract:** `services/behavior.ts` — the only place the IR's shape is
  known on the frontend; components never see raw invoke args.

## Pack Health integration (chunk 5, extended s46)

`pack-health/checks/behaviors.ts` — `give_item` and `remove_item` targets
are normalized and checked against the item registry. Missing items surface
as RECOMMENDED findings (never blocking — Trust Rule, s45 deviation).
`spawn_entity` is deliberately NOT checked: it references the ENTITY
registry, which Pack Health has no set for — checking it against the item
registry would false-flag every valid entity id (documented, not silently
skipped). Shared degraded-registry guard + coverage metric.

## Template examples (s46, expanded s70)

The `ide-tour` template ships **14 example behaviors** in
`.modcanvas/behaviors.json` (scaffolded as project-root private state via
`TemplateMeta.state_files`, never under `config/`): the minimal complete
showcase — every trigger, every condition, and every action of the
vocabulary appears at least once across the set, with both backends
demonstrated (12 KubeJS + 2 datapack) per roadmap §11.3. Each example is a
named, pack-shaped use case (starter kit, kill reward, heal-on-hurt,
dimension-gated loot, stage progression, timed blessing, datapack chains) —
the template is the **no-code showcase**: a beginner assembles a pack from
what they can see exists. The 3 original examples (Starter Kit, Zombie
Hunter, Story Reward) are kept verbatim as the first entries. Fidelity
tests lock that they parse as valid IR, compile on their declared backends,
and that the set keeps demonstrating the full vocabulary
(`template_examples_cover_the_full_vocabulary` in `templates/tests_behaviors.rs`
— the template sibling of the smoke-suite locks: when the vocabulary grows,
the template must grow with it).

The teaching side is deliberately parked (s70): the ide-tour chapter's
quests do not name individual examples yet — the exhibits speak for
themselves. Tripwire: when the guide chapter is next touched, the named
examples get written in. The in-game verification of the vocabulary remains
the smoke suite's job (`docs/behavior-smoke-test.md`), not the template's.

## Verification story

- **Golden-output tests** (4 files, 50 tests): KubeJS emission
  (`tests.rs`, `tests_vocabulary.rs`, `tests_conditions_actions.rs`) and
  datapack emission + error paths (`tests_datapack.rs`) lock every emitted
  string byte-for-byte.
- **Jar verification (s46):** every event name, method, and accessor emitted
  was verified against the shipped KubeJS 2101.7.2-build.368 jar and the
  Minecraft 1.21.1 jar (trigger ids, advancement schema, datapack folders)
  via javap/strings — the §21 risk #3 discipline ("file-level sound,
  runtime-only surprises remain").
- **In-game verification:** the `give` count form (`Item.of(id, count)`)
  was proven in a real game at s45. The s46 vocabulary's runtime behavior
  (new triggers, conditions, actions, and the datapack advancement chain)
  was the arc's final verification node — **COMPLETE (s70)** via the smoke
  suite (`docs/behavior-smoke-test.md`) on a fresh instance: all 12
  chat-observable behaviors fired, the negative control held, both datapack
  chains granted their rewards. Run details in the roadmap §13 P2-BEHAVIOR
  s70 status.
