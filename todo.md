# ModCanvas — Implementation TODO

Task tracker for the **Recipes tab / item picker / crafting-grid redesign**.
Status: complete (all phases landed 2026-08-04; docs + release binary rebuilt).
Check this file before/after each change — it is the source of truth for scope.

## Locked decisions

- **Kill the Modrinth-backed palette search.** `search_items`/`search_tags`
  (`mod_intel.rs`) return Modrinth *project* slugs, not Minecraft item ids — the
  Items/Tags tabs were broken + network-dependent. Frontend usage is removed;
  the Rust Modrinth module stays (used by modpack import).
- **Palette = 2 local tabs:** **Items** (local instance registry, virtualized,
  `@mod` filter, draggable) + **Tags** (local `resolve_item_tags` index,
  draggable as `#tag`, click-to-expand). The old `registry` tab merges into
  Items.
- **Index KubeJS-registered items too** (`event.create`/`event.register` in
  `kubejs/startup_scripts` + `server_scripts`) — not just jars.
- **Bare KubeJS ids are namespaced via the adapter** —
  `IMinecraftVersionAdapter.getKubejsDefaultNamespace()` (default `kubejs`),
  passed from the frontend to `scan_instance_items_cmd`.
- **One shared item picker modal** (`ItemPickerModal`, extracted from
  `JeiDrawer`) used by BOTH the recipe editor and the quest editor. **Items
  only** — no tag mode in the modal.
- **Crafting grid redesign, MC-authentic look in PURE CSS** — no Minecraft
  textures bundled (AGENTS.md §6). Bevel/highlight/dither via borders,
  box-shadows, gradients. Pixel icons are runtime-only (descriptor index).
- **Fully controlled grid:** `RecipeGrid` is stateless; `RecipeEditor` owns
  cell state via memoized `patternToGrid` / `ingredients`; the
  `syncKey`/`suppressNextEmit` hack is deleted.
- **Click-only interaction** on slots (no keyboard nav this pass).
- **Grid + output slot only** get the new slot look; specialized editors
  (furnace/stonecutting/smithing) restyle later.
- Defaults I picked (user OK'd): slot size 48px, output inline to the right of
  the grid with an arrow, tag cells = accent border + `#` ribbon + id text.

## Phase 1 — Backend: KubeJS item indexing (`src-tauri/src/indexer.rs`)

- [x] `parse_kubejs_item_registrations(content)` — balanced-paren scan for
  `*.registry('item', …)` / `onEvent('item.registry', …)` blocks, then
  `event.create('id')` / `event.register('id')` inside them; capture chained
  `.displayName('…')` and `.texture('ns:path')`.
- [x] Walk `kubejs/startup_scripts/**/*.js` + `kubejs/server_scripts/**/*.js`
  (existing `walkdir`).
- [x] `scan_instance_items_cmd` gains `kubejs_namespace: Option<String>`; bare
  ids get it. Emit `ItemRegistryEntry { id, name, mod_id: "kubejs",
  texture_data_url }` — texture from `.texture()` ref against the scanned jar
  `all_textures` map when possible, else `None` (fallback icon).
- [x] **Cache correctness:** add kubejs script fingerprints (path+size+mtime,
  mirroring `recipes/cache.rs`) to `ItemIndexerCache`; bump cache version so
  existing caches rescan once; `load_cache` validates them (script edit
  invalidates).
- [x] Rust tests: parser (create/register/displayName/texture, old + new
  event APIs) + cache invalidation on script change.

## Phase 2 — Backend: tag catalog (`src-tauri/src/instance_textures/tags.rs`)

- [x] `list_item_tags(instance_path) -> Vec<TagInfo>` — sorted `{id,
  member_count}` from `TagIndex.raw` keys.
- [x] Register `list_item_tags` command in `src-tauri/src/lib.rs`.
- [x] Keep `resolve_item_tags` for member expansion (frontend infra already
  exists in `smart-filter-tags.ts`).
- [x] Rust tests for listing.

## Phase 3 — Frontend: palette restructure (kill Modrinth search)

- [x] `services/recipes.ts`: remove `searchItems`/`searchTags`/`getItemDetails`;
  add `scanInstanceItems(instancePath, kubejsNamespace?)` and
  `listItemTags(instancePath)`.
- [x] Delete `frontend/src/hooks/useItemSearch.ts`; remove its wiring in
  `RecipeEditor.tsx`.
- [x] `pack-health-store.ts`: add `setItemRegistry`.
- [x] `RecipeEditor.tsx`: on mount, if store registry is empty →
  `scanInstanceItems` → `setItemRegistry` (decouples from quest editor).
  `activeSearchTab: 'items' | 'tags'`. Tags list from `listItemTags`, filtered
  client-side.
- [x] `RecipePalette.tsx`: 2 tabs — Items (reuse virtualized `RegistryRow`,
  draggable) + Tags (virtualized rows: id + member count, draggable as `#tag`,
  click-to-expand members via existing `requestResolveTags`/`requestMaterialize`).
- [x] Extract pure tag-list filter into `core/recipe/` (+ test).

## Phase 4 — Frontend: shared item picker modal

- [x] New `frontend/src/components/common/ItemPickerModal.tsx` extracted from
  `JeiDrawer.tsx` (icon grid, `@mod` filter, hover tooltip, virtualized).
  Icons: lazy `textureDisplayUrl(textureIndex, key)` first, `texture_data_url`
  fallback — lazy-first so it doesn't deepen the base64 dependency. Props:
  `{ items, onSelect, onClose, getTextureUrl? }`.
- [x] Delete `JeiDrawer.tsx`; update `QuestBookEditor.tsx` to use
  `ItemPickerModal` (no behavior change).

## Phase 5 — Adapter

- [x] `IMinecraftVersionAdapter.getKubejsDefaultNamespace()` in
  `adapters/types.ts` + `adapters/base/defaults.ts`; default `kubejs`.
- [x] `RecipeEditor`/`QuestBookEditor` pass it to `scanInstanceItems`.

## Phase 6 — Crafting grid redesign

- [x] New `RecipeSlot` cell component (shared look): 48px slot, MC bevel via
  borders + `inset` box-shadows + self-authored CSS dither, pixel icons at 32px
  via `AnimatedSprite` (animated textures free), count badge bottom-right
  (**shapeless only** — shaped pattern keys can't carry counts), tag slots =
  accent border + `#` ribbon + truncated id + member tooltip (via
  `resolveItemTags`), focus ring, click → picker, double-click → clear, drag
  handlers. CSS in `RecipeEditor.css` (no images).
- [x] Rewrite `CraftingGrid.tsx` as stateless `RecipeGrid`: props
  `{ cells, shapeless, onCellChange(row,col,ing), onRequestPick(row,col),
  getTextureUrl }`. Grid → arrow → output slot, output slot clickable (icon +
  count) with text/count inputs beside it.
- [x] `RecipeEditor` owns cells (memoized `patternToGrid` for shaped,
  `ingredients` for shapeless); write through existing `handleGridChange`.
  Delete the `syncKey`/`suppressNextEmit` hack + internal grid state.
- [x] Delete dead UI: the grid's duplicate output editor, dead "Shapeless"
  checkbox, second group input, `RecipeOutputEditor`, 2×2 size branch.
- [x] Shared `OutputSlotField` (text + count + pick button + slot icon) for the
  grid panel's output. (Specialized editors adopt it later; their restyle is
  out of scope this pass.)
- [x] Click-to-pick wiring: grid cells + output slot open `ItemPickerModal`
  (from Phase 4). Filled cell context menu: replace / clear / set count.

## Phase 7 — Tests, docs, rebuild

- [x] Frontend: `pnpm test`, `pnpm lint`, `tsc -b` green; new tests for pure
  tag filter + grid conversions.
- [x] Rust: `cargo test` green (Phases 1–2 tests).
- [x] Docs (AGENTS.md: docs are code): update `docs/recipe-editor.md` — 2-tab
  palette, local-only search, shared `ItemPickerModal`, KubeJS item indexing,
  `list_item_tags` command, adapter method, grid redesign. Also update
  `featureparity.md` / `README.md` if they reference the Modrinth search.
- [x] Rebuild via `cargo tauri build --no-bundle` (only path that embeds
  frontend); verify binary mtime newer than last edit before marking complete.

## Key reference points

- Recipe editor root: `frontend/src/RecipeEditor.tsx`
- Palette: `frontend/src/components/recipe/RecipePalette.tsx`
- Grid (to be rewritten): `frontend/src/components/recipe/CraftingGrid.tsx` +
  `CraftingGridPanel.tsx` + `CraftingGrid.css`
- Item picker to extract: `frontend/src/components/jei/JeiDrawer.tsx`
- Item registry backend: `src-tauri/src/indexer.rs` (`scan_instance_items`)
- Tag index backend: `src-tauri/src/instance_textures/tags.rs`
- Tag frontend service: `frontend/src/services/smart-filter-tags.ts`
- Pack-health store (registry coupling): `frontend/src/core/pack-health/pack-health-store.ts`
- Lazy texture materializer: `frontend/src/services/texture-loader.ts`
- Adapter matrix: `frontend/src/adapters/`
