# Recipe Editor

Record of the ModCanvas recipe editing surface — its architecture, guarantees,
and the exact files that own each concern.

## Status

Implementation wave "Core" is complete on the `recipesystem` branch. The
**palette / item-picker / crafting-grid redesign** (2026-08-04) is also complete
on top of it:

- **Modrinth-backed palette search removed.** `search_items`/`search_tags`
  returned Modrinth *project* slugs, not Minecraft item ids, and were
  network-dependent. Frontend usage is gone (`services/recipes.ts` no longer
  exposes them; `hooks/useItemSearch.ts` deleted). The Rust Modrinth module
  stays — it still backs modpack import.
- **2-tab palette (Items + Tags), 100% local.**
  - **Items**: the instance item registry (`scan_instance_items_cmd`),
    virtualized, `@mod` filter, draggable rows. The old third `registry` tab
    merged into this tab.
  - **Tags**: the local tag catalog (`list_item_tags_cmd`), virtualized rows
    with id + expanded member count, draggable as `#tag`, click-to-expand
    members resolved through `requestResolveTags`/`requestMaterialize`.
  - Pure tag filtering lives in `frontend/src/core/recipe/tag-filter.ts` (tested).
- **KubeJS items indexed too.** `src-tauri/src/indexer_kubejs.rs` parses
  `event.create`/`event.register` inside `onEvent('item.registry', …)` and
  `StartupEvents.registry('item', …)` blocks (capturing chained
  `.displayName()`/`.texture()`), walking `kubejs/startup_scripts/**/*.js` +
  `server_scripts/**/*.js`. Bare ids are namespaced via the adapter's
  `getKubejsDefaultNamespace()` (default `kubejs`). The item index cache
  fingerprints these scripts, so editing one invalidates the scan.
- **Shared `ItemPickerModal`** (extracted from the deleted `JeiDrawer`): the
  item picker used by BOTH the quest editor and the recipe editor's grid/output
  slots. Items only — no tag mode. Icons resolve lazily through the texture
  index first (`textureDisplayUrl`), falling back to the registry's
  `texture_data_url`.
- **Crafting grid redesign, MC-authentic look in pure CSS** — no Minecraft
  textures bundled (AGENTS.md §6). `RecipeSlot` (48px beveled slot via borders +
  inset box-shadows + self-authored CSS dither, 32px pixel icons via
  `AnimatedSprite`, count badge **shapeless only**, `#` ribbon + member tooltip
  for tag cells, click → picker, double-click → clear, drag/drop, filled-cell
  context menu with replace/set-count/clear) + `OutputSlotField`. `RecipeGrid`
  is stateless: the editor owns cell state (`patternToGrid` for shaped,
  `ingredientsToGrid` for shapeless) and writes through
  `gridToPattern`/`gridToIngredients`. The old `syncKey`/`suppressNextEmit`
  grid hack, the duplicate output editor, the dead "Shapeless" checkbox, the
  second group input, and the 2×2 size branch are all deleted.

The "Core" wave below describes the rest of the editor:

- Adapter-aware item/tag search (now superseded by the local-only 2-tab palette).
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
  into the editor. It walks **mod jars** (`mods/*.jar|zip` → `data/*/recipe(s)/*.json`,
  the bulk of any real pack's recipes, marked read-only) plus the pack's own
  editable sources: vanilla `data/*/recipe(s)/*.json`, KubeJS
  `server_scripts/**/*.js` event calls, CraftTweaker `scripts/*.zs`. Both datapack
  folder spellings are scanned — pre-1.21 `data/<ns>/recipes/` and the 1.21+
  singular rename `data/<ns>/recipe/` (the folder was renamed in MC 1.21; scanning
  only the plural form silently found ~0 recipes on 1.21+ packs). Recipes are
  deduped by resource id (`ns:file`) so a pack `data/` override shadows a jar
  recipe with the same id.
- **Recipes auto-load on pack open**: the pack-open pipeline (`useAppState`
  `runLoadPipeline`) ends with a `recipes` stage that scans the pack and loads
  every discovered recipe into the store (origin/source/editable preserved).
  The header button is **Reload Recipes** (not a Load modal) — it re-runs the
  same cache-aware scan and merges, showing "Added N recipes" / "up to date".
  The old `LoadPackRecipesModal` selection UI was removed.
- **Multi-column recipe grid**: the recipe list is a virtualized multi-column
  grid (`react-window` `Grid`) that fills the panel height — column count
  auto-computes from width (min 260px), so a real pack's tens of thousands of
  recipes show many-per-row with no giant gap between recipe name and output.
- Non-clobber saves: authored recipes write to a dedicated
  `kubejs/server_scripts/modcanvas_recipes.js` (and
  `scripts/modcanvas_crafttweaker.zs`) so a save never overwrites a pack-author's
  own recipe files.
- Fast rescan: `recipes/cache.rs` fingerprints every recipe-bearing file
  (mods `*.jar`/`*.zip`, `data/*/recipes/*.json`, KubeJS `*.js`, CraftTweaker
  `*.zs` by path+size+mtime) and reuses the previous scan on disk when nothing
  changed — reopening / refreshing an unchanged pack is instant.
- Last-pack persistence: the app remembers the last-opened project
  (localStorage `modcanvas:last-project-id`) and re-opens it on launch with the
  full cache-aware load so the workspace returns to the same pack without a
  manual reopen. Reopen loads
  mods/configs/recipes from cache and the quest graph from the DB — it does NOT
  re-run the heavy ingest/FTB import.
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
- Per-project scoping: the recipe store is cleared when the selected project
  changes (`App.tsx` resets `useRecipeStore` on `selectedProject.id` change).
  Recipes are pack-specific; without this reset, switching packs left the
  previous pack's recipes in the persisted store, so the Recipes tab and Pack
  Health reported stale results from the prior pack.

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
| `grid.ts` | Pure grid &harr; key conversion helpers (shaped/shapeless): `patternToGrid`/`gridToPattern`, plus `ingredientsToGrid`/`gridToIngredients` for the shapeless 3-wide layout. |
| `tag-filter.ts` | Pure filter for the local tag catalog (`@namespace` + case-insensitive id substring). |
| `specialized.ts` | Slot &harr; `ingredients[]` mapping for the non-crafting types (furnace `input`, stonecutting `input`, smithing `base`/`addition`). |
| `dnd.ts` | Drag payload contract (`application/x-modcanvas-recipe-ingredient`) serialized by the palette and read by `IngredientSlot`/`RecipeSlot`. |
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

`frontend/src/services/recipes.ts` is the data-access layer: `scanPackRecipes`,
`scanInstanceItems(instancePath, kubejsNamespace?)`, `listItemTags(instancePath)`,
`scanInstanceTextures`/`scanInstanceAnimations`, `generateRecipeScripts`,
`writeScriptFiles`. It is consumed through the `services/api.ts` re-exports so
components never talk to IPC/Tauri directly.

The **item registry + tag catalog** backends:
- `src-tauri/src/indexer.rs` + `src-tauri/src/indexer_kubejs.rs` — `scan_instance_items_cmd`
  indexes jar/lang items AND KubeJS script registrations (`event.create`/`register`
  with chained `.displayName()`/`.texture()`), with a versioned on-disk cache
  fingerprinted on jars + KubeJS scripts. `mod_id` is `kubejs` for script items.
- `src-tauri/src/instance_textures/tags.rs` — `list_item_tags_cmd` returns the
  sorted `{id, member_count}` catalog (member counts expanded); `resolve_item_tags`
  stays for member expansion.

Rust backend lives under `src-tauri/src/`: `scriptgen/kubejs.rs` and `models.rs`
define the recipe model and KubeJS emission; `write_script_files` is registered
in `src-tauri/src/commands/mod.rs` and now writes through `validate_project_write`
into the project's `kubejs/server_scripts/modcanvas_recipes.js` (previously a bug wrote to
a `/tmp` scratch path).

## Version / loader awareness

Adapters are resolved at runtime via the adapter matrix
(`frontend/src/adapters/index.ts` + `base/defaults.ts`). The UI passes the
instance's `minecraftVersion` and `modLoader` down through
`ProjectWorkspace.tsx`, and RecipeEditor uses these to:

- Choose the correct KubeJS recipe syntax paths.
- Pick the write target script (`kubejs/server_scripts/modcanvas_recipes.js` vs
  CraftTweaker `scripts/modcanvas_crafttweaker.zs`).
- Resolve the default KubeJS item namespace via
  `getKubejsDefaultNamespace()` (default `kubejs`), passed to
  `scan_instance_items_cmd` so bare KubeJS ids get namespaced.

The adapter surface is queried by the helper `services/recipes.ts` (the
backend-facing data-access layer, re-exported via `services/api.ts`).

## Key behaviors

- New recipe from an ingredient: dragging a palette item into the grid and
  then Save binds it; the grid reads back compact.
- The crafting grid is **stateless** (`RecipeGrid`): `RecipeEditor` owns the
  3×3 `cells` (memoized `patternToGrid` for shaped, `ingredientsToGrid` for
  shapeless) and writes every cell edit back through
  `gridToPattern`/`gridToIngredients` into the recipe store. There is no
  internal grid state or sync hack, so opening a recipe can never mark it dirty.
- Grid cells and the output slot open the shared `ItemPickerModal` on click;
  filled cells also get a right-click context menu (replace / set count —
  shapeless only / clear). Double-click clears a cell.
- Duplicate: clones the selected recipe with a fresh id.
- Per-item validation is non-blocking except grid-shape errors (marking them
  "blocking" prevents saving a broken recipe).
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

- `pnpm test`, `pnpm lint`, `tsc -b` all green (466 frontend tests).
- `cargo test`/`cargo build` in `src-tauri/` green (229 lib tests).
- Any CLI flag, IPC channel, or UI node parameter added must be reflected here
  and in the matching backend/UI module.
- The release binary is rebuilt after `src-tauri/**` or `frontend/**` edits.