# Quest Editor — Animated Textures

Minecraft items, chapter icons and decorations that animate in-game (vertical frame-strip PNG + adjacent `*.png.mcmeta` animation metadata) play in the editor instead of showing as a flat sprite strip.

> **Engine-rendered icons:** icons ModCanvas's software rasterizer cannot bake
> (custom mod models, fluids, NBT-dependent looks) can be rendered by the
> in-game companion mod and cached — see [`engine-renders.md`](engine-renders.md).

## Background prefetch of all chapters

After a pack loads, the QuestBookEditor secretly warms texture materialization
for **every** chapter and group — not just the currently-active one — so
opening the Chapters/Quests screen later is instant.

- `frontend/src/services/texture-loader.ts` — `prefetchAllChapterTextures(graph, instancePath)`
  calls `collectNeededTargets(graph, null, null)` (null active chapter = walk
  every chapter/node) and queues them through the existing `requestMaterialize`
  batch pipeline. Returns the number of pending keys.
- `frontend/src/QuestBookEditor.tsx` — a `useEffect` on `packLoaded` fires the
  prefetch once per project+instance (guarded by a `useRef`), running
  invisibly in the background. The shared loading indicator (`subscribeLoadingChange`)
  reports activity, but the Quests tab stays responsive.
- Prefetch runs at low priority through the 200-key batch materializer, so it
  never blocks the UI; keys already materialized or marked not-found are
  skipped.

## Data flow

1. **Rust scan** — `scan_instance_animations_cmd` (`src-tauri/src/instance_textures.rs`) collects every `*.png.mcmeta` alongside the texture index in a single pass (`pixels.rs` `merge_archive_ex`/`merge_dir_ex` collect the `.mcmeta` files). The `.mcmeta` JSON is keyed by the same texture key form as the texture index (`attach_animations`). `CACHE_VERSION` is bumped whenever the index shape or layer semantics change; the disk cache stores `animations` alongside `by_id`.
2. **Frontend load** — `QuestBookEditor` calls `scanInstanceAnimations(instancePath)` when an instance is loaded and exposes the map via `AnimationProvider` (`animation-context.tsx`). Components read it with `useAnimationMap()` — no prop drilling.
3. **Parsing** — `animated-texture.ts` (pure, unit-tested) parses `{"animation":{frametime,interpolate,frames[],frameheight}}`. Ticks are converted to milliseconds (`50 ms/tick`); `frames[]` remapping and interpolation produce a frame order/duration schedule.
4. **Sheet preparation** — `sprite-sheet.ts` `prepareAnimatedSheet` bakes reordered/interpolated sheets onto a canvas in display order (one frame per row, top-to-bottom). Natural-order, non-interpolated sheets are animated directly.
5. **Rendering** — `AnimatedSprite` renders a CSS `steps()` background-position animation over the strip (`@keyframes quest-frame-strip` in `editor-theme.css`), falling back to a plain `<img>`/background box when the texture has no `.mcmeta`. Icons that were `<img>` tags now use `AnimatedSprite` (quest nodes, tiles, objectives, rewards, smart filter members, chapter tabs, quest detail/inspector, chapter decorations).

## Integration points

- `frontend/src/components/quest/AnimatedSprite.tsx` — shared sprite component.
- `frontend/src/components/quest/animation-context.tsx` — `AnimationProvider` / `useAnimationMap` / `animationMetaForKey`.
- `frontend/src/core/quest/animated-texture.ts` (+ tests) — pure `.mcmeta` parser and frame/timing schedule.
- `frontend/src/services/sprite-sheet.ts` — strip rebuild (baking canvas) for reordered/interpolated sheets.
- `frontend/src/QuestBookEditor.tsx` — `scanInstanceAnimations` + `AnimationProvider`.

# Quest Editor — Dependency Arrows

This document describes how dependency edges are modelled, rendered, and edited on the quest canvas.

## Data Model & Direction Semantics

FTB Quests models prerequisites as directed edges. The edge direction is **not** "visual flow":

- `edge.source` = the prerequisite quest (must be completed first).
- `edge.target` = the quest that depends on it.

An arrow drawn **A → B** therefore means *"A is required before B"* (B depends on A). This matches the FTB `deps_map` serialization, which groups `edge.source` under each `edge.target`.

Each edge carries:

- `edge_type`: `prerequisite` (default), `optional`, `alternative`, or `inverted`.
- `inverted`: boolean; flips the meaning of the arrow.

## Rendering

Edges are rendered by `DependencyEdge` (`frontend/src/components/quest/quest-edges.tsx`) as a two-layer stroke so they stay legible over any chapter background artwork:

- A dark casing (`rgba(10,12,18,0.92)`, core width + 4) provides the outline.
- A bright gold core (`#f2c94c`) carries the actual line.
- A **source dot** (`r≈4.5`, same color as the core) marks the prerequisite end.
- A **direction chevron** sits at the bezier midpoint and is rotated to point along the path tangent (source → target), so arrow direction stays readable over busy chapter artwork. Its control-point math replicates React Flow's `getBezierPath` (curvature `0.25`) via `computeEdgeGeometry` (`src/core/quest/edge-geometry.ts`), which the edge renderer and the bezier editor share.
- When an edge has manual bezier control points (`EdgeBezierData.bezier`, see "Canvas tools"), the whole path — including the chevron midpoint/tangent — is recomputed from them so curve and arrow stay in agreement.
- Edges participating in a dependency loop are drawn in bright red (`#ff6b6b`) with a red arrowhead and a "Circular dependency" tooltip.

### Hover behaviour (no blur / no pixel shift)

Hovering a quest highlights its dependency fan: the connected edges brighten to
full opacity while unrelated edges dim to 28%. This is **opacity-only** — stroke
widths stay constant and no CSS `filter` is applied. (A `filter: brightness()`
or a stroke-width jump on a node/edge inside ReactFlow's scaled viewport forces
the browser to re-rasterize that subtree at CSS-pixel resolution, which reads as
a full-canvas blur plus a sub-pixel "nudge" on hover.) The quest node itself
highlights with a gold box-shadow ring instead of a brightness filter, so the
pixelated icons never go soft.

Cycle detection (`detectCycles`) flags any edge that is part of a strongly-connected component, so users can find loops before export.

## Creating Edges

1. Toggle **Connect** in the canvas toolbar. A banner appears and quest nodes expose blue connection ports (React Flow v12 renders source handles with a bare `source` class — the connect-mode CSS targets `.react-flow__handle.source`).
2. Drag from a port on the prerequisite quest to the quest that depends on it.

Only the **source** ports are interactive in connect mode. Because React Flow is in loose connection mode, grabbing a *target* port would invert the dependency direction; hiding them makes **drag-from-A-to-B always produce "A → B"** (A required before B).

Duplicate edges and self-loops are rejected by the editor.

## Editing & Deleting Edges

- **Select:** click an edge (its glowing outline highlights, and a floating chip shows `source → target`).
- **Retarget:** drag either endpoint of a selected edge onto another quest to reconnect it.
- **Delete:** press `Delete`/`Backspace` while an edge is selected, double-click the edge, or click the ✕ on the floating chip.

## Chapter Scoping

Edges are only shown when both endpoint quests belong to the active chapter (filtered together with their nodes).

## Source Files

- `frontend/src/components/quest/quest-edges.tsx` — `DependencyEdge` renderer, `detectCycles`, `edgeTypes`.
- `frontend/src/components/quest/QuestCanvas.tsx` — connect mode, selection, reconnect, deletion, cycle styling.
- `frontend/src/QuestBookEditor.tsx` — graph mutations (`onAddEdge` / `onUpdateEdge` / `onDeleteEdge`).
- `frontend/src/components/quest/QuestCanvas.css` — edge/port/connect-mode styles.

# Quest Editor — Shape Textures (Lazy Theme Resolution)

Quest node shape backgrounds/outlines/shapes are **not** bundled with the app.
They are resolved at runtime from the instance's FTB Quests mod jar through the
same lazy texture pipeline as item icons (per AGENTS.md "No Bundling of Game
Assets").

## How it works

1. **Keys, not copies** — `frontend/src/core/quest/quest-shapes.ts` (pure, unit-tested)
   maps each canonical shape to its texture-index keys
   (`ftbquests:textures/shapes/<folder>/{background,outline,shape}.png`; `rounded_square`
   maps to the `rsquare` on-disk folder, anything unknown falls back to `circle`).
2. **Materialization** — `collectNeededTargets` (`texture-loader.ts`) includes the
   shape keys of every visible node, so they flow through the same
   `requestMaterialize` → `get_texture_files` batch pipeline as item icons.
3. **Rendering** — `QuestCanvas.tsx` resolves the keys against the materialized
   `textureIndex` via `textureDisplayUrl` (usable index value, else the
   `getMaterialized` data URL) and passes the URLs to `quest-nodes.tsx`. When all
   layers resolve, `bakeShapeTile` (`shape-textures.ts`) rasterizes the whole
   tile **once into a single square PNG at the node's display size**: the white
   `background.png` silhouette is re-filled to a neutral grey via a `source-in`
   canvas fill (the editor's grey quest background), then `outline.png` is
   composited on top at ~58% opacity — FTB's `quest_not_started_color` is white
   at 58% alpha. Quests with an explicit `color` have the outline tinted to that
   color first (`tintTexture`, exact hex via `source-in`). The resulting `<img>`
   is shown 1:1 with `object-fit: contain`, so no CSS `background-size` /
   `image-rendering` stretching can distort the geometry (gear teeth, octagon
   sides, hexagon orientation) — this is what kept circles round under WebKit
   and avoids a grey plate box behind each shape. The node adds a    `has-texture`
     modifier that disables the CSS clip-path/border fallback. The quest icon is
     sized to **2/3 of the shape**, matching the in-game icon-to-tile ratio
     (2/3 scaled by the quest's `icon_scale`) — the old 85% rendered texels
     ~28% larger than in-game. The quest's per-quest `icon_scale` (0.1 – 2.0,
     the "Icon Scale" Appearance field) multiplies the icon size too, so a 1.5× quest
     renders a 150%-sized icon exactly as it does in-game; the factor is clamped
     to the 0.1 – 2.0 range in `quest-nodes.tsx`.
 4. **Fallback (no instance textures)** — the tile uses a CSS `clip-path` per shape
    plus a `drop-shadow(0 0 0 var(--shape-color))` outline, which follows the
    clipped silhouette so the border stays visible on every side (a plain box
    border would be clipped away by the inset polygon).

If the active instance has no FTB Quests jar, shape keys are absent from the
index and nodes render with plain styling — no bundled fallbacks exist.

# Quest Editor — 3D Icon Baking

Block items and hand-modeled 3D items resolve to in-game-style isometric icons
instead of a flat single-face texture. A **software rasterizer in Rust** bakes
item/block models (parent chains, `elements`, per-face MC lighting, `display.gui`
transform) into PNG data URLs **at materialization time** — offline, deterministic,
no GPU, and no game assets ever bundled (per AGENTS.md).

## Resolution rules

- An **item** model whose *own* model defines a non-empty `elements` list resolves
  to `bake:<ns>:item/<path>` (hand-modeled 3D items like apotheosis gems).
- A **block** item whose model *chain* (this model or any `parent` ancestor) has
  `elements` resolves to `bake:<ns>:block/<path>` — but only when a texture is
  findable in the chain first (`block_texture_in_chain`), so an unbakeable
  descriptor is never emitted.
- Flat `item/generated` models still resolve to a single texture (unchanged).

### Parent references and namespaces

A model `parent` reference without an explicit namespace (`"parent": "block/cube"`)
is resolved against the **vanilla `minecraft:` namespace** — never the child
model's namespace. `Models::resolve_*`, `chain_has_elements`,
`block_texture_in_chain` and `baker::resolve` all use `split_parent_ns`
(`instance_textures/models.rs`), which defaults namespace-less parent refs to
`minecraft`. This is what lets a mod block like
`industrialforegoing:fluid_placer` parent through `base_block` into
`block/cube` (vanilla geometry) and bake into a 3D icon instead of degrading to
a flat 16px face. `split_ref` (texture refs) still inherits the child namespace —
only *parents* use the vanilla default, matching Minecraft's own resolver.

## Texture slot resolution

Block/plant models resolve icons from these `textures` slots, in order:

- Preferred: `all`, `top`, `up`, `north`, `side`, `particle`, `cross`, `fan`.
- Fallback: `bottom`, `down`, `front`, `back`, `left`, `right`, `inner`, `outer`,
  `base`, `texture`, `stem`, `planks`.

`cross`/`fan` are the standard grass/plant/vegetation slots — without them,
cross-model plants (saplings, crops, flowers) would fall back to a flat texture.

Merged texture slots follow **Minecraft semantics**: the deepest (child) model in
a parent chain overrides an ancestor on the same slot. `baker::resolve` walks
child → root and keeps the *first* definition it sees for each slot.

## Materialization flow

1. Cache miss → `models_for` + `resolve_bare_keys` insert `bake:<model_ref>` keys
   into the compact index (bare `ns:id` forms), persisted to the disk cache.
2. Frontend asks for keys → `resolve_texture_urls` sees `bake:` → `bake_icon`.
3. `bake_icon` (`materialize.rs`) resolves the merged model, decodes the textures
   it needs from the *same* index, renders via `raster::render`, and base64-encodes
   into a `data:image/png` URL.
4. No image bytes are ever stored in the cache — only `bake:` descriptor strings.
   `attach_animations` skips `bake:` keys (baked icons have no `.png.mcmeta`).

Never-materialized keys are **retried**, not permanently dropped: the frontend
texture loader tracks failure attempts per key and re-requests them on later
passes (`requestMaterialize`), so a key that failed once (e.g. because a bake
couldn't resolve its textures) can succeed after the index is refreshed.

## Rendering

`raster::render` (`instance_textures/models/raster.rs`) builds quads from faces,
backface-culls, applies `display.gui` scale→rotate→translate (center at 8,8,8),
shades per face, and alpha-composites with a z-buffer. Two quality details make
the icons look close to in-game Minecraft blocks:

- **Correct lighting**: per-face brightness matches Minecraft's block-model
  constants exactly — up 1.0, north/south 0.8, west/east 0.6, down 0.5
  (`shade:false`→1.0). The west/east darker-than-north/south contrast is what
  gives the isometric view its recognizable 3D depth; the old constants
  (north/west 1.0, east 0.8) made side faces over-bright and the cube look flat.
- **Supersampling + crisp texels**: rendering happens at 4× resolution
  (`SUPERSAMPLE`), then a **coverage-based downsample** collapses the
  `ss×ss` subsamples down to the 96×96 output. Alpha is the solid-subpixel
  coverage (anti-aliasing only the silhouette edge); the color is taken from
  the nearest solid subsample to the pixel center, so the 16px texture texels
  stay hard and pixelated instead of being smeared by a box-average. The bake
  size (96px, `OUTPUT_SIZE`) is close to the display sizes used in the UI —
  a large supersampled PNG gets smoothed by the browser's downscale and the
  pixel-art blurs.

**Display pipeline**: baked icons are crisp isometric renders baked near the
app's display sizes (64px `OUTPUT_SIZE`), and the UI renders **all** icons
(flat textures and bakes) with `image-rendering: pixelated` — nearest-neighbor
scaling. That is exactly how Minecraft icons look: small, hard, pixelated
pixels. Rendering bakes with smooth (`auto`) scaling was the source of the
"blurry 3D" report — bilinear downscale/upscale smears the 16px texels into
gradients.

Element rotations support single-axis `angle` and multi-axis `x/y/z` forms,
including the `rescale` flag (shrink by 1/√2, vanilla plant/crop behavior).

## Source files

- `src-tauri/src/instance_textures/models.rs` — `Resolved::Bake` + `resolve_bare_keys`.
- `src-tauri/src/instance_textures/models/baker.rs` — merged model resolution.
- `src-tauri/src/instance_textures/models/merge.rs` — model parsing helpers.
- `src-tauri/src/instance_textures/models/raster.rs` (+ `raster/tests.rs`) — software rasterizer.
- `src-tauri/src/instance_textures/materialize.rs` — `resolve_texture_urls` / `bake_icon`.
- `frontend/src/components/quest/QuestIcon.tsx` + `AnimatedSprite.tsx` — icon
  rendering (always `image-rendering: pixelated`).

## Edge-hover rendering note

The quest canvas previously applied `filter: drop-shadow(...)` to
`.react-flow__edge:hover .react-flow__edge-path`. A CSS `filter` on an SVG path
inside ReactFlow's transformed viewport forces the browser to rasterize that
subtree at CSS-pixel resolution (DPR 1), which made the whole canvas visibly
"go pixelated" while hovering a dependency line. The hover/selected glow is now
a plain brighter `stroke-width` bump — same visual, no compositing penalty.

# Quest Editor — Grid Snapping (In-Game Parity)

## Behavior

Quest placement snaps to a grid matching FTB Quests in-game. The editor mirrors
the in-game quest editor's placement behavior:

- **Snap grain** = `grid_scale × minSize` FTB grid units, where `grid_scale`
  comes from the pack's `data.snbt` (`grid_scale`, default `0.5`) and `minSize`
  is the smallest selected quest's width (`size.width / 24`, so a default 1.0x
  quest contributes `1`). The ATM10-style default therefore snaps to 0.5-unit
  steps.
- **Shift disables snapping** — holding Shift during a drag places objects at
  arbitrary (free) coordinates, exactly like the in-game shift behavior.
- **Group drags snap as a unit** — the selection's min corner is snapped and the
  relative offsets between selected quests are preserved, matching in-game
  `questX + (obj.pos − minCorner)`.

## Data flow

- `src-tauri/src/quest/types.rs` — `QuestGraph.grid_scale` (default 0.5).
- `src-tauri/src/imports/ftb_quests/import.rs` — parses `grid_scale` from
  `data.snbt` in `parse_global_settings`.
- `src-tauri/src/imports/ftb_quests/export.rs` — writes `grid_scale` back to
  `data.snbt` on export.
- `frontend/src/services/quest-types.ts` — `QuestGraphData.grid_scale`.
- `frontend/src/components/quest/quest-form-constants.ts` — pure
  `snapToGridStep(value, gridScale, minSize)` helper.
- `frontend/src/components/quest/QuestCanvas.tsx` — `handleNodeDragStop`
  computes the dragged selection, minSize, and group-anchor snap; commits via
  the batched `onUpdateNodes` prop (single `setGraph`, so multi-select drags
  don't clobber each other).
- `frontend/src/QuestBookEditor.tsx` — `onUpdateNodes` batched node updater.

## Icon scale (`icon_scale`) import/export

- The quest format stores the per-quest appearance field as `icon_scale` in
  both flat-chapter and subdirs layouts, with the editor allowing 0.1 – 2.0
  (default 1.0).
- `src-tauri/src/imports/ftb_quests/import.rs` reads `icon_scale`, falling back
  to the legacy `icon_scaling` key the app once emitted for subdirs layouts,
  and clamps to 0.1 – 2.0.
- `src-tauri/src/imports/ftb_quests/export.rs` always writes `icon_scale` (both
  layouts), so FTB picks the value up.
- `src-tauri/src/quest/types.rs` stores it as `icon_scaling: f64` (default 1.0);
  the node renderer multiplies the 2/3 icon size by it (see above).

## Smart filter icons (FTB Filter System parity)

A quest/reward whose item task carries a smart-filter DSL (stored in the nested
`item.components."ftbfiltersystem:filter"` data component) and no custom icon
shows an icon that **cycles through the items that actually match the filter**,
mirroring the in-game quest tile.

- `frontend/src/core/quest/smart-filter.ts` — pure parser + **matcher**
  (`smartFilterMatches` / `matchingSmartFilterItems`). Semantics match FFS's
  `FilterParser`: the DSL string is an implicit **AND** of its top-level calls
  (the RootFilter is an "All Of" compound), `and` = all children, `or` = any
  child, `only_one`/`xor` = exactly one child, `not` = none of the children,
  and `component`/`block`/`stack_size` leaves narrow without contributing
  candidates. `matchingSmartFilterItems` evaluates the filter over the scanned
  item registry — the analog of FTB's `DisplayStacksCache` (creative search tab
  ∩ matcher).
- `frontend/src/services/smart-filter-mods.ts` — holds the registered instance
  registry (`getAllRegisteredItems`, `getItemMod`).
- `frontend/src/services/smart-filter-tags.ts` — expands `tag`/`item_tag`
  members into item ids via the `resolve_item_tags` Rust command.
- `frontend/src/components/quest/SmartFilterIcon.tsx` — once the registry and
  every referenced tag/mod are loaded, cycles the first (≤48) matching item
  textures at the in-game **1 s** beat (`IconAnimation` uses
  `System.currentTimeMillis()/1000L`). A filter that matches nothing falls back
  to the generic `ftbfiltersystem:smart_filter` item, exactly like FTB showing
  the filter stack itself.

## Chapter editing

Chapter-level settings mirror the in-game chapter editor:

- Title, subtitle, icon, default quest shape, default quest size multiplier,
  default min width, progression mode, and the visibility/misc toggles
  (`always_invisible`, `default_hide_dependency_lines`,
  `hide_quest_details_until_startable`, `hide_quest_until_deps_visible`,
  `hide_quest_until_deps_complete`, `hide_text_until_complete`,
  `default_repeatable_quest`, `require_sequential_tasks`, `autofocus_id`).
- `frontend/src/components/quest/ChapterSettings.tsx` — modal opened by
  double-clicking a chapter row in `ChapterTree.tsx` (or via the hover gear
  button, or `onEditChapter`).
- `frontend/src/QuestBookEditor.tsx` — `onUpdateChapter` / `onDeleteChapter` /
  `onMoveChapter` (reorders `order_index`), wired to the modal.
- `src-tauri/src/quest/types.rs` — `QuestChapter` carries all the fields above.
- `src-tauri/src/imports/ftb_quests/import.rs` — reads the keys in both SNBT and
  JSON5 chapter parsers; chapter `default_quest_size` (a scalar multiplier in
  FTB) is converted to `QuestSize` grid units (24 = 1.0x).
- `src-tauri/src/imports/ftb_quests/export.rs` — `build_subdirs_chapter` writes
  the fields back (booleans as SNBT `Byte(1/0)`, matching FTB's output), and
  writes `default_quest_size` only when ≠ 1.0x.
- Round-trip covered by `chapter_metadata_fields_roundtrip` in
  `src-tauri/src/imports/ftb_quests/export_tests.rs`.

Note: the flat `chapters/*.snbt` export preserves an existing file's extra
metadata when the graph has none for it (read-merge-write), so chapter edits
mostly surface through the subdirs layout export.

## Progress simulation

An editor-only, ephemeral preview of FTB's in-game progression. The sim state
(`ProgressState`, a `questId → 'started' | 'complete'` map) lives in
`QuestBookEditor.tsx` and is **never serialized** to disk.

- **Core logic** — `frontend/src/core/quest/progress.ts`:
  - `computeVisibility(questId, quests, edges, progress)` mirrors FTB's
    `Quest.isVisible` chain: `visibility: never_visible`, `invisible_until_completed`,
    `hide_quest_until_deps_complete`, `hide_quest_until_all_complete`,
    `hide_quest_until_quest_complete`. The chapter-level default
    `hide_quest_until_deps_visible` applies to new quests only and is not evaluated.
  - `isLocked(questId, edges, progress)` — true while any prerequisite is
    incomplete (ALL requirement).
- **Canvas (`QuestCanvas.tsx`)** — a **Simulate** toolbar toggle arms the mode;
  hidden quests are dimmed (`sim-hidden`), locked ones get an orange badge
  (`sim-locked`), completed ones a green check (`sim-complete`). Complete All /
  Reset All act on the active chapter. Double-clicking a quest toggles its
  simulated completion.
- **Detail modal (`QuestDetailModal.tsx`)** — Complete / Reset button in the
  footer toggles a single quest.
- Pure functions are covered by `frontend/src/core/quest/progress.test.ts`.

## Global settings (`data.snbt`)

File-level defaults are now imported, editable, and exported instead of being
hardcoded (previously `export.rs` always wrote `default_reward_team: 0b`,
`default_consume_items: 0b`, `default_autoclaim_rewards: "disabled"`,
`detection_delay: 20`).

- Fields on `QuestGraph` (`src-tauri/src/quest/types.rs`):
  `default_reward_team`, `default_consume_items`, `default_autoclaim_rewards`
  (FTB `RewardAutoClaim` id: `disabled`/`enabled`/`no_toast`/`invisible`),
  `detection_delay` (int, default 20).
- Book-behavior fields (also on `QuestGraph`, parsed/exported from `data.snbt`):
  `emergency_items` (`Vec<EmergencyItem>` — id+count entries), 
  `emergency_items_cooldown` (default 300), `lock_message`, `show_lock_icons`
  (default true), `fallback_locale`, `disable_gui`, `pause_game`,
  `drop_book_on_death`, `drop_loot_crates`, `hide_excluded_quests`,
  `verify_on_load`, `default_quest_disable_jei`, and `loot_crate_no_drop`
  (`LootCrateNoDrop` — boss/monster/passive percentages). Helpers
  `EmergencyItem` and `LootCrateNoDrop` live in the same types file.
- `src-tauri/src/imports/ftb_quests/import.rs` — `parse_global_settings` reads
  them from both `data.snbt` and `data.json5`.
- `src-tauri/src/imports/ftb_quests/export.rs` — `export_ftb_quests_snbt` writes
  the graph's values back to `data.snbt`.
- `frontend/src/components/quest/book-settings.tsx` — "Global Defaults
  (data.snbt)" section: reward-team and consume-items checkboxes, autoclaim
  dropdown, detection-delay number field; "Book Behavior (data.snbt)" section:
  lock/pause/gui/drop/death/exclude/verify/JEI checkboxes, lock-message and
  fallback-locale text fields, emergency-items cooldown + per-line
  `id count` list, and the boss/monster/passive no-drop percentages.
- Round-trip covered by `global_settings_roundtrip_through_export`,
  `book_level_settings_roundtrip_through_export`, and
  `global_settings_defaults_when_absent` in `export_tests.rs`.

## Quest links (cross-chapter references)

Quest link nodes reference another quest by id (the `linked_quest` key).
ModCanvas stores them as quest nodes with
`node_type: quest_link` and a `link_target` id.

- `src-tauri/src/quest/types.rs` — `QuestNodeType::QuestLink` variant and
  `QuestNode.link_target`.
- `src-tauri/src/imports/ftb_quests/import.rs` — both the SNBT and JSON5 quest
  parsers detect `linked_quest` and produce `QuestLink` nodes.
- `src-tauri/src/imports/ftb_quests/export.rs` — `quest_to_snbt` writes
  `linked_quest` (plus position/title/size) for link nodes in both subdirs and
  flat-chapters layouts; link nodes are included in the per-chapter quest map.
- `frontend/src/components/quest/QuestCanvas.tsx` — the **Add Link** button on the
  canvas; link nodes render with a dashed shape and a text link badge
  (`quest-nodes.tsx`).
- `frontend/src/components/quest/QuestDetailModal.tsx` — the "Quest Link"
  section lets you pick the target quest from a dropdown covering every quest
  in the book.
- Round-trip covered by `quest_link_roundtrips_through_export` and
  `quest_link_no_linked_target_stays_link` in `export_tests.rs`.

## Per-quest advanced fields

The per-quest advanced settings in the live `QuestDetailModal.tsx` expose the
remaining per-quest settings that were previously model-only (and only surfaced
in the dead `inspector.tsx` legacy stack — that inspector is not
imported/bundled). They are grouped into four individually-collapsible
sections — **Appearance**, **Visibility**, **Dependencies**, **Misc** — reachable
in one click from the sticky nav chips at the top of the modal body
(`quest-detail-sections.tsx` / `quest-section-groups.tsx`):

- **Repeat cooldown** — FTB-canonical `repeat_cooldown` (plain seconds cooldown)
  + `can_repeat` tristate. Export emits `can_repeat: 1b` and
  `repeat_cooldown: <int>`; legacy `repeatability` / `repeat_time` /
  `repeat_min_delay` / `repeat_max_delay` are accepted on import as fallbacks
  (`repeat_time` is promoted to `repeat_cooldown` on the next export) and are
  never emitted.
- **Hide lock icon** — `addBool("hide_lock_icon")`, exported as `1b`.
- **Guide page** — `addString("guide_page")`, a page id string.
- **Max completable dependents** — `addInt("max_completable_dependents")`, 0 = unlimited.
- **Dependency requirement** — selector for FTB `DependencyRequirement`
  (`all_completed` / `one_completed` / `all_started` / `one_started`; default
  `all_completed`), from `DEPENDENCY_REQUIREMENTS` in `quest-form-constants.ts`.
- **Min required dependencies** — `addInt("min_required_dependencies")` (0 = none).
- **Hide lock icon / repeat cooldown / guide page / max dependents** shown in
  the Visibility / Misc sections of `QuestDetailModal.tsx`.

- `src-tauri/src/quest/types.rs` — `QuestNode` carries `repeat_cooldown`,
  `hide_lock_icon`, `guide_page`, `max_completable_dependents`,
  `min_required_dependencies`, `dependency_requirement`.
- `src-tauri/src/imports/ftb_quests/import.rs` — SNBT and JSON5 quest parsers
  read the keys above (including `dependency_requirement` dialect mapping
  `one`→`one_completed`, `started`→`all_started`).
- `src-tauri/src/imports/ftb_quests/export.rs` — `quest_to_snbt` writes them
  (booleans as SNBT `Byte(1)`, ints as SNBT `Int`, strings as SNBT `String`).
- `frontend/src/services/quest-types.ts` — `QuestNodeData` carries all six
  fields; the legacy `repeat_time` / `repeat_min_delay` / `repeat_max_delay`
  keys were removed from the frontend model.
- `frontend/src/components/quest/quest-section-groups.tsx` — grouped section
  inputs: repeat cooldown (s), Hide Lock Icon checkbox, Guide Page,
  Dependency Requirement select, Min Required Deps, Max Completable Dependents.
- `frontend/src/components/quest/QuestTileFooter.tsx` — repeatable tiles show a
  refresh icon (inline SVG) + `<cooldown>s`.
- Round-trip covered by
  `per_quest_repeat_and_visibility_fields_roundtrip` and
  `repeat_fields_export_uses_ftb_canonical_keys` in `export_tests.rs`.

## Editor toolbar

`import-export.tsx` (presentation) + `quest-toolbar-actions.ts` (save / import
side effects) render the editor's top toolbar — all controls are text or inline
SVG labels, no emoji:

- **Textures** — scan mod jar / KubeJS textures into the index.
- **Re-Index** — force a full texture re-index and quest re-import.
- **Import** — single dropdown consolidating the three FTB Quests sources:
  project directory, Prism Launcher instance (sub-view listing detected
  instances), and any other directory.
- **Book Settings** — chapter/book-level modal (`book-settings.tsx`).
- **Rewards** — weighted reward tables modal (`RewardTablesModal.tsx`).
- **Save** — one button (was previously duplicated) that saves the graph,
  exports to FTB Quests, and hot-reloads into the game via WebSocket when
  connected; the label reads `Save (Offline)` when no game is connected.
  Texture count appears as an inline SVG icon + number in the right cluster.

WebSocket server state lives in the app workspace status bar
(`statusbar.tsx`, bottom of `ProjectWorkspace`) as a status pill + **Restart**
icon button; the toolbar only surfaces the offline/save state. See
`docs/workspace-actions.md` for the workspace action layout.

## Reward tables

FTB `RewardTable` weighted pools can be edited in-app from the **Rewards**
toolbar button (`RewardTablesModal.tsx`): create/rename/delete tables,
set loot_size / empty_weight / hide_tooltip / use_title, manage weighted item
entries (add/remove, reorder, per-entry item id, count, weight), and see how
many quest rewards reference each table. Changes autosave like the rest of the
graph.

- `frontend/src/components/quest/RewardTablesModal.tsx` — the editor modal.
- `frontend/src/components/quest/import-export.tsx` — the **Rewards** button opens it
  and wraps graph mutations in `scheduleAutoSave`. (Old dead `RewardsTab.tsx`
  had a read-only table picker and is not imported.)
- Table-backed reward types (`choice`, `random`, `all_table`) show a "Reward
  Table" `<select>` in `RewardCard` (`reward-card.tsx`) instead of the
  item field row; `table_id` is written to the reward and is a fallback text
  input when no tables exist yet. `QuestDetailModal` threads `graph.reward_tables`
  into `RewardCard`.
- `reward_tables` on `QuestGraphData` round-trip import/export in the Rust
  backend (weighted pools, loot_size, empty_weight, hide_tooltip, use_title).

## Task / reward field completion

Per-objective and per-reward fields that FTB's in-game editor exposes are now
editable in the live quest form (`objective-card.tsx` / `reward-card.tsx`), with
matching SNBT/JSON5 import + export in the Rust backend:

- **Item task** — `task_screen_only`, `only_from_crafting` and
  `match_components` checkboxes (exported `task_screen_only: 1b` /
  `only_from_crafting: 1b` / `match_components: 1b`) alongside the existing
  Consume Items / Match NBT / Ignore NBT flags.
- **Kill task** — `entity_type_tag` (Entity Type Tag, FTB key `entityTypeTag`),
  `custom_name`, `nbt_filter`, and the kill count as FTB `value` (long, only
  when > 1). Legacy `tag` / `count` keys are still read on import.
- **Location task** — x/y/z + W×H×D box (`box_w`/`box_h`/`box_d`) + Ignore
  Dimension checkbox. Exports FTB-canonical `position: [I;x,y,z]` +
  `size: [I;w,h,d]` int arrays and `ignore_dimension: 1b`; legacy
  `x`/`y`/`z`/`w`/`h`/`d`/`radius` keys are read on import. Flat-chapter
  dimension-only checks still export as the `dimension` task type.
- **Advancement task** — `advancement` + `criterion` (FTB `criterion` key).
- **Stage task** — `stage` + `team_stage` (FTB `team_stage: 1b`). FTB has no
  task-level `remove` flag.
- **Task optional** — optional tasks serialize as FTB `optional_task: 1b`
  (quest-level `optional` is separate). Both `optional_task` and legacy
  `optional` are read on import.
- **Item reward** — `random_bonus` (decimal, exported `random_bonus: <f64>`)
  and `only_one` (checkbox, exported `only_one: 1b`) on the `item` reward card.
- **Command reward** — `permission_level` (int 0–4), `silent` (checkbox,
  exported `silent: 1b`) and `feedback_message` (string) on the `command`
  reward card.
- **Common reward fields** — every reward card gains Auto-Claim (`auto`
  select: enabled / disabled / no_toast / invisible) plus Team Reward,
  Exclude From Claim All, Ignore Reward Blocking and Disable Screen Blur
  checkboxes, exported as FTB `auto: "..."` / `team_reward: 1b` /
  `exclude_from_claim_all: 1b` / `ignore_reward_blocking: 1b` /
  `disable_reward_screen_blur: 1b`.

Backend: `src-tauri/src/quest/types.rs` (new `QuestObjective` / `QuestReward`
fields), `import.rs` (SNBT reads for kill tag/custom_name, item task
task_screen_only/only_from_crafting/match_components, item reward
random_bonus/only_one, command permission_level/silent/feedback_message,
common reward fields via SNBT + JSON5 struct literal), `export.rs` (kill
`entityTypeTag`/`value`/`nbt_filter`, location `position`/`size` arrays +
`ignore_dimension`, stage `team_stage`, advancement `criterion`, task
`optional_task`, item `random_bonus`/`only_one`, command
`permission_level`/`silent`/`feedback_message`, reward
`team_reward`/`auto`/`exclude_from_claim_all`/`ignore_reward_blocking`/
`disable_reward_screen_blur`). Frontend typing/defaults in `quest-types.ts`,
`quest-helpers.ts`, `quest-form-constants.ts`. Round-trip covered by
`kill_task_and_reward_bonus_fields_roundtrip` and
`location_box_stage_advancement_and_reward_common_fields_roundtrip` in
`export_tests.rs`.


## Right-click canvas context menus

Right-clicking a quest node or the empty pane opens a context menu
(`QuestContextMenu.tsx`, rendered by `QuestCanvas`), mirroring FTB's in-game
editing UX:

- **Node context menu** — Edit Quest, Rename (starts an inline rename on the
  canvas), Duplicate (copy+paste in place), Copy Quest ID, and Delete; in
  Simulate mode also Complete Selected / Reset Selected. A multi-selection
  supports bulk duplicate/delete/complete/reset. Right-clicking a node not
  currently in the selection makes it the sole operand.
- **Empty-pane context menu** — Add Quest, Add Quest Link, a "New Quest with
  Task" toggle that expands a two-column grid of every objective type (clicking
  the toggle keeps the menu compact instead of a tall 19-item list), and Paste
  Quest (disabled until a clipboard/selection exists). Placement is at the
  right-click cursor.
- Wire-up: `QuestBookEditor` `onAddQuest`/`onAddQuestLink` gained an optional
  `position`, plus a new `onAddQuestWithTask(chapterId, type, position)` that
  creates a quest pre-populated with one objective of the chosen type.
  `screenToFlowPosition` converts the cursor to an FTB grid center.

## Undo / redo

Edits are undoable via **Ctrl+Z** (undo) / **Ctrl+Y** (redo), and the canvas
toolbar's **↩ Undo / ↪ Redo** buttons (disabled when no history exists). Every
mutating graph change goes through `QuestBookEditor.commitGraph`, which pushes
the pre-mutation graph onto the app-wide shared `HistoryStore`
(`frontend/src/core/history/store.ts`, bounded to `DEFAULT_MAX_ENTRIES = 200`
entries; see `docs/history.md`) and clears the redo stack; `undo`/`redo` swap
snapshots. The initial graph load and autosave sync are intentionally not
recorded as undoable steps.

## Canvas tools

The canvas toolbar hosts a set of editing aids (`canvas-tools.tsx` presentational
components + pure logic in `src/core/quest/`):

- **Search / filter bar** — `QuestSearchBar` matches quest **label, id, subtitle
  and every objective's label/target** (`search.ts`, case-insensitive substring).
  Non-matching quests dim (`search-dim`), matches glow (`search-match`), and
  **Enter** selects the first match and flies to it (`fitView({ nodes })`).
- **Align / distribute** — `AlignDistributeControls` + `align.ts`. Buttons snap
  the selected quests' **FTB grid centers** (left/center-X/right/top/center-Y/
  bottom align; horizontal/vertical distribute). Align needs ≥2 selected,
  distribute ≥3. Results go through `onUpdateNodes` → one undoable commit.
- **Cut / duplicate** — **Ctrl+X** cuts (copies to the internal clipboard then
  deletes the selection); **Ctrl+D** duplicates (copy+paste in place). Both
  respect the read-only lock.
- **Editing-mode (read-only) toggle** — a text **View Mode / Edit Mode** toggle
  (no glyph icons). Locking disables
  node drag, connect, edge reconnect, delete, and all add/context-menu
  mutations while leaving selection, pan, zoom, search, and Simulate available.
  It is enforced at both the React Flow prop level (`nodesDraggable`,
  `nodesConnectable`, `edgesReconnectable`) and the key/context handlers.
- **Bezier control points per edge** — selecting an arrow shows a **🎀 Curve**
  button in the action chip. `EdgeBezierEditor` (rendered in the viewport
  portal) exposes two draggable handles. Control points are stored as offsets
  relative to the **handle anchors** (`QuestEdgeData.bezier` /
  `Rust QuestEdge.bezier`, anchored via `pickEdgeHandles`/`handleAnchor` in
  `edge-geometry.ts`), so a curve keeps tracking its quests when nodes move.
  Dragging streams a live preview through React Flow's local edge state and
  commits **once on pointer-up** — every drag is a single undoable step. The
  bezier is editor-only: FTB's quest format has no field for it, so it is not
  written to SNBT (and is absent after a fresh import).
- **Book-level visual presets** — the **Theme** dropdown applies a self-authored
  `BOOK_THEME_PRESETS` palette (clean-room; no FTB theme data is bundled or
  parsed). Applying one repaints every quest node's color/shape plus each
  chapter's and the book's defaults, and drives edge colors through the graph's
  `edge_color` / `edge_cycle_color` (falling back to the built-in gold/red
  constants). "Editor default" clears the overrides.
## Flat editing flows (UX)

The editor keeps common edits to one or two clicks — no nested dialogs for
frequent operations:

- **Quest modal is a single flat scroll** (`QuestDetailModal.tsx`, 266 lines):
  no internal tab switch. The header icon is clickable (hover shows a "Change"
  badge → icon picker), and the title/subtitle are inline text inputs with the
  section content flowing below. Four sticky **nav chips** (Appearance /
  Visibility / Dependencies / Misc) jump the scroll (`quest-detail-sections.tsx`);
  the settings themselves live in collapsible groups
  (`quest-section-groups.tsx`). The footer is **Done / Cancel / Delete Quest**
  (plus Complete/Reset in Simulate mode) — the old verb–noun "Save Quest" label
  is gone.
- **Inline rename on the canvas** — double-click a quest's title on the canvas
  turns it into an inline input (Enter/blur commits, Esc cancels). The node
  context menu's **Rename** item starts the same edit programmatically
  (`QuestCanvas` `renameNonce` → `quest-nodes.tsx` `onRename`). The title was
  switched from `pointer-events: none` to `auto; cursor: text`.
- **Task / reward reorder** — each objective and reward card has **↑/↓**
  buttons (`objective-card.tsx` / `reward-card.tsx` → `QuestBookEditor`
  `onMoveObjective` / `onMoveReward`, backed by `moveArrayItem` in
  `quest-helpers.ts`); buttons are disabled at the list edges and no-op moves
  skip an undo commit.
- **Chapter tree** — chapter rows gained hover **↑/↓** (reorder `order_index`)
  and a **gear** (settings) plus double-click **inline rename**
  (`chapter-node.tsx` / `ChapterTree.tsx`); the add-chapter/add-group buttons
  stay pinned above the list.
- **Shortcut cheat sheet** — the **?** canvas-toolbar button (or the **?** key,
  ignored while an input is focused) opens `keyboard-shortcuts.tsx`, listing
  canvas (pan/zoom/select/delete/undo/redo/cut/copy/paste/duplicate) and
  editing (node: add quest/link/task-toggle; modal: done/cancel; rename: enter/
  escape) shortcuts with `<kbd>` styling.
- **Compact context menu** — the "New Quest with Task" submenu is a collapsible
  toggle that expands a two-column objective-type grid instead of a tall list
  (`QuestContextMenu.tsx` `.ctx-menu-task-grid`).

All of the above is pure UI on the existing graph model — no new IPC or file
format changes.
