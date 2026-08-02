# Quest Editor — Animated Textures

Minecraft items, chapter icons and decorations that animate in-game (vertical frame-strip PNG + adjacent `*.png.mcmeta` animation metadata) play in the editor instead of showing as a flat sprite strip.

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
- A **direction chevron** sits at the bezier midpoint and is rotated to point along the path tangent (source → target), so arrow direction stays readable over busy chapter artwork. Its control-point math replicates React Flow's `getBezierPath` (curvature `0.25`) via `bezierMidpoint`.
- Edges participating in a dependency loop are drawn in bright red (`#ff6b6b`) with a red arrowhead and a "Circular dependency" tooltip.

Cycle detection (`detectCycles`) flags any edge that is part of a strongly-connected component, so users can find loops before export.

## Creating Edges

1. Toggle **🔗 Connect** in the canvas toolbar. A banner appears and quest nodes expose blue connection ports (React Flow v12 renders source handles with a bare `source` class — the connect-mode CSS targets `.react-flow__handle.source`).
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
    sized to **2/3 of the shape**, matching in-game (`QuestButton.java`:
    `s = w * (2F / 3F) * iconScale`) — the old 85% rendered texels ~28% larger
    than in-game. The quest's per-quest `icon_scale` (0.1 – 2.0, the FTB editor
    "Icon Scale" Appearance field) multiplies the icon size too, so a 1.5× quest
    renders a 150%-sized icon exactly as it does in-game; the factor is clamped
    to FTB's 0.1 – 2.0 range in `quest-nodes.tsx`.
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

## Texture slot resolution

Block/plant models resolve icons from these `textures` slots, in order:

- Preferred: `all`, `top`, `up`, `north`, `side`, `particle`, `cross`, `fan`.
- Fallback: `bottom`, `down`, `front`, `back`, `left`, `right`, `inner`, `outer`,
  `base`, `texture`, `stem`, `planks`.

`cross`/`fan` are the standard grass/plant/vegetation slots — without them,
cross-model plants (saplings, crops, flowers) would fall back to a flat texture.

## Materialization flow

1. Cache miss → `models_for` + `resolve_bare_keys` insert `bake:<model_ref>` keys
   into the compact index (bare `ns:id` forms), persisted to the disk cache.
2. Frontend asks for keys → `resolve_texture_urls` sees `bake:` → `bake_icon`.
3. `bake_icon` (`materialize.rs`) resolves the merged model, decodes the textures
   it needs from the *same* index, renders via `raster::render`, and base64-encodes
   into a `data:image/png` URL.
4. No image bytes are ever stored in the cache — only `bake:` descriptor strings.
   `attach_animations` skips `bake:` keys (baked icons have no `.png.mcmeta`).

## Rendering

`raster::render` (`instance_textures/models/raster.rs`) builds quads from faces,
backface-culls, applies `display.gui` scale→rotate→translate (center at 8,8,8),
shades per face (top/north/west 1.0, south/east 0.8, bottom 0.5, `shade:false`→1.0),
and alpha-composites with a z-buffer into a 256×256 transparent PNG. Element
rotations support single-axis `angle` and multi-axis `x/y/z` forms, including the
`rescale` flag (shrink by 1/√2, vanilla plant/crop behavior).

## Source files

- `src-tauri/src/instance_textures/models.rs` — `Resolved::Bake` + `resolve_bare_keys`.
- `src-tauri/src/instance_textures/models/baker.rs` — merged model resolution.
- `src-tauri/src/instance_textures/models/merge.rs` — model parsing helpers.
- `src-tauri/src/instance_textures/models/raster.rs` (+ `raster/tests.rs`) — software rasterizer.
- `src-tauri/src/instance_textures/materialize.rs` — `resolve_texture_urls` / `bake_icon`.

# Quest Editor — Grid Snapping (In-Game Parity)

## Behavior

Quest placement snaps to a grid matching FTB Quests in-game. The editor mirrors
`QuestPanel.draw` + `QuestPanel.mousePressed`:

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

- FTB writes the per-quest appearance field as `icon_scale` (`Quest.java`
  `writeData`) in both flat-chapter and subdirs layouts, with the editor
  allowing 0.1 – 2.0 (default 1.0).
- `src-tauri/src/imports/ftb_quests/import.rs` reads `icon_scale`, falling back
  to the legacy `icon_scaling` key the app once emitted for subdirs layouts,
  and clamps to 0.1 – 2.0.
- `src-tauri/src/imports/ftb_quests/export.rs` always writes `icon_scale` (both
  layouts), so FTB picks the value up.
- `src-tauri/src/quest/types.rs` stores it as `icon_scaling: f64` (default 1.0);
  the node renderer multiplies the 2/3 icon size by it (see above).

## Chapter editing

Chapter-level settings mirror FTB's in-game chapter editor
(`Chapter.java` `fillConfigGroup` / `writeData`):

- Title, subtitle, icon, default quest shape, default quest size multiplier,
  default min width, progression mode, and the visibility/misc toggles
  (`always_invisible`, `default_hide_dependency_lines`,
  `hide_quest_details_until_startable`, `hide_quest_until_deps_visible`,
  `hide_quest_until_deps_complete`, `hide_text_until_complete`,
  `default_repeatable_quest`, `require_sequential_tasks`, `autofocus_id`).
- `frontend/src/components/quest/ChapterSettings.tsx` — modal opened by
  double-clicking a chapter in `ChapterTree.tsx` (or via `onEditChapter`).
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
- `src-tauri/src/imports/ftb_quests/import.rs` — `parse_global_settings` reads
  them from both `data.snbt` and `data.json5`.
- `src-tauri/src/imports/ftb_quests/export.rs` — `export_ftb_quests_snbt` writes
  the graph's values back to `data.snbt`.
- `frontend/src/components/quest/book-settings.tsx` — "Global Defaults
  (data.snbt)" section: reward-team and consume-items checkboxes, autoclaim
  dropdown, detection-delay number field.
- Round-trip covered by `global_settings_roundtrip_through_export` and
  `global_settings_defaults_when_absent` in `export_tests.rs`.

## Quest links (cross-chapter references)

FTB `QuestLink` nodes reference another quest by id (`linked_quest` key in
`QuestLink.java:writeData`). ModCanvas stores them as quest nodes with
`node_type: quest_link` and a `link_target` id.

- `src-tauri/src/quest/types.rs` — `QuestNodeType::QuestLink` variant and
  `QuestNode.link_target`.
- `src-tauri/src/imports/ftb_quests/import.rs` — both the SNBT and JSON5 quest
  parsers detect `linked_quest` and produce `QuestLink` nodes.
- `src-tauri/src/imports/ftb_quests/export.rs` — `quest_to_snbt` writes
  `linked_quest` (plus position/title/size) for link nodes in both subdirs and
  flat-chapters layouts; link nodes are included in the per-chapter quest map.
- `frontend/src/components/quest/QuestCanvas.tsx` — "🔗 Add Link" button on the
  canvas; link nodes render with a dashed shape and 🔗 badge
  (`quest-nodes.tsx`).
- `frontend/src/components/quest/QuestDetailModal.tsx` — the "Quest Link"
  section lets you pick the target quest from a dropdown covering every quest
  in the book.
- Round-trip covered by `quest_link_roundtrips_through_export` and
  `quest_link_no_linked_target_stays_link` in `export_tests.rs`.


