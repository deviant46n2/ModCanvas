# Behavior Smoke Suite — "test everything at once" (s46)

One game session, ~15 behaviors, every s46 emit-path variant verified at
runtime. The suite lives in `src-tauri/src/behavior/smoke_suite.json` — a
living artifact locked by `tests_smoke_suite.rs` (every trigger/condition/
action variant, both backends, and the negative controls must stay present;
if you trim coverage, the lock fails).

**Version portability:** the suite uses only version-stable ids
(`minecraft:crafting_table`, `minecraft:cobblestone`, `minecraft:zombie`,
`minecraft:diamond`, `minecraft:story/root` — all present 1.13+). The
compiler's adapters handle version-specific emission; the suite itself is
version-agnostic. The one version-sensitive step is the setup revoke
(`/advancement revoke` — stable command since 1.13).

## Setup (one-time, every run)

1. **Deploy the suite as the project's behaviors.** Replace
   `<instance>/minecraft/.modcanvas/behaviors.json` with the contents of
   `smoke_suite.json` (or paste it into the Behaviors tab — the app loads
   whatever the IR holds).
2. **Save through the app** (the Behaviors tab Save button) — this is the
   deploy step: it emits `kubejs/server_scripts/modcanvas_behaviors.js`
   (the kubejs behaviors) and `kubejs/data/modcanvas/advancement|function/`
   (the datapack behaviors).
3. **Verify emission** before launching:
   - `modcanvas_behaviors.js` contains `[SMOKE-1]`..`[SMOKE-15]` lines
   - `kubejs/data/modcanvas/advancement/behavior_suite_chain*.json` exists
4. **Launch the game**, join the world.
5. **In-game setup (one command):** `/advancement revoke @s only
   minecraft:story/root` — this makes the chain test deterministic on ANY
   save (fresh or reused). Without it, SMOKE-11/12 only fire on a save
   where story/root has never been completed. Revoking the root does not
   clear its children (story/mine_stone etc. stay); re-completing the root
   during the run re-fires the chain.

## The runbook (4 deliberate actions — everything fires around them)

All self-reports appear in chat as `[SMOKE-N] ...` lines. The negative
control must **NOT** appear. The order is deliberate: each action fires
several behaviors at once, so the whole vocabulary is exercised in ~4
physical moments.

### Moment 1 — join (free)
- `[SMOKE-1]` in chat + **8 bread + 1 diamond** in inventory (the diamond
  is for Moment 4's item-held test)
- Then stand still ~10s → `[SMOKE-15]` roughly every other 5-second tick

### Moment 2 — craft a crafting table (punch a tree first)
- `[SMOKE-6]` + 1 stick (crafted trigger + filter)
- `[SMOKE-13]` + 1 apple (datapack crafted → inventory_changed — the
  datapack backend's runtime proof)
- Crafting the table completes `story/root` (revoked in setup, so it
  re-fires) → `[SMOKE-11]` teleport to 0,80,0 + a chicken spawns, and
  `[SMOKE-12]` + 1 apple (datapack advancement chain)
- Expect to get yanked mid-interface — the teleport working.

### Moment 3 — place, break, pick up (one cobblestone)
- **Place** a cobblestone block → `[SMOKE-9]` (placed trigger + placer guard)
- **Break** it → `[SMOKE-10]` (broken trigger + guard)
- **Pick up the drop** → `[SMOKE-7]` (pickup trigger + inventory condition
  TRUE). ⚠️ **Watch for `[SMOKE-8]`** — the negative control also fires on
  picking up a diamond but needs 64+ bread; you don't have that, so it must
  stay silent. If you see SMOKE-8, the `item_in_inventory` guard is broken.

### Moment 4 — one zombie encounter (hold the diamond)
- **Hold the diamond** from the kit in your hand
- Let the zombie **hit you** → `[SMOKE-3]` + 4 half-hearts healed (damage
  trigger + health_below condition + heal action)
- **Kill it** (in the overworld) → `[SMOKE-4]` + 1 emerald + stage
  `smoke_zombie_hunter` (kills trigger + dimension condition + give +
  set_stage), **and** `[SMOKE-5]` (entity_type condition TRUE), **and**
  `[SMOKE-14]` (item_held condition TRUE — you were holding the diamond)

### Moment 5 — leave (free)
- Leave the world → `[SMOKE-2]` in the log (say broadcast; also removes
  all bread — remove_item + run_command actions)

## What each behavior proves (coverage map)

| Suite id | Trigger | Conditions | Actions | Backend |
|---|---|---|---|---|
| suite:kit | player_joins_game | — | give(count 8, count 1), message | kubejs |
| suite:bye | player_leaves_game | — | remove_item, run_command | kubejs |
| suite:ouch | player_takes_damage | health_below | heal, message | kubejs |
| suite:hunter | kills (zombie filter) | dimension | give(1), set_stage, message | kubejs |
| suite:skull | kills (no filter) | entity_type | message | kubejs |
| suite:craft | item_crafted (table filter) | — | give(1), message | kubejs |
| suite:pickup | picked_up (no filter) | item_in_inventory | message | kubejs |
| suite:pickup_neg | picked_up (diamond filter) | item_in_inventory (bread≥64) | message (FAIL) | kubejs |
| suite:build | block_placed (cobble filter) | — | message | kubejs |
| suite:break | block_broken (cobble filter) | — | message | kubejs |
| suite:story | advancement (story/root) | — | teleport, spawn_entity, message | kubejs |
| suite:chain | advancement (story/root) | — | give(1) | **datapack** |
| suite:chain2 | item_crafted (table filter) | — | give(1) | **datapack** |
| suite:hold | kills (no filter) | item_held | message | kubejs |
| suite:lotto | timed_every (100 ticks) | random_chance 0.5 | message | kubejs |

**Coverage:** all 10 triggers (kills ×2 for filter/unfiltered, picked_up ×2
filtered+unfiltered, placed+broken both filtered), all 6 conditions, all 8
actions, both backends, 2 negative controls (SMOKE-8's condition guard;
SMOKE-8's trigger also exercises the filtered picked_up path). The one
condition that cannot be *proven* by a single fire is `random_chance` — it
fires roughly half the time by design; its emit path (the `Math.random()`
guard line) is what's being exercised, and the golden test locks the exact
emitted string.

## Known limits (honest)

- This proves the emitted code RUNS. It does not re-prove the compiler
  strings (golden tests own that).
- `random_chance` pass/fail is probabilistic — ~30 ticks (2.5 min) of
  silence is the fail threshold.
- The teleport in suite:story goes to `0,80,0` — if the spawn dimension
  isn't overworld this lands oddly but still fires.
- The datapack chain (SMOKE-12/13) fires via the advancement screen, not
  chat — the apple in inventory is the observable. SMOKE-12's chain only
  fires if story/root completes DURING the run (the setup revoke makes
  this deterministic).
- **Version note:** the suite is designed for the current adapter matrix.
  New Minecraft versions need their adapters verified (the same §21 risk
  #3 discipline that produced the current verified surface) before the
  suite's runtime proof is trusted — the suite structure itself does not
  change.
