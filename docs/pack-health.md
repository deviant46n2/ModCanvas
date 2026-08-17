# Pack Health

The persistent **go/no-go** surface for the whole project (Project Bible §9). A
workspace tab that tells you, from already-materialized state, whether the pack
is *file-level* sound — so boot time is reserved for runtime-only surprises.

**Verdict wording is precise:** **GO** means "ready to **test**", never "ready
to ship", never "will definitely run" (§4.3). The panel validates files against
materialized state; it can never simulate the game.

## States

Every finding has one of three honest states (§9.1):

- **Blocking** — will break the game. Must be fixed to launch. Reserved for
  findings provable from materialized state: dependency cycles, undefined
  reward tables, invalid authored recipes.
- **Recommended** — completes the pack story or needs a human verify: cover
  image, pack info, empty chapter, unreachable quest, unused reward table,
  item-existence heads-ups. Never blocks.
- **Optional** — reserved for future tiers; never emitted in v1.

Every finding row has a **Copy** button (Trust Rule §5) that copies the exact
message for bug reports and Discord.

### Item-existence findings are recommended, never blocking

The quest editor's item registry is **companion-authoritative (s59)**: the
game's own `BuiltInRegistries.ITEM` dump (`save_item_registry_cmd`,
`src-tauri/src/indexer/mod.rs:135`) is persisted to the per-instance cache
(`source=companion`, cache v4), and `scan_instance_items` serves that cache or
nothing (`mod.rs:83-87` — cache-or-empty). The legacy lang-key scan and KubeJS
script parse (`indexer_kubejs.rs`) are **parked** — lang keys lie (potion
effect floods, banner pattern keys, FTB GUI keys: 1087/2411 entries on the
monster pack were fake). Trust semantics are now versioned:

- **Companion connected / cache populated:** the registry IS the game's
  registered items — absence is provable, not guessed.
- **Before the first companion connect (offline first run):** the registry is
  **empty by design** (blank-first-run is the agreed UX). The degraded-registry
  guard (`pack-health/index.ts` `registryDegraded`, 100-item floor) suppresses
  item-existence findings entirely — an empty registry must never become a
  false "all items missing" storm.

Calling a released pack "blocking" over a registry gap would violate the Trust
Rule (§4), so:

- Item-reference findings are always `recommended` with a "could be a
  custom/KubeJS item" caveat.
- When the registry is too incomplete to trust (fewer than 100 items indexed,
  or under 50% reference match on 20+ checked references), per-item findings
  are **suppressed entirely** and replaced by one Pack-section diagnostic:
  *"Item registry is incomplete (N items indexed, M% matched) — item-existence
  checks were skipped."*
- The verdict header shows live registry stats (`Item registry: N indexed ·
  M% of referenced items matched`) so a broken scan is visible, not silent.
- The findings list is capped at 25 per section; the section count badge still
  shows the true total.

## Architecture (determinism rule)

The report is a **pure function of already-materialized state** (§9.2) — no
on-demand rescans, no I/O, no IPC on the fast path:

| Input | Source |
|---|---|
| Quest graph + reward tables | `QuestBookEditor` pushes `graph` on load and every commit |
| Item registry | `scanInstanceItems` result already resident in the editor |
| Recipes | existing `useRecipeStore` (the recipe editor's own store) |
| Pack metadata | project record (passed to the provider) |
| Cover image | one `get_pack_icon` call per load from `ProjectWorkspace` |
| Pack Index (availability) | memoized `getPackIndex(projectId)` — fetched by `PackHealthProvider` + the wizard's `HealthLaunchStep`; refetched after a recipe save (dirty → clean) |

- **Analysis** — `frontend/src/core/pack-health/` (pure TS, vitest-covered).
  `analyzePackHealth(input)` → `PackHealthReport`. Per-file checks:
  - `checks/quests.ts` — `checkQuestStructure` (dependency cycles reusing
    `core/validation/quest-validator.findCycles`, undefined/unused reward
    tables, empty chapters, unreachable quests) + `checkQuestItemRefs`
    (missing item refs, recommended) + `questItemCoverage` for the
    degraded-registry guard.
  - `checks/quests/availability.ts` — **P1-HEALTH-2 uncompletable-quest
    detection**: quest tasks that assert crafting (`item_crafting`, or
    acquisition/retrieval marked `only_from_crafting`) whose item has no
    recipe output in the Pack Index (`recipe_outputs`). Sharp scope (s68
    ruling): plain acquisition tasks are never flagged — "no recipe" ≠
    "unobtainable" (items can be mined/looted). Recommended, never blocking;
    skipped entirely when the Pack Index is absent (null/failed fetch).
  - `checks/recipes.ts` — reuses `core/recipe/validation` so the health panel
    can never contradict the recipe editor's inline badges.
  - `checks/pack.ts` — pack info, cover image, zero chapters.
- **State** — `pack-health-store.ts` (tiny zustand store; the quest editor
  pushes materialized state in; same pattern as the recipe store). Cleared when
  the pack closes so a project switch never inherits stale state.
- **UI** — `PackHealthProvider` (derives the report via `useMemo`) +
  `PackHealthTab` (verdict header + registry stats + sectioned finding lists).

The panel recomputes on **save** (and any commit that changes the pushed
state); it never runs a scan of its own.

## Trust scope (what v1 deliberately does NOT flag)

- Item-existence findings are never blocking and are suppressed entirely when
  the registry is degraded (§ above). Icon existence is **not** checked at all
  — custom texture icons are ubiquitous and a missing icon is never a broken
  reference.
- Recipes are only checked for `origin === 'authored'` — recipes discovered
  from the pack (vanilla / kubejs / crafttweaker) are not our authoring
  surface and are skipped to avoid false "blocking" verdicts.
- Item references are only checked when they are well-formed namespaced ids.
  Tags (`#…`), un-namespaced strings, and `not(...)` members of smart filters
  are skipped. If the pack's item registry has a gap, a quest may be flagged
  against a genuinely present item — a registry limitation, never a guess.
- Availability (no-recipe) findings are **sharp-scoped**: only objectives that
  assert crafting (`item_crafting`, `only_from_crafting` on
  acquisition/retrieval) are checked. A plain acquisition task with no recipe
  is never a finding — the item may be mined, looted, or obtained another way,
  and the recipe scan (data/ + kubejs/ + scripts/) cannot prove absence (a mod
  may register a recipe at runtime). Rewards and node-level `required_items`
  carry no crafting assertion and are not checked.
- Progression topology (Tier 2), mod-% / difficulty analytics (Tier 3), and
  any launch-ability judgment are out of scope by design (§9.3).

## Imported packs (the empty-registry bug)

Imported `.mrpack` packs used to extract into a `tempdir()` whose guard dropped
when the import command returned, leaving `project.path` pointing at a deleted
directory — empty item registry, no textures, no configs, and a health panel
that flagged every quest item as missing. Fixed in `feat/pack-health`:

- `imports/mrpack.rs` now extracts into a **persistent** per-import directory
  (`~/.local/share/modcanvas/imports/<name>-<short-id>`) via
  `path_safety::imported_pack_extract_dir`.
- `delete_project` removes the pack's own directory for imported packs (the old
  parent-deletion would have wiped the whole imports root).
- Packs imported before this fix still point at dead paths — re-import them.

## Wiring

- `ProjectWorkspace.tsx` renders `Health` as the first tab, wraps content in
  `PackHealthProvider`, and performs the one cover-image probe per load.
- `QuestBookEditor.tsx` pushes `graph` + `items` into `pack-health-store`.
- Tab type union lives in `hooks/useAppState.ts` and `ProjectWorkspace`.

## Files

- `frontend/src/core/pack-health/types.ts`, `index.ts`, `pack-health-store.ts`
- `frontend/src/core/pack-health/checks/{quests,recipes,pack}.ts` (+ tests)
- `frontend/src/core/pack-health/checks/quests/{structure,items,availability,shared}.ts` (+ tests)
- `frontend/src/core/pack-health/checks/topology.ts` (+ tests)
- `frontend/src/components/common/PackHealthProvider.tsx`,
  `PackHealthTab.tsx` (+ test)
- `frontend/src/services/mods.ts` — `getPackIcon` wrapper
- Styles in `frontend/src/App.css` (`.pack-health*`)
