# ModCanvas — Recipes Tab: Full Tech-Spec Backlog

Implementation contract for the **Recipes tab** work: per-recipe disable (all
origins, incl. script comment-out), RecipeExplorer + filters, authored-only save
gate, palette right rail, script drawer, type picker, bulk replace.

**Status:** Backends A–C complete (span-aware comment-aware parsers; comment-out/
uncomment commands + fingerprint integrity; remove-by-id emission). Data D complete
(store disable state, authored-only save gate, `modified` lifecycle). Working: UI 1.
Locked decisions agreed 2026-08-05. This file is the
single source of truth for scope + semantics. Read fully before coding; follow
AGENTS.md (docs are code, 3-layer rule, ≤300 lines/file, rebuild + mtime verify).

---

## How to use this file

- **Work the backlog top-down; each phase is independently tackle-able and ends
  with its own tests.** Dependencies are stated per phase. Land, test, commit,
  then move on.
- "Current state" lists what is ALREADY BUILT — do not rebuild it.
- At the end: definitions, edge cases, and explicit out-of-scope items.

---

## Locked decisions (do not relitigate)

1. **Per-recipe disable, NOT output-keyed.** Disabling one stick recipe never
   disables all stick recipes.
2. **Unified disable model — one toggle, three mechanisms chosen by origin:**
   - **Authored** (ModCanvas's own): a `disabled` flag on the recipe →
     **excluded from script emission**. No file editing, no remove line.
   - **Vanilla / mod-jar** (datapack JSON): real registered id →
     `event.remove({ id: 'ns:file' })` (KubeJS) /
     `recipes.removeByRecipeName("ns:file")` (CraftTweaker), emitted into
     `modcanvas_recipes.js` before the adds.
   - **KubeJS / CraftTweaker script recipes**: **comment out the call** in the
     pack's own source script (`//` each line of the call) — precise, reversible
     via a persisted manifest. The "heavy path".
3. **Save gate = authored-only.** `selectSaveableRecipes` emits only
   `origin === 'authored'` (and not disabled, not invalid) recipes. Editing a
   pack recipe in place does NOT persist — "Edit a copy" first (the intended
   beginner flow).
4. **Scope = P0 + P1 + the full disable system** (big backlog, one item at a time).
5. **Palette moves to the right rail.** One search per pane (Explorer owns
   recipe search; palette has its own small input). Header search/tabs deleted.
6. **JEI-grammar search** in the Explorer: `@mod`, `#tag`, `>output`, `<input`,
   tag-expanded bare text. Pure logic in `core/recipe/filter.ts`.
7. Existing design system stands (dark + gold accent + mono ids). No bundled
   Minecraft assets. App stays 100% offline/deterministic.

---

## Current state (already built — do NOT redo)

- Local 2-tab palette (Items + Tags), KubeJS item indexing (`indexer_kubejs.rs`),
  `list_item_tags_cmd`, shared `ItemPickerModal`, adapter
  `getKubejsDefaultNamespace()`, MC-authentic stateless `RecipeGrid`
  (`RecipeSlot`, `OutputSlotField`), opt-in full-file script preview w/ Copy.
- **Recipe model** (`frontend/src/core/recipe/recipe-store.ts`):
  `{ id (resource id for discovered / "recipe_<ts>_<rand>" for authored), type,
  name, group?, pattern?, key?, ingredients?, output, experience?, cookingTime?,
  category?, origin? ('vanilla'|'kubejs'|'crafttweaker'|'authored'), source?
  (absolute FILE PATH) }`. `RecipeIngredient { item; count?: number|null; tag?;
  nbt? }`. **`editable?: boolean` is sent by the backend but NOT declared in
  `Recipe`** — add it. `editable === false` ⟺ read-only mod-jar.
- Backend `scan_pack_recipes` (`recipes/mod.rs`) walks data/kubejs/scripts +
  jars; emits `DiscoveredRecipe { recipe, origin, source (file path), id
  (ns:file), editable }`; dedupes by resource id.
- Parsers `recipes/kubejs.rs` (`parse_kubejs_scripts`) + `recipes/crafttweaker.rs`
  (`parse_crafttweaker`) return `Vec<Recipe>`; each computes the call's byte
  range (`m.start()..end`, chains included) but throws it away.
- Emitter `scriptgen/{kubejs,crafttweaker,mod}.rs`:
  `generate_script_strings(recipes, pack_name) -> (kubejs, ct)`.
  Command `generate_recipe_scripts(project_id, recipes) -> ScriptOutput { kubejs,
  crafttweaker }` at `commands/mod.rs:208`. `write_script_files` writes
  `kubejs/server_scripts/modcanvas_recipes.js` + `scripts/modcanvas_crafttweaker.zs`.
- Save: `useRecipeSave.ts` → `selectSaveableRecipes` (currently
  `output.item && !hasErrors`) → `generateRecipeScripts` → `writeScriptFiles`.
- Preview: `RecipeScriptPreview.tsx` + `useRecipeScripts.ts` (debounced 400ms,
  full-file, Copy, file path). Opt-in via header "Script" toggle (localStorage
  `modcanvas:recipe-script-preview`).
- Store `partialize` persists only `!origin || origin === 'authored'` recipes.
- Grid: stateless `RecipeGrid`/`RecipeSlot`/`OutputSlotField`; `CraftingGridPanel`
  currently uses a type `<select>`.

Key files: `frontend/src/RecipeEditor.tsx`,
`frontend/src/components/recipe/{RecipeList,RecipePalette,CraftingGridPanel,
RecipeScriptPreview,CraftingGrid,RecipeSlot,OutputSlotField}.tsx`,
`frontend/src/core/recipe/{recipe-store,validation,grid}.ts`,
`frontend/src/hooks/{useRecipeSave,useRecipeScripts,useInstanceTextures}.ts`,
`frontend/src/services/{recipes,item-registry,smart-filter-tags,api}.ts`;
`src-tauri/src/{recipes/{mod,kubejs,crafttweaker}.rs, scriptgen/{mod,kubejs,
crafttweaker}.rs, commands/mod.rs}`.

---

# BACKLOG

## Backend A — Comment-aware, span-aware recipe parsers

**Why:** prerequisite for script comment-out; also a genuine bug fix (the parsers
currently match `event.shaped(` / `recipes.addShaped(` even INSIDE `//` comments,
so commented-out calls re-surface as active recipes in real packs).

- `recipes/kubejs.rs::parse_kubejs_scripts` + `recipes/crafttweaker.rs::parse_crafttweaker`:
  - **Skip comments** while scanning: line comments `//…` and block comments
    `/* … */` must not produce matches. Add a comment-aware tokenizer that
    advances past comment regions (string literals are already handled).
  - **Return spans**: change return type to `Vec<ParsedRecipe>` where
    `ParsedRecipe { recipe: Recipe, lines: Option<LineSpan> }` and
    `LineSpan { start: u32, end: u32 }` = 1-based line range covering the whole
    call INCLUDING swallowed `.modifier(...)` chains. Derive from the byte range
    (`m.start()..end`) by counting newlines.
  - Keep the tolerant best-effort contract: unparseable lines → skipped.
- Thread spans up: `recipes/mod.rs` → `DiscoveredRecipe` gains
  `span: Option<LineSpan>`; `scan_pack_recipes` fills it for kubejs/ct sources
  (vanilla/jar → `None`, they don't need it).
- Frontend: `Recipe` gains `sourceLines?: { start: number; end: number }`
  (and `editable?: boolean` — do it here, Phase 2 of the old plan).
- **Tests (Rust):** commented-out calls are NOT parsed; spans are correct for
  single-line and multi-line chained calls; block comments skipped; string
  literals containing `event.` or `//` untouched.

## Backend B — Comment-out / uncomment commands

New module `src-tauri/src/recipe_disable.rs`.

- `comment_out_recipe_call(project_path, file, start_line, end_line) -> Result<()>`:
  validate `file` under project root (`validate_project_write`); read file;
  prepend `// ` to every line in `[start_line, end_line]`; write back atomically
  (`atomic_write_str`). Every other byte preserved.
- `uncomment_recipe_call(project_path, file, start_line, end_line, fingerprint) -> Result<()>`:
  read the current lines; verify integrity first: strip one leading `//` (+ one
  optional space) from each line, hash the result, and compare to `fingerprint`
  (a SHA-256 of the ORIGINAL pre-comment lines, hex). Mismatch → error ("file was
  edited since — fix by hand"). Then write back atomically.
- `LineSpan` validation: start/end within file bounds, start ≤ end.
- Register commands in `lib.rs`:
  `comment_out_recipe_call(project_id, file, start_line, end_line)` and
  `uncomment_recipe_call(project_id, file, start_line, end_line, fingerprint)`.
- **Tests (Rust):** comment/uncomment round-trip preserves other lines; off-root
  file rejected; out-of-range lines rejected; fingerprint mismatch refuses.
- Frontend service: `services/recipes.ts` `commentOutRecipeCall(...)` /
  `uncommentRecipeCall(...)`.

## Backend C — Emitter: remove-by-id emission

- `scriptgen/mod.rs::generate_script_strings(recipes, disabled_ids: &[String],
  pack_name)` — thread through.
- `scriptgen/kubejs.rs`: inside `ServerEvents.recipes(event => {`, BEFORE the
  adds, emit one line per disabled id:
  ```js
  // Disabled by ModCanvas
  event.remove({ id: 'ns:file' })
  ```
  Drop ids not present in the passed recipes' id set (stale ids never error).
- `scriptgen/crafttweaker.rs`: emit `recipes.removeByRecipeName("ns:file");`
  before adds.
- `commands/mod.rs::generate_recipe_scripts(project_id, recipes,
  disabled_ids: Vec<String>)` — new param, pass through. `ScriptOutput` unchanged.
- **Tests (Rust):** removes precede adds (both emitters); stale id dropped;
  empty disabled list = unchanged output (existing tests stay green).

## Data D — Store disable state + authored-only save gate + model

`frontend/src/core/recipe/recipe-store.ts` + `validation.ts`:

- `Recipe` gains: `editable?: boolean`, `sourceLines?: { start; end }`,
  `disabled?: boolean` (authored only).
- Store state + actions (all persisted via `partialize`, independent of the
  recipe list so they survive rescans):
  - `disabledIds: string[]` — resource ids for remove-by-id disables.
  - `disabledScripts: DisabledScriptEntry[]` — comment-out entries:
    `{ file, startLine, endLine, name, outputItem, type, fingerprint }`.
  - `disabledAuthorizedIds: string[]` — authored recipe ids that are disabled
    (alternatively the `disabled` field on the recipe; pick ONE — recommended:
    the `disabled?: boolean` field, already persisted since authored recipes
    persist).
  - Actions: `toggleDisableById(id)`, `addDisabledScript(entry)`,
    `removeDisabledScript(file, startLine)`, `toggleDisableAuthored(id)`,
    `isDisabled(recipe): boolean` (dispatch on origin kind).
- `validation.ts::selectSaveableRecipes(recipes)` →
  `recipes.filter(r => r.origin === 'authored' && r.disabled !== true &&
  r.output.item && !hasErrors(validateRecipe(r)))`. Update doc comment.
- `addRecipe`: `origin: 'authored'`, `editable: true`, `disabled: false`.
- `duplicateRecipe`: `{ ...recipe, id: <new>, name: '<name> (copy)',
  origin: 'authored', editable: true, source: undefined, disabled: false }`.
- Add `modified?: boolean` to `Recipe`: set `true` in `addRecipe`/`duplicateRecipe`
  and in `updateRecipe` ONLY when target is authored; `markClean` clears it on
  all authored (powers "Changed" filter).
- `useRecipeSave.ts` / `useRecipeScripts.ts` / `RecipeScriptPreview.tsx`: pass
  `disabledIds` (from store) into `generateRecipeScripts` so preview matches the
  on-disk file.
- **Tests (FE):** `selectSaveableRecipes` excludes non-authored + disabled +
  invalid; includes authored; `duplicateRecipe` strips origin/source; store
  disable actions + persistence shape; `modified` lifecycle.

## UI 1 — RecipeExplorer (replaces `RecipeList.tsx`)

Left pane. Owns search + ALL filters.

- **Provenance grouping:** split `recipes` into **Mine** (`origin === 'authored'`,
  pinned top), **Pack** (`origin !== 'authored' && editable !== false`), **Jars**
  (`editable === false`, **collapsed by default**, lock glyph, own max-height
  scroll). Headers show counts. Each section = its own react-window `Grid`; the
  jars grid mounts only when expanded.
- **Filters:**
  - Ownership segmented: All / Mine / Pack / Jars.
  - Status segmented: All / Enabled / Disabled (Disabled = `isDisabled(recipe)`).
  - Toggle chips: **Needs attention** (validation error/warning) · **Changed**
    (`origin === 'authored' && modified`).
  - Type `<select>` (existing `TYPE_OPTIONS`).
  - Search input (JEI grammar).
  - Empty states: "No recipes match" vs "No recipes yet — start one" (Add /
    Copy a recipe / Import JSON hints).
- **Search grammar → `core/recipe/filter.ts`** (pure, tested). Signature:
  ```ts
  interface FilterDeps {
    isDisabled: (r: Recipe) => boolean;      // store dispatch
    getTagMembers: (tagId: string) => string[]; // getTagItems (injected)
    modItemIds: (mod: string) => Set<string>;   // registry mod_id → item ids
    hasIssues: (r: Recipe) => boolean;          // memoized validateRecipe
  }
  matchesFilter(recipe, { query, ownership, status, attention, changed, type }, deps): boolean
  ```
  Grammar (tokens AND): `@mod` (namespace OR registry-mod match), `#tag`
  (ingredient tag id match), `>id` (output substring), `<id` (ingredient
  substring, incl. tags stripped of `#`), bare text (name/output/group/type/
  ingredient id substring) PLUS tag-expanded (`getTagMembers` includes the text).
- **Perf:** memoized `Map<recipeId, {hasError,hasWarning}>` (useMemo over
  authored recipes only); **skip `validateRecipe` for read-only rows entirely**
  (neutral "read-only" glyph, no status dot). Replaces per-cell `statusOf`.
- **"Edit a copy"** hover/context action on non-authored rows →
  `duplicateRecipe` → `selectRecipe(copyId)`.
- **Tests (FE):** `filter.ts` every token + tag expansion + each filter dim +
  combined queries.

## UI 2 — Disable toggle + Disabled filter + manifest re-enable

Builds on Backend A/B/C + Data D.

- Disable toggle (switch or context-menu item) on EVERY row; mechanism chosen by
  `isDisabled` dispatch:
  - authored → toggle `disabled` flag (no IPC).
  - vanilla/jar → `toggleDisableById(id)` (emitter handles it; no IPC).
  - kubejs/ct → **confirm dialog** ("ModCanvas will comment out this recipe in
    `<file>` (lines N–M). Reversible.") → `commentOutRecipeCall` IPC →
    `addDisabledScript(entry)` (fingerprint from current lines) →
    mark the in-memory recipe disabled.
- Disabled visual state: dimmed + "Disabled" chip on the row.
- **Disabled filter sources:** loaded recipes whose disable-key matches AND
  `disabledScripts` manifest entries (after a rescan, commented-out recipes are
  gone from the list — the manifest keeps them visible, dimmed, with output
  icon/name from the snapshot).
- **Re-enable:** on manifest entries → `uncommentRecipeCall` IPC (integrity
  check) → `removeDisabledScript`. On loaded recipes → toggle the flag/id.
- **Tests (FE):** store dispatch per origin; IPC wiring via a mocked
  `services/recipes.ts`.

## UI 3 — Single search / header cleanup

- `RecipeEditor.tsx`: delete header search input, `.search-tabs` (Items/Tags),
  `activeSearchTab`, header `searchQuery`. Remove `filterRegistryItems`/
  `filterTagCatalog` usage there (palette filters itself).
- Explorer owns recipe search (UI 1); palette owns its own (UI 4).

## UI 4 — Palette → right rail + "recipes using this"

- `RecipeEditor.tsx` body: **Explorer (left) | Editor (center) | Palette (right)**.
- `RecipePalette.tsx`: receives FULL `items`/`tags` (+ `instancePath`,
  `getTextureUrl`, `onDragStart`); internal `query` state filters with
  `filterRegistryItems`/`filterTagCatalog`; shows `filtered/total`; small search
  input at top. Adds `onShowRecipesUsing(itemOrTagId)` — icon on item rows and
  tag rows (`#tag` id for tags).
- **Reverse index** in `RecipeEditor` (memoized over `recipes`):
  `Map<itemId | "#tagId", Set<recipeId>>` from outputs + ingredients. Offline,
  cheap.
- Explorer search becomes **controlled**: lift `explorerQuery` to `RecipeEditor`;
  `onShowRecipesUsing` sets it to `>id` / `#tag`.

## UI 5 — Non-destructive type picker (`CraftingGridPanel.tsx`)

- Replace the type `<select>` with visual type cards (mini grid glyph + label per
  `RecipeType`).
- Confirm when a switch discards data: shaped/shapeless →
  smelting/blasting/smoking/campfire/stonecutting/smithing (pattern discarded,
  ingredients truncated to 1 / 2 for smithing). Furnace-family ↔ stonecutting/
  smithing: safe, no confirm.
- Confirm copy: "Switching to Smelting keeps only the first ingredient; the
  pattern will be discarded. Continue?"
- Write stays `updateRecipe(id, { type })`.

## UI 6 — Script drawer + per-recipe tab

- Move `RecipeScriptPreview` into a drawer docked under the Editor (toggle stays
  the header "Script" button).
- Tabs: **Full file** (all `selectSaveableRecipes` + `disabledIds` = exact on-disk
  bytes) · **This recipe** (`generateRecipeScripts(projectId, [selected], [])`).
- Keep badge, file path, Copy, debounce, "// nothing to emit" fallback.
- Delete the `dragged-preview` card; shrink/remove the `recipe-detail` aside.

## UI 7 — Bulk "Replace ingredient…" (editable scope)

- Only on **Mine** multi-select. Non-authored selected rows skipped w/ note
  ("N read-only skipped — use Edit a copy").
- "Replace ingredient…" → panel: from-ingredient picker (item or tag) + to-ingredient
  picker → live preview "N recipes will change" + affected list (via reverse
  index) → Apply.
- Apply: `updateRecipe` per affected authored recipe, replacing every occurrence
  of `from` in `ingredients` (and `key` values for shaped) with `to`. Mutating
  actual values → existing add-emitter handles emission; **no new Rust emitter**.

## VERIFY — Tests, docs, rebuild

- Frontend: `pnpm test`, `pnpm lint`, `tsc -b` green (new tests per phase).
- Rust: `cargo test` green (new tests per phase).
- Docs (AGENTS.md: docs are code): rewrite `docs/recipe-editor.md` — explorer +
  filters, unified disable (3 mechanisms), authored-only save gate, palette rail,
  script drawer, JEI grammar, type picker, bulk replace, comment-out caveat.
- Rebuild: `cargo tauri build --no-bundle` (ONLY path that embeds frontend);
  verify binary mtime newer than newest changed source.
- Update this file's Status header to COMPLETE (per phase, not just at the end).

---

## Definitions & edge cases

- **Resource id** = `recipe.id` for discovered recipes (`ns:file`). Only
  vanilla/jar + authored (with ModCanvas's own emitted ids where applicable)
  have ids that exist in-game → remove-by-id. KubeJS/CraftTweaker recipes have
  synthetic ids → comment-out.
- **Authored** = `origin === 'authored'`; persisted; emitted on save; disabled
  authored are excluded from emission.
- **Editable vs read-only** = `editable` (`false` ⟺ mod-jar) → "Jars" group.
- **Modified** = authored + edited/created since last save; cleared by
  `markClean`; powers "Changed".
- **Comment-out caveat:** after commenting a script call, the next `scan_pack_recipes`
  no longer returns that recipe — the `disabledScripts` manifest keeps it visible
  in the Disabled filter and enables Re-enable. Manifest entries are
  best-effort: if the user hand-edits the file, the fingerprint check refuses
  re-enable.
- **KubeJS event ordering:** `event.remove()`/`removeByRecipeName` apply after
  all adds in the recipe event, so disables from `modcanvas_recipes.js` catch
  script-added recipes regardless of file order — verify in-game via the
  companion mod (NOT unit-testable in Rust).
- Stale disabled ids are dropped at emit time; never error.

## Out of scope / follow-ups (do not build without asking)

- Detect-from-pack disable scanning (`event.remove`/CraftTweaker remove parsing,
  empty-ingredient datapack overrides, recipe conditions).
- `event.replaceInput`/`replaceOutput` emission (pack-wide replace) and
  comment-out-based `replace` in scripts.
- Non-mutating remove-by-id for named KubeJS (`.id()` capture) / named
  CraftTweaker recipes (name capture) as an alternative to comment-out.
- "What disabled this" readout in the recipe detail.
- Inline type-to-filter cell popover (replacing `ItemPickerModal`).
- Recipe templates, shortcut cheat sheet, Ctrl+K command palette,
  `-exclude`/`"exact"` operators, per-origin collapse persistence.
- NBT/data-component, gamerule/skill, or per-version filters.
