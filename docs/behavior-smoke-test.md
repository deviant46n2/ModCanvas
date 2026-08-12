# Behavior Smoke Suite — "test everything at once" (s46)

One game session, ~15 behaviors, every s46 emit-path variant verified at
runtime. The suite lives in `src-tauri/src/behavior/smoke_suite.json` — a
living artifact locked by `tests_smoke_suite.rs` (every trigger/condition/
action variant, both backends, and the negative controls must stay present;
if you trim coverage, the lock fails).

## Setup (one-time)

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
4. **Launch the game**, join the world, and keep `latest.log` open.

## The runbook (do these in order, observe as you go)

All self-reports appear in chat as `[SMOKE-N] ...` lines. Mark each PASS
as it fires. The two negative controls must **NOT** appear — if they do,
that guard is broken (a real bug, not a test failure).

| Step | What you do | Expected chat / observable |
|---|---|---|
| 1 | Join the world | `[SMOKE-1]` + 8 bread in inventory |
| 2 | Wait 5s | `[SMOKE-15]` ~every 5s (50% chance, so roughly half the ticks) |
| 3 | Punch a tree, craft a crafting table | `[SMOKE-6]` + 1 stick; **also** `[SMOKE-13]` gives 1 apple (datapack crafted→inventory_changed) |
| 4 | Complete `story/root` (craft the table does it) | `[SMOKE-11]` + teleport to 0,80,0 + a chicken spawns; **also** `[SMOKE-12]` gives 1 apple (datapack advancement chain) |
| 5 | Place a stone block | `[SMOKE-9]` |
| 6 | Break a stone block | `[SMOKE-10]` |
| 7 | Kill a zombie (in the overworld) | `[SMOKE-4]` + 1 diamond + stage `smoke_zombie_hunter`; **also** `[SMOKE-5]` (entity_type true path) |
| 8 | Hold a diamond, kill another zombie | `[SMOKE-14]` (item_held true path) |
| 9 | Let a zombie hit you (or take fall damage) | `[SMOKE-3]` + 4 half-hearts healed |
| 10 | Pick up a diamond | `[SMOKE-7]` (pickup + inventory condition true) |
| 11 | Leave the world | `[SMOKE-2]` in the log (say broadcast; also removes all bread) |

## Negative controls (must NOT fire)

- **`[SMOKE-8]`** — "pickup negative control": triggers on picking up a
  diamond but requires `bread >= 64` in inventory. On a normal run you do
  NOT have 64 bread, so it must stay silent. If it appears, the
  `item_in_inventory` guard is emitting wrong.

## What each behavior proves (coverage map)

| Suite id | Trigger | Conditions | Actions | Backend |
|---|---|---|---|---|
| suite:kit | player_joins_game | — | give(count 8), message | kubejs |
| suite:bye | player_leaves_game | — | remove_item, run_command | kubejs |
| suite:ouch | player_takes_damage | health_below | heal, message | kubejs |
| suite:hunter | kills (zombie filter) | dimension | give(1), set_stage, message | kubejs |
| suite:skull | kills (no filter) | entity_type | message | kubejs |
| suite:craft | item_crafted (table filter) | — | give(1), message | kubejs |
| suite:pickup | picked_up (diamond filter) | item_in_inventory | message | kubejs |
| suite:pickup_neg | picked_up (diamond filter) | item_in_inventory (bread≥64) | message (FAIL) | kubejs |
| suite:build | block_placed (stone filter) | — | message | kubejs |
| suite:break | block_broken (stone filter) | — | message | kubejs |
| suite:story | advancement (story/root) | — | teleport, spawn_entity, message | kubejs |
| suite:chain | advancement (story/root) | — | give(1) | **datapack** |
| suite:chain2 | item_crafted (table filter) | — | give(1) | **datapack** |
| suite:hold | kills (no filter) | item_held | message | kubejs |
| suite:lotto | timed_every (100 ticks) | random_chance 0.5 | message | kubejs |

**Coverage:** all 10 triggers (kills ×2 for filter/unfiltered), all 6
conditions, all 8 actions, both backends, 2 negative controls. The one
condition that cannot be *proven* by a single fire is `random_chance` —
it fires roughly half the time by design; its emit path (the
`Math.random()` guard line) is what's being exercised, and the golden test
locks the exact emitted string.

## Known limits (honest)

- This proves the emitted code RUNS. It does not re-prove the compiler
  strings (golden tests own that).
- `random_chance` pass/fail is probabilistic — a run where SMOKE-15 never
  fires would need many ticks to distinguish "broken" from "unlucky";
  ~30 ticks (2.5 min) of silence is the fail threshold.
- The teleport in suite:story goes to `0,80,0` — if the spawn dimension
  isn't overworld this lands oddly but still fires.
- The datapack chain (SMOKE-12/13) fires via the advancement screen, not
  chat — the apple in inventory is the observable.
