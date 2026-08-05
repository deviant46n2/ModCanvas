# Recipe Editor

Record of the ModCanvas recipe editing surface — its architecture, guarantees,
and the exact files that own each concern.

## Status

The recipes backlog (todo.md) is **complete**: per-recipe disable across all
origins, the RecipeExplorer with provenance groups + JEI-grammar search, an
authored-only save gate, the palette right rail with "recipes using this", a
non-destructive type picker, a script drawer with full-file/per-recipe tabs, and
bulk "Replace ingredient…". The sections below describe the surface as it is
now; the earlier "Core" wave is folded into the same file layout.

### Layout

The editor body is **Explorer (left) | Editor (center) | Palette (right)**. The
header holds the adapter badge, the opt-in **Script** drawer toggle, **Reload
Recipes**, and **Import JSON** — there is no header search (each pane owns its
own).

- **RecipeExplorer** (replaces the old `RecipeList`): splits recipes into
  **Mine** (`origin === 'authored'`, pinned top), **Pack** (loaded pack recipes
  that are editable), and **Jars** (read-only mod-jar, collapsed by default, lock
  glyph, no validation cost). Each group is its own virtualized grid with a
  count header. Filters:
  - Ownership segmented (All / Mine / Pack / Jars) and status segmented (All /
    Enabled / Disabled — "Disabled" = `isDisabled`).
  - **Needs attention** (validation error/warning) and **Changed** (authored +
    `modified` since last save) chips.
  - Type `<select>` + **JEI-grammar search** (see below).
  - Validation is memoized over authored recipes only; read-only rows get no
    status dot. Non-authored rows have an **Edit a copy** action.
- **Palette** (right rail): two tabs (Items / Tags) with its own search input and
  `filtered/total` counts. It filters the full instance item registry and local
  tag catalog locally. Every row has a **⇄ recipes using this** action that
  drives the explorer search to `>item` / `#tag`.
- **Editor** (center): `CraftingGridPanel` with a visual **type picker** (card
  per type, mini grid glyph). Switching crafting → non-crafting confirms first
  ("…keeps only the first ingredient; the pattern will be discarded"); furnace
  family ↔ stonecutting/smithing swaps are silent. Specialized editors handle the
  non-crafting types.

### Unified disable — one toggle, three mechanisms

Every explorer row has a power toggle. The mechanism is chosen by the recipe's
**origin** (`useRecipeDisable` / the pure `toggleRecipeDisable`):

1. **Authored** → flips the recipe's `disabled` flag (no IPC). Disabled authored
   recipes are **excluded from script emission**.
2. **Vanilla / mod-jar** (real registered resource id) → added to `disabledIds`;
   the emitters write `event.remove({ id: 'ns:file' })` (KubeJS) /
   `recipes.removeByRecipeName("ns:file")` (CraftTweaker) **before** the adds in
   `modcanvas_recipes.js` / `modcanvas_crafttweaker.zs`. Stale ids are dropped at
   emit time and never error.
3. **KubeJS / CraftTweaker script recipes** (synthetic ids, no in-game id to
   remove) → **comment-out the call** in the pack's own source script (`// ` on
   every line of the 1-based `LineSpan`, modifiers included), after a confirm.
   The command returns a **SHA-256 fingerprint** of the original lines; a
   **manifest entry** (`disabledScripts` in the store) persists the snapshot
   (file, lines, name, output, type, fingerprint). Re-enabling runs
   `uncomment_recipe_call`, which **strips the `//` and verifies the fingerprint
   first** — if the file was hand-edited, re-enable refuses and the user fixes it
   by hand. This is the reversible "heavy path".

**Disabled filter sources:** loaded recipes whose disable key matches, **plus**
the manifest entries themselves — after a rescan a commented-out call is gone
from the pack list, so the manifest keeps it visible (dimmed, snapshot
name/output/type) and re-enable-able. KubeJS event ordering: removes apply after
all adds in the recipe event, so they catch script-added recipes regardless of
file order (verify in-game via the companion mod — not unit-testable in Rust).

### Save gate (authored-only)

`selectSaveableRecipes` emits **only** `origin === 'authored'`, non-disabled,
non-invalid recipes. Editing a discovered pack recipe in place does **not**
persist — use **Edit a copy** first (the intended beginner flow). Saves write to
dedicated `kubejs/server_scripts/modcanvas_recipes.js` and
`scripts/modcanvas_crafttweaker.zs`, never clobbering a pack-author's files.

### JEI-grammar search (`core/recipe/filter.ts`, pure)

Whitespace-separated tokens, AND-combined:

| Token | Meaning |
|-------|---------|
| `@mod` | namespace **or** registry-mod match over output/ingredients |
| `#tag` | ingredient tag id match |
| `>id`  | output id substring |
| `<id`  | ingredient id substring (tags stripped of `#`) |
| bare   | name / output / group / type / ingredient substring, **plus tag-expanded** (`getTagMembers`) |

### Script drawer

The opt-in header **Script** button (persisted in localStorage) opens a drawer
docked under the editor with two tabs: **Full file** (all saveable recipes +
remove-by-id disables = the exact on-disk bytes the save writes) and **This
recipe** (emission for the selection only, no removes). Both are debounced
(~400ms), show the target file path + a badge, have Copy, and fall back to
`// nothing to emit`.

### Bulk "Replace ingredient…"

Multi-select (checkboxes) on explorer rows opens a bulk bar with **Replace
ingredient…**. The modal picks a **from** and **to** ingredient (item or `#tag`),
live-previews "N recipes will change" + the affected list (pure
`affectedRecipeIds`), skips non-authored selections with a note, and applies
`replaceIngredient` (every occurrence in `ingredients` and shaped `key` values)
per affected authored recipe. No new Rust emitter — the existing add-emitter
handles the mutated values.

### Comment-aware, span-aware parsers

`recipes/kubejs.rs` and `recipes/crafttweaker.rs` no longer match calls inside
`//` / `/* */` comments or string literals (so a commented-out call never
re-surfaces as active), and every parsed call returns a 1-based `LineSpan`
(start/end, modifiers included) threaded through `DiscoveredRecipe.span` and the
frontend `Recipe.sourceLines`. The shared scanner lives in
`recipes/scan.rs` (`OpaqueRegions`, line indexing). CraftTweaker's balanced-paren
matcher was fixed so `>`-terminated `<item:…>` literals no longer swallow the
closing paren.

### Also in this surface (carried forward)

- Local-only 2-tab palette + shared `ItemPickerModal`, KubeJS item indexing
  (`indexer_kubejs.rs`), MC-authentic stateless `RecipeGrid`/`RecipeSlot`/
  `OutputSlotField` (pure CSS, no bundled Minecraft assets).
- Bidirectional loading: `scan_pack_recipes` walks mod jars + vanilla `data/`
  (both `recipes/` and 1.21+ `recipe/`), KubeJS `server_scripts`, CraftTweaker
  `scripts`; dedupes by resource id preferring pack overrides; cache-aware
  (`recipes/cache.rs`) so rescans are instant. Auto-loads on pack open.
- Adapter-aware syntax/write targets, validation with per-field issues, JSON
  import, paste JSON import, duplicate, specialized editors for furnace /
  stonecutting / smithing.
- Lazy icons via the compact instance texture index + `texture-loader`;
  recipes stay per-project (store cleared on project switch).

## Module layout

Pure helpers under `frontend/src/core/recipe/` (no UI / IPC):

| File | Responsibility |
|------|----------------|
| `recipe-store.ts` | zustand store: `recipes`, selection, undo/redo, `disabledIds`, `disabledScripts` manifest, `isDisabled` dispatch, `modified` lifecycle. `partialize` persists authored recipes + disable state. |
| `filter.ts` | Pure JEI-grammar `matchesFilter` + `groupByProvenance` (Mine/Pack/Jars). |
| `bulk-replace.ts` | Pure `replaceIngredient` / `affectedRecipeIds` / `refMatches` for bulk replace. |
| `type-picker.ts` | `TYPE_OPTIONS` / `TYPE_LABELS` / `typeSwitchDiscards` / `typeSwitchConfirmMessage`. |
| `validation.ts` | `validateRecipe`, `hasErrors`, `selectSaveableRecipes` (authored-only gate). |
| `grid.ts` | `patternToGrid`/`gridToPattern`, `ingredientsToGrid`/`gridToIngredients`. |
| `tag-filter.ts` | Pure filter for the local tag catalog. |
| `specialized.ts` | Slot ↔ `ingredients[]` mapping for non-crafting types. |
| `dnd.ts` | Drag payload contract. |
| `json-import.ts` | Vanilla/KubeJS recipe JSON → `Recipe` parser. |
| `loader.ts` | `normalizeLoader` / adapter loader resolution. |

Backend, `src-tauri/src/recipes/` and `src-tauri/src/recipe_disable.rs`:

| File | Responsibility |
|------|----------------|
| `recipes/mod.rs` | `scan_pack_recipes` orchestration, `DiscoveredRecipe` (+ `span`), `RecipeOrigin`, `scan_pack_recipes_cmd`. |
| `recipes/scan.rs` | Comment/string `OpaqueRegions` scanner + line indexing shared by both script parsers. |
| `recipes/vanilla.rs` | `data/*/recipes/*.json` parser. |
| `recipes/kubejs.rs` | Comment-aware, span-aware `event.*` call reader. |
| `recipes/crafttweaker.rs` | Comment-aware, span-aware ZenScript reader. |
| `recipes/cache.rs` | On-disk scan cache (path+size+mtime fingerprint). |
| `recipe_disable.rs` | `comment_out_recipe_call` (returns SHA-256 fingerprint) / `uncomment_recipe_call` (integrity-checked) + Tauri commands. |

Emitters: `scriptgen/kubejs.rs` / `scriptgen/crafttweaker.rs` take a
`disabled_ids` list and emit removes before adds. `generate_recipe_scripts`
(commands/mod.rs) threads `disabled_ids` through.

Services: `frontend/src/services/recipes.ts` exposes `scanPackRecipes`,
`generateRecipeScripts(projectId, recipes, disabledIds)`, `writeScriptFiles`,
`commentOutRecipeCall`, `uncommentRecipeCall`, item/tag/texture access. The
disable logic is in `frontend/src/hooks/useRecipeDisable.ts` (pure core +
React wrapper).

## Version / loader awareness

Adapters are resolved via the adapter matrix
(`frontend/src/adapters/index.ts` + `base/defaults.ts`). `RecipeEditor` uses the
instance's `minecraftVersion`/`modLoader` to pick KubeJS/CraftTweaker syntax and
the write target, and resolves the default KubeJS namespace via
`getKubejsDefaultNamespace()`.

## Key behaviors

- **Disable** dispatch, **save gate**, **JEI-grammar search**, **bulk replace**,
  and **type-picker confirm** semantics are as described in Status above; the
  pure logic (`filter.ts`, `bulk-replace.ts`, `type-picker.ts`) is fully tested.
- The crafting grid is stateless (`RecipeGrid`): the editor owns the 3×3 `cells`
  and writes back through `gridToPattern`/`gridToIngredients`. Grid cells and the
  output slot open the shared `ItemPickerModal`; filled cells get a right-click
  context menu; double-click clears.
- Comment-out caveat: after commenting a call, the next `scan_pack_recipes` no
  longer returns it — the `disabledScripts` manifest keeps it in the Disabled
  filter and enables Re-enable. If the user hand-edits the file, the fingerprint
  check refuses re-enable.
- `selectSaveableRecipes` is the single source of truth for save + the Full-file
  preview tab, so the preview always matches the on-disk script byte-for-byte.

## Definition of done

- `pnpm test`, `pnpm lint`, `tsc -b` all green (533 frontend tests).
- `cargo test`/`cargo build` in `src-tauri/` green (265 lib tests).
- Any CLI flag, IPC channel, or UI node parameter added must be reflected here
  and in the matching backend/UI module.
- The release binary is rebuilt after `src-tauri/**` or `frontend/**` edits
  (`cargo tauri build --no-bundle`, the only path that embeds `frontend/dist`),
  and the binary mtime is newer than the newest changed source.
