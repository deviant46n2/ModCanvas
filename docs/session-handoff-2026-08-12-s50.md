# Session Handoff — s49 walk continuation: canvas/parity fixes (2026-08-12, s50)

**Branch:** `master` (solo mainline). 20 files (16 modified, 4 new), 164+ insertions,
all uncommitted at session start, committed this handoff. 453 Rust + 724 frontend
tests green (was 718 — +6 new tests). Integrity: the standing 3 (RecipeEditor
PARK, stale release binary, 7cc7263 doc CANDIDATE) — nothing new.

This session resumed the s49 walk (intro template quests in-app). The walk paid
out hard: eight fixes, one calibration left in progress.

## What shipped

1. **Guided-quest wizard spawn** (s49-followup, fire-1 from the walk): wizard
   quests hardcoded grid (80,80) — off-screen from template packs (their chain
   sits at y=0). Now spawns at the visible pane center + animated focus.
   New: `useQuestViewportApi.ts` (fills `getSpawnGridPos`/`focusNode` into the
   `ToolbarAPI`), `flowToGridPos` shared helper (deduped from AddQuestOverlay),
   `useGuidedQuestCreate.ts` extracted (QuestBookEditor was 302 > 300-limit —
   the tripwire caught it). +5 tests (hook + math).
2. **Toolbar triage** (the walk's review pass): Fit/Undo/Redo/Connect cut from
   the toolbar (Fit duplicated ReactFlow `<Controls>`; Ctrl+Z/Y handled undo
   globally; the buttons were the only discoverable undo surface — cut is
   documented as the student's call). Connect moved into the canvas overlay
   (AddQuestOverlay stays visible in connect mode; banner X is the secondary
   exit). Dead prop chain removed (`onUndo/onRedo/canUndo/canRedo` through
   QuestBookEditor → QuestEditorLayout → QuestCanvas) + `handleFitView` plumbing.
   Docs synced (quest-editor.md, history.md). **Add Link kept** — the student's
   "dead code" claim was wrong: `quest_link` round-trips (node.rs, tested
   export_chapter_tests.rs:127); its UX is thin (target defaults to the first
   quest) — parked with tripwire.
3. **Edge centering**: handles were 4px!important but the library's
   `min-width:5px` won — every edge endpoint landed 2.5px low
   (`getHandlePosition` anchors `Position.Bottom` at the handle's bottom edge).
   Handles are now 0×0 → endpoints exactly at shape center.
4. **Grid-vs-snap**: background dots rendered at 1-unit pitch (42px) while
   quests snap at `grid_scale × minSize` (0.5 units) — half of snapped
   positions fell between dots. Background gap now `GRID_SCALE × grid_scale`
   (21px) — the visible grid IS the snap grain. Doc'd in the Grid Snapping
   section.
5. **Spawn snapping**: spawn-at-cursor (s49) placed quests at arbitrary
   fractional positions that stayed off-grid until dragged (found one at
   x=17.87). All three spawn paths (overlay, context menu, wizard) now snap to
   the drag grain via `snapToGridStep`.
6. **Shape plate factor — CALIBRATION IN PROGRESS** (see Open items): 0.8 →
   1.8 by the maintainer's eye; still reads too small. The 7:6 body:pitch
   formula is wrong against the real render (the game's tiles overlap deeply at
   1-unit spacing — the formula cannot produce overlap).
7. **Icon anchor** (calibrated, done): icon is anchored to the quest BODY
   (`iconBaseSize` — unscaled by the plate factor), 24px for a 1.0 quest,
   stable while the plate grows. The student's calibration: icon perfect at
   24px, "the plate and the plate alone needs to grow". The old 2/3-of-plate
   fraction made icons inflate with the plate. Detail modal keeps the fraction
   of its own tile.

## Decisions

- **The maintainer's eyes are the calibration instrument for visual parity.**
  The eyes (vision-subagent) measurements flip-flopped four times across the
  session (mislabeled images, ±10% pixels) — stop trusting it for geometry.
  The student's direct in-game reads (overlap at 1-unit spacing, icon:plate)
  outvote formulas and pixel estimates. The repo's 7:6 formula was derived from
  FTB source, never verified against the render — it's wrong for the real
  render.
- **"1 node away" in the student's original in-game test meant TWO grid units**
  (one node's *space* between them) — the screenshots were of quests 2 units
  apart. Any ratio derived from those screenshots' pitches is garbage.

## Gotchas (memory-check pointers)

- GOTCHAS: `s49` stale-debug-binary lesson extended to frontend HMR — a
  "still broken" report can be a silently-failed hot reload; verify the running
  bundle before trusting a negative observation.
- GOTCHAS: `rg -r` is `--replace`, not recursive — used twice this session,
  both times producing garbage output (the tutor's own observation-gate
  failure class).
- GOTCHAS: the library's `getHandlePosition` anchors edges at the handle's
  bottom edge for `Position.Bottom` — a nonzero handle biases every edge.
- GOTCHAS: `ftbquests:missing_item` is the no-icon placeholder — its texture
  renders at the same size as any icon; the walk quests' purple "?" is that
  item, not a missing-texture artifact.

## Open items (owed ledger)

- **SHAPE PLATE FACTOR** (the one open calibration): `quest-nodes.tsx`
  `shapeSize` factor at 1.8, direction is BIGGER (2.0+). Next session: bump,
  reload, compare 1-unit-spacing overlap + icon:plate against the game. The
  icon (24px) is calibrated and must NOT ride the plate.
- **Fire-2 tripwire** (s49): pane right-click with cursor over the chain that
  spawns far = a second, separate bug. Unconfirmed — the student's fire-2 was
  likely a far cursor. Re-test on the next walk.
- `quest-section-groups.tsx:54` shows "28×28px" labels for default quests
  (calls `questSizeToPixels` without the base) — the canvas renders 36×36.
  Display lie, minor.
- CF dummy key test 08-15 (external), controllable re-key (2 min, logs 404
  every wizard load).
- **Devtools never opened** in the Tauri window (Ctrl+Shift+I / F12 dead) —
  worth a look; the session worked around it with screenshots.

## Verification

- `pnpm test` 724 green (was 718), `tsc -b` clean, `pnpm lint` clean on
  touched files, `git diff --check` clean, integrity line-limits clean
  (all touched files < 300; the RecipeEditor 305 PARK is untouched).
- Docs synced same-pass: quest-editor.md (grid snapping, bake size, icon
  anchor, undo/redo, Connect location), history.md (toolbar buttons removed).
