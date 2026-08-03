# Recipe Editor

Record of the ModCanvas recipe editing surface — its architecture, guarantees,
and the exact files that own each concern.

## Status

Implementation wave "Core" is complete on the `recipesystem` branch:

- Adapter-aware item/tag search.
- Grid &harr; key conversion bugfix.
- Ingredient kinds (items + tags).
- Validation with per-field issues.
- Duplicate recipe.
- Per-recipe save (KubeJS recipes.js / CraftTweaker zs).
- Recipe list search + type filter.
- Backend `write_script_files` path fix.
- Specialized editors for the non-crafting recipe types: furnace family
  (smelting/blasting/smoking/campfire with input + output + experience + cooking
  time), stonecutting (single input → output), and smithing (base + addition).
- Paste-in JSON import (vanilla / KubeJS recipe JSON → editable recipes).
- Raw generated-script preview sash (read-only KubeJS .js / CraftTweaker .zs).
- Recipe-list polish: inline rename, per-recipe validation-status badges.
- Bulk ops: multi-select delete and drag-to-reorder recipes.
- Emitter correctness pass: camelCase serde for the recipe model + `ScriptOutput`
  so cooking time / experience survive round-trips; recipes are persisted in
  KubeJS and CraftTweaker formats via the adapter-chosen write target.
- Bidirectional loading: `scan_pack_recipes` reads existing pack recipes back
  into the editor. It walks **mod jars** (`mods/*.jar|zip` → `data/*/recipes/*.json`,
  the bulk of any real pack's recipes, marked read-only) plus the pack's own
  editable sources: vanilla `data/*/recipes/*.json`, KubeJS `server_scripts/**/*.js`
  event calls, CraftTweaker `scripts/*.zs`. Recipes are deduped by resource id
  (`ns:file`) so a pack `data/` override shadows a jar recipe with the same id.
  The Load modal groups by source file with search, source/editable/loaded
  filters, and per-group toggles.
- Non-clobber saves: authored recipes write to a dedicated
  `kubejs/server_scripts/modcanvas_recipes.js` (and
  `scripts/modcanvas_crafttweaker.zs`) so a save never overwrites a pack-author's
  own recipe files.
- Fast rescan: `recipes/cache.rs` fingerprints every recipe-bearing file
  (mods `*.jar`/`*.zip`, `data/*/recipes/*.json`, KubeJS `*.js`, CraftTweaker
  `*.zs` by path+size+mtime) and reuses the previous scan on disk when nothing
  changed — reopening Load Pack on an unchanged pack is instant.
- Last-pack persistence: the app remembers the last-selected project
  (localStorage `modcanvas:last-project-id`) and re-selects it on launch so the
  workspace returns to the same pack without a manual reopen. Reopen loads
  mods/configs from cache and the quest graph from the DB — it does NOT re-run
  the heavy ingest/FTB import.
- Lazy icons in the editor: `RecipeEditor` uses the compact instance texture
  index (`scan_instance_textures`, descriptors only) + the shared
  `texture-loader` lazy materializer instead of the legacy bulk
  `scanModJarTextures` base64 path. Opening the Recipes tab no longer pulls
  every mod texture into memory; icons resolve in batches, and a shimmer
  skeleton shows while the index loads.
- All-recipe loading: `loadRecipesFromPack` dedupes by `origin:source` (resource
  id) so distinct recipes that share an output item are NOT collapsed — every
  pack recipe loads.
- Instant tab switching: all workspace tabs stay mounted (inactive ones are
  hidden with `display: none` instead of unmounted), so switching between
  Mods/Configs/Progression/Quests/Recipes never re-runs the heavy load effects
  (texture scans, quest graph, config reads). State and loaded data persist
  across switches.

Scope stayed in the "Core" wave by explicit user choice; arbitrary-paste-JSON
import and the full vision remain future work.

## Module layout

Pure, dependency-free helpers live under `frontend/src/core/recipe/` (100%
unit-testable, no UI / IPC):

| File | Responsibility |
|------|----------------|
| `recipe-store.ts` | zustand store owning `recipes`, selected recipe, and bulk results. |
| `loader.ts` | `normalizeLoader` &mdash; folds forge/neoforge/fabric/quilt + version vectors. |
| `validation.ts` | `validateRecipe`, `hasErrors`, `hasBlockingErrors`, `issuesByPath`. |
| `grid.ts` | Pure grid &harr key conversion helpers (shaped/shapeless). |
| `specialized.ts` | Slot &harr; `ingredients[]` mapping for the non-crafting types (furnace `input`, stonecutting `input`, smithing `base`/`addition`). |
| `dnd.ts` | Drag payload contract (`application/x-modcanvas-recipe-ingredient`) serialized by the palette and read by `IngredientSlot`. |
| `json-import.ts` | Pure vanilla/KubeJS recipe JSON → `Recipe` parser (handles pre-1.20.5 `item`/`ingredients` and 1.20.5+ `id`/`ingredient`/`result` spellings; collapses alternative ingredient lists; drops smithing `template`). |
| `recipe-editor.test.ts` | Tests for validation, grid conversions, loader, specialized slots, and JSON import. |

On the backend, `src-tauri/src/recipes/` owns the reverse direction — turning
on-disk pack recipes into editable `Recipe`s:

| File | Responsibility |
|------|----------------|
| `recipes/mod.rs` | `scan_pack_recipes` orchestration (walks data/kubejs/scripts **and mod jars**; dedupes by resource id preferring pack overrides), `DiscoveredRecipe`/`RecipeOrigin` types, `scan_pack_recipes_cmd` Tauri command. |
| `recipes/vanilla.rs` | Parse `data/*/recipes/*.json` (both `item`/`ingredients` and `id`/`result` spellings; 8 types; skips smithing_trim). |
| `recipes/kubejs.rs` | Best-effort read of `event.shaped/shapeless/smelting/...` calls (balanced-paren + chain swallow for `.experience()`/`.cookingTime()`). |
| `recipes/crafttweaker.rs` | Best-effort read of `recipes.addShaped/addShapeless`, `furnace.add*`, `stonecutter.addRecipe`, `smithing.addRecipe`. |
| `recipes/cache.rs` | On-disk scan cache keyed on a fingerprint of all recipe-bearing files (path+size+mtime); invalidates automatically when any file changes. |

The frontend loads them via `services/recipes.ts:scanPackRecipes`, and
`recipe-store.loadRecipesFromPack` appends + dedupes by
`origin:source:output.item`. The `LoadPackRecipesModal` groups by source file
with per-group toggles.

`frontend/src/services/recipes.ts` is the data-access layer: `searchItems`,
`searchTags`, `generateRecipeScripts`, `writeScriptFiles`,
`scanModJarTextures`. It is consumed through the `services/api.ts` re-exports so
components never talk to IPC/Tauri directly.

Rust backend lives under `src-tauri/src/`: `scriptgen/kubejs.rs` and `models.rs`
define the recipe model and KubeJS emission; `write_script_files` is registered
in `src-tauri/src/commands/mod.rs` and now writes through `validate_project_write`
into the project's `kubejs/server_scripts/recipes.js` (previously a bug wrote to
a `/tmp` scratch path).

## Version / loader awareness

Adapters are resolved at runtime via the adapter matrix
(`frontend/src/adapters/index.ts` + `base/defaults.ts`). The UI passes the
instance's `minecraftVersion` and `modLoader` down through
`ProjectWorkspace.tsx`, and RecipeEditor uses these to:

- Choose the correct KubeJS recipe syntax paths.
- Pick the write target script (`kubejs/server_scripts/recipes.js` vs
  CraftTweaker `scripts/crafttweaker.zs`).
- Scope identifier searches to the installed loader.

The adapter surface is queried by the helper
`services/recipes-generated.ts` (extends the backend-generated `services/recipes.ts`).

## Key behaviors

- New recipe from an ingredient: dragging a palette item into the grid and
  then Save binds it; the grid reads back compact.
- Duplicate: clones the selected recipe with a fresh id.
- Per-item validation is non-blocking except grid-shape errors (marking them
  "blocking" prevents saving a broken recipe).
- CraftingGrid re-syncs from `initialGrid` when the selected recipe changes and
  suppresses its mount `onChange` so opening a recipe never marks it dirty.
- Non-crafting types route to dedicated editors through `CraftingGridPanel`
  (furnace family / stonecutting / smithing), which reuse a shared
  `IngredientSlot` drop-and-type widget backed by the `specialized.ts` helpers.
- Smithing is emitted as `[base, addition]` by the KubeJS backend
  (`event.smithing(base, addition, result)`); there is no template slot.
- Drag from the palette sets a structured `dataTransfer` payload so drops land
  reliably in any slot regardless of component state.
- The import modal, the raw-script preview, and the list bulk/reorder/rename
  are all additive; validation from `validation.ts` drives the list status
  dots and the save gate.

## Definition of done

- `npm test`, `npm run lint`, `tsc -b` all green (311 frontend tests).
- `cargo test`/`cargo build` in `src-tauri/` green.
- Any CLI flag, IPC channel, or UI node parameter added must be reflected here
  and in the matching backend/UI module.
- The release binary is rebuilt after `src-tauri/**` or `frontend/**` edits.