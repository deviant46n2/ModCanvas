# ModCanvas ↔ FTB Quests In-Game Editor — Feature Parity Checklist

Reference for closing the gap between the **ModCanvas** desktop workbench and the **FTB Quests** in-game editor. Every item below is a capability the in-game editor exposes; the status column says whether ModCanvas ships it today.

- ✅ **Parity** — ModCanvas covers it.
- 🟡 **Partial** — import/export and/or data-model support exists, but no live editor UI (or the round-trip is lossy).
- ❌ **Missing** — not implemented at all.

FTB source references (`/tmp/ftbq/common/...` or the FTBTeam/FTB-Quests repo) are the authoritative behavior we aim to match. ModCanvas references are the **live** editor only — `frontend/src/QuestBookEditor.tsx`, `frontend/src/components/quest/QuestCanvas.tsx`, `QuestDetailModal.tsx`, `quest-form-sections.tsx`, `ChapterSettings.tsx`, `GroupSettings.tsx`, `book-settings.tsx`. The legacy `QuestGraph.tsx` / `QuestInspector.tsx` / `inspector.tsx` / `toolbar.tsx` / `modals.tsx` stack is dead code (not imported/bundled) and is ignored as evidence of a feature — a field that only exists there is marked ❌.

_Last audited against commit `86d38a4` (branch `fix/smart-filter-textures`)._

---

## 1. File / global settings (`data.snbt`)

Reached in-game via Settings gear → **Edit File**.

| FTB editor field | ModCanvas | Notes / what to do |
|---|---|---|
| Book title / description | ✅ | `book-settings.tsx` |
| Default quest shape | ✅ | `default_quest_shape` editable + exported |
| File progression mode | ✅ | Editable + exported |
| Grid scale | ✅ | Editable + exported |
| Default reward team | ✅ | Editable + exported |
| Default consume items | ✅ | Editable + exported |
| Default autoclaim rewards | ✅ | Editable (disabled/enabled/no_toast/invisible) + exported |
| Detection delay | ✅ | Editable + exported |
| Default quest size (book-level) | 🟡 | Not surfaced; chapter default exists, book default does not |
| Emergency items + cooldown | ❌ | Not modeled/exported |
| Drop loot crates | ❌ | Not modeled/exported |
| Disable GUI / pause game | ❌ | Not modeled/exported |
| Lock message / show lock icons | ❌ | Not modeled/exported |
| Drop book on death / hide excluded / suppress autoclaim | ❌ | Not modeled/exported |
| Fallback locale | ❌ | Not modeled/exported |
| **Visual presets** (named shape+size records, assignable per quest/chapter) | ❌ | FTB `VisualPresetsEditorScreen`; no presets concept at all |
| Book icon / background image | 🟡 | Model carries it; icon picker targets `book` but nothing opens it |
| Save on Server / Save as File | 🟡 | Save + Save & Hot-Reload over WS exist; no "save as file" to arbitrary path |

---

## 2. Quest object — common properties

| Field | ModCanvas | Notes / what to do |
|---|---|---|
| Title | ✅ | `QuestDetailModal.tsx` |
| Subtitle | ✅ | |
| Description (multiline) | ✅ | Textarea (FTB has multi-page + inline images — see §17) |
| Icon | ✅ | Searchable icon picker |
| Tags | ❌ | In data model, not parsed/exported, no UI |
| Color (outline) | ✅ | Color input; renderer tints outline |

---

## 3. Quest appearance & behavior (per-quest)

| Field | Group | ModCanvas | Notes / what to do |
|---|---|---|---|
| Shape | appearance | ✅ | Dropdown (default/circle/square/rounded_square/diamond/pentagon/hexagon/octagon/heart/gear) |
| Size (Scale + W/H) | appearance | ✅ | Slider + width/height inputs |
| X / Y | appearance | ✅ | Drag on canvas |
| Min width | appearance | 🟡 | UI writes `min_window_width`, export writes `min_width` — round-trip asymmetry |
| Icon scale | appearance | ✅ | 0.1–2.0 input; 2/3 renderer match verified |
| Visibility (invisible / invisible-until-X-tasks / hide-details / hide-text-until-complete) | visibility | 🟡 | 6-option `<select>`; the fine-grained tristates (hide_until_deps_complete/_visible, hide_text_until_complete) not individually editable |
| Hide lock icon | visibility | ✅ | Checkbox in Advanced |
| Dependencies | dependencies | ✅ | Drawn as edges; bulk dep ops missing (§4) |
| Dependency requirement (ALL/ONE × completed/started) | dependencies | ✅ | `DEPENDENCY_REQUIREMENTS` select in Advanced |
| Min required dependencies | dependencies | ✅ | Number input in Advanced |
| Hide dependency lines | dependencies | ✅ | Checkbox |
| Hide dependent lines | dependencies | ✅ | Checkbox |
| Max completable dependents | dependencies | ✅ | Number input in Advanced |
| Guide page | misc | ✅ | Text input in Advanced |
| Disable JEI / recipe mod | misc | ✅ | "Hide JEI Recipe" checkbox |
| Repeatable | misc | ✅ | `can_be_repeatable` checkbox |
| Repeat cooldown | misc | ✅ | Seconds input in Advanced (`repeat_cooldown` FTB-canonical) |
| Optional | misc | ✅ | Checkbox |
| Ignore reward blocking | misc | ✅ | Checkbox |
| Progression mode | misc | ✅ | Dropdown |
| Require sequential tasks | misc | ✅ | Checkbox |
| Silently complete / disable toast | misc | ✅ | Checkboxes |
| Disable reward (pause_reward) | misc | 🟡 | Parsed/exported, no UI |
| Quest background | extra | 🟡 | Parsed/exported, no UI |

---

## 4. Quest right-click context menu

| Action | ModCanvas | Notes / what to do |
|---|---|---|
| Edit | ✅ | Single/double-click opens quest modal; right-click menu → Edit |
| Move | ✅ | Drag |
| Quick Properties (inline per-field submenu) | 🟡 | Right-click node menu exists; inline field submenu not yet (fields in modal) |
| Delete (with confirm) | ✅ | Right-click → Delete, modal button, Delete key |
| Reset Progress | ✅ | Right-click → Reset Selected (simulate) |
| Complete Instantly | ✅ | Right-click → Complete Selected (simulate) |
| Copy ID | ✅ | Right-click → Copy Quest ID (clipboard) |
| Edit Linked Quest / Edit Reward Table | 🟡 | Link target editable in modal; reward-table editor shipped |
| Bulk ops on multi-selection (add/remove deps both directions, add/clear rewards on all, bulk size, bulk move, delete all) | 🟡 | Right-click bulk **delete / duplicate / complete / reset** on multi-selection; dep/reward/size bulk ops still TBD |
| Multi-select copy/move/rotate | 🟡 | Copy/paste + move exist; rotate missing |

---

## 5. Edit-mode empty-space right-click menu

| Action | ModCanvas | Notes / what to do |
|---|---|---|
| Create quest with any task type at cursor | ✅ | Right-click empty pane → "New Quest with Task" submenu; creates quest at cursor |
| Create chapter image | ✅ | Decorations toolbar toggle |
| Paste quest (with/without deps) | ✅ | Ctrl+V + right-click **Paste Quest** |
| Paste quest link / task / image | ❌ | Add |

---

## 6. Tasks / objectives

ModCanvas objective types (`quest-form-constants.ts`): item_acquisition, item_retrieval, item_crafting, block_break, block_place, entity_kill, location_visit, advancement, observation, visit_biome, find_structure, fluid, energy, xp, stat, command, game_stage, checkmark, custom.

| FTB task | FTB editable fields | ModCanvas | Notes / what to do |
|---|---|---|---|
| Item | item, count, consume_items, only_from_crafting, match_components, task_screen_only, nbt + smart filter | 🟢 | all flags editable; smart-filter DSL **display-only** (no editor), but the icon now cycles the items that actually **match** the filter (root=AND, `not`/`and`/`or`/`only_one` semantics evaluated over the scanned item registry) at the in-game 1 s beat — see `core/quest/smart-filter.ts` |
| Custom | custom JSON, max_progress | 🟡 | Parsed/exported; not editable, no max_progress |
| XP | value, points | ✅ | |
| Dimension | dim | 🟡 | Imported as `location_visit`; no dedicated UI |
| Stat | stat, value | ✅ | |
| Kill | entity, entity_type_tag, value, custom_name, nbt_filter | 🟢 | all editable; FTB keys `entityTypeTag`/`value`/`nbt_filter` |
| Location | dim, ignore_dim, x, y, z, w, h, d | 🟢 | x/y/z + W×H×D box + Ignore Dimension; exports FTB `position`/`size` int arrays + `ignore_dimension` |
| Checkmark | — | ✅ | |
| Advancement | advancement, criterion | 🟢 | advancement + criterion editable |
| Observation | timer, observe_type, to_observe | 🟡 | `observation_range` only |
| Biome | biome | ✅ | |
| Structure | structure | ✅ | |
| Gamestage | stage, team_stage | 🟢 | stage + team_stage editable (FTB has no task-level `remove`) |
| Fluid | fluid stack | ✅ | |
| Energy | value, max_input | 🟡 | amount + unit; no max_input |
| Common task fields (title, icon, description, optional_task) | `Task.java` | 🟡 | `optional_task` flag editable + round-trips; per-task title/icon/description not persisted by FTB |

---

## 7. Rewards

ModCanvas reward types (`quest-form-constants.ts`): item, choice, item_weighted, random, all_table, loot_table, experience, xp_levels, command, advancement, toast, unlock, game_stage, custom.

| FTB reward | FTB editable fields | ModCanvas | Notes / what to do |
|---|---|---|---|
| Item | item, count, random_bonus, only_one | 🟢 | item/count/weight + random_bonus + only_one editable |
| XP / XP Levels | xp / xp_levels | ✅ | |
| Command | command, permission_level, silent, feedback_message | 🟢 | all four editable |
| Loot | loot table | ✅ | |
| Choice / All table / Random | table (reward-table object) | ✅ | Reward Table `<select>` in RewardCard threads `table_id`; tables edited in 🎁 Tables modal |
| Advancement | advancement, criterion | 🟡 | type exists; advancement_id/choices not editable in live UI |
| Toast | description | 🟡 | type exists; toast_message not editable |
| Gamestage | stage, remove | 🟡 | stage only; no remove flag |
| Currency | coins | ❌ | Not enabled by default in FTB — skip |
| Custom | custom JSON | 🟡 | Type exists; no editor |
| Common reward fields (team, autoclaim, exclude_from_claim_all, ignore_reward_blocking, disable_reward_screen_blur) | `Reward.java` | 🟢 | Team Reward, Auto-Claim (auto), Exclude from Claim All, Ignore Reward Blocking, Disable Screen Blur all editable |

---

## 8. Reward tables

FTB `RewardTable` objects (`EditRewardTableScreen`) — weighted pools referenced by random/all-table rewards.

| Capability | ModCanvas | Notes / what to do |
|---|---|---|
| Import/export `reward_tables/<hex>.snbt` | ✅ | Weighted pools, loot_size, empty_weight, hide_tooltip, use_title round-trip |
| `table_id` / `reward_chests` wiring | ✅ | Carried in model; resolved on import, written on export |
| **Live weighted-table editor** | ✅ | `RewardTablesModal.tsx` (🎁 Tables button): create/rename/delete tables, weighted entries (item/count/weight), loot_size/empty_weight/hide_tooltip/use_title, reorder, usage count |
| Choice reward per-entry options | 🟡 | Entries edited inside the table; choice-style per-reward collections still not exposed |

---

## 9. Chapter-level editing

Live UI = `ChapterSettings.tsx` (opened by double-clicking a chapter in `ChapterTree.tsx`).

| Field | ModCanvas | Notes / what to do |
|---|---|---|
| Title | ✅ | |
| Icon | ✅ | Chapter-target icon picker wired |
| Subtitle | ✅ | |
| Default quest shape | ✅ | |
| Default quest size | ✅ | 0.0625–8 input |
| Default min width | ✅ | |
| Progression mode | ✅ | |
| Always invisible | ✅ | |
| Default hide dependency lines | ✅ | |
| Hide quest details until startable | ✅ | |
| Hide quest until deps visible / complete | ✅ | |
| Hide text until complete | ✅ | |
| Autofocus id | ✅ | |
| Default repeatable | ✅ | |
| Require sequential tasks | ✅ | |
| Consume items (tristate) | ❌ | Add |
| Reorder (move up/down) | ✅ | |
| Change group | ✅ | Group select |
| Delete chapter | ✅ | |
| Add chapter / add group | ✅ | ChapterTree buttons |
| Chapter background image / description | 🟡 | Backdrop auto-resolved from theme at runtime; not manually editable; `description` not parsed |

---

## 10. Chapter groups

Live UI = `GroupSettings.tsx` (double-click a group header in `ChapterTree.tsx`).

| Capability | ModCanvas | Notes / what to do |
|---|---|---|
| Create group | ✅ | "+ Add Group" |
| Rename group | ✅ | |
| Reorder group (move up/down) | ✅ | |
| Delete group | ✅ | Unassigns chapters |
| Assign chapter to group | ✅ | ChapterSettings group select |
| Render groups as collapsible tabs | ✅ | |
| Write `chapter_groups.snbt` on export | 🟡 | Export writes per-chapter `group` keys; confirm standalone `chapter_groups.snbt` file is emitted |

---

## 11. Chapter images / decorations

| Capability | ModCanvas |
|---|---|
| Place images on canvas | ✅ |
| Drag / resize / rotate / delete handles | ✅ |
| Alpha / order / image-key numeric edit | ✅ `DecorationPanel` |
| Click → open URL, hover tooltip | ✅ `ChapterImagesLayer` |
| Full import/export round-trip | ✅ |

**Strongest parity area — no work needed.**

---

## 12. Quest links

| Capability | ModCanvas |
|---|---|
| Create quest links | ✅ "🔗 Add Link" canvas button |
| Render link buttons | ✅ Dashed shape + 🔗 badge |
| Edit linked quest target | ✅ Modal "Quest Link" section (cross-chapter dropdown) |
| Import / export fidelity | ✅ SNBT + JSON5, both layouts |

---

## 13. Progress testing / simulation

| Capability | ModCanvas |
|---|---|
| Reset progress (per object / global) | ✅ Simulate mode |
| Complete instantly (per object / global) | ✅ Simulate mode |
| Visibility / lock preview | ✅ `core/quest/progress.ts`, dim + hidden/locked badges |

---

## 14. Canvas & editing tools

| Tool | ModCanvas |
|---|---|
| Zoom / pan / fit | ✅ |
| Grid snap + Shift free move | ✅ |
| Multi-select (marquee) / Ctrl+A | ✅ |
| Copy / paste (Ctrl+C/V) | ✅ |
| Nudge selected (arrow keys) | ✅ |
| Bulk delete / cut / duplicate | ✅ Cut (Ctrl+X), duplicate (Ctrl+C/V + Ctrl+D / context menu), multi-delete via selection |
| Align / distribute tools | ✅ Left/center-X/right/top/center-Y/bottom + horizontal/vertical distribute on multi-selection |
| Dependency cycle detection + warning | ✅ |
| Edge draw / reconnect / delete | ✅ |
| Quest search / filter bar | ✅ Type-to-filter by label/id/subtitle/objective target; dims non-matches, Enter focuses the first match |
| Hover dependency highlight | ✅ | Gentle: hovered quest's edges brighten to full opacity, others dim to 28% (opacity-only — no stroke-width jump, no CSS `filter`, so nothing blurry or pixel-shifting inside the scaled viewport) |
| **Undo / redo (Ctrl+Z/Y)** | ✅ | Full-graph snapshot history in `QuestBookEditor`; ↩/↪ toolbar buttons + Ctrl+Z / Ctrl+Y |
| **Bezier control-point editing per edge** | ✅ | Per-edge curve handles (`EdgeBezierEditor`); one undoable step per drag; stored in the editor graph (not in SNBT — FTB's format has no field) |
| Editing-mode toggle | ✅ 🔒 View / ✏️ Edit: read-only lock disables move/connect/delete/add while keeping selection + navigation |
| Emergency items | ❌ |
| Reward tables screen | ✅ §8 |
| Other (search, align, bezier, editing toggle) | ✅ | See rows above | |

---

## 15. Import / export fidelity

| Concern | ModCanvas | Notes / what to do |
|---|---|---|
| Flat-chapter layout | ✅ export | |
| Subdirs layout | ✅ export | |
| Layout choice | ❌ Always writes **both**; no user choice | |
| Subdirs export completeness | 🟡 | Verify it no longer drops chapter icon/progression_mode/default_quest_size/description |
| Comment-preserving writes | ✅ | atomic `.tmp` + AST-preserving |
| Legacy key aliases | 🟡 | `min_width` vs `min_window_width`, `invisible` vs `invisible_until_completed` asymmetries |

---

## 16. Visual / rendering parity (WYSIWYG) — the biggest gap

The in-game look is 100% driven by the **theme file** (`ftb_quests_theme.txt`); ModCanvas hardcodes most of it. Items below are what a pixel-peeper still sees diverging:

| Rendering detail | ModCanvas | Notes / what to do |
|---|---|---|
| Dependency lines as **textured bezier curves** (theme-controlled texture/color/thickness/animation speed) | ❌ | Custom SVG edges with hardcoded colors; no theme texture |
| Panel/border/background styling from theme selectors | ❌ | No `ftb_quests_theme.txt` parsing |
| `quest_spacing`, `pinned_quest_size`, `full_screen_quest` | ❌ | Hardcoded layout constants |
| Checkmark / progress icons from theme | ❌ | Emoji/vector badges |
| Quest shape tiles | ✅ | Canvas-baked via `bakeShapeTile` (verified round/transparent/grey+outline) |
| Icon 2/3 proportion + pixelated render | ✅ | Verified |
| Node pulse animation when selected | 🟡 | Partial |

**Suggested approach:** parse the pack's `ftb_quests_theme.txt` (and defaults) in Rust or a pure `core/` parser, expose a resolved theme object to the frontend, and drive edge/panel/checkmark rendering from it — same lazy-materialization rules as the texture pipeline (descriptors, never bundled bytes).

**Engine-rendered icons (companion mod) — shipped (see `docs/engine-renders.md`):** items the software rasterizer cannot bake — AND the software-baked `bake:` stand-ins — are rendered in-game by the companion mod over the WS bridge (`RENDER_ITEMS_REQUEST`/`RENDER_ITEMS_RESULT`), returned as base64 PNG data URLs, and cached per-instance by ModCanvas (`engine_renders` disk cache, invalidated when the pack's jars change). Baked icons stay hidden while the engine path is active (no ugly 3D stand-in), then load once and render instantly from cache on every subsequent open. Opt-in, offline-first, lazy; 4 renders/tick in-game so frames never hitch.

---

## 17. In-quest view editor (in-game quest details panel)

| Capability | ModCanvas | Notes / what to do |
|---|---|---|
| Inline text-line editing (T/S/D/L/P/I/Q hotkeys) | ❌ | Plain `textarea` description |
| Multi-page descriptions (pagebreak + nav) | ❌ | |
| Inline image components in description | ❌ | |
| Clickable dependency/dependant arrows in view | 🟡 | Dependency lines clickable-ish on canvas only |
| Pin quest / open in guide | ❌ | |

---

## 18. Pack Health (ModCanvas-only, not an FTB feature)

A workspace tab that reports the pack's file-level soundness as a pure function
of already-materialized state (§9 of the Project Bible). **Tier 1 (reference
integrity + coverage) is shipped** — see `docs/pack-health.md`.

| Check | Status |
|---|---|
| Quests: dead item references against the pack's item registry | ✅ recommended (never blocking; suppressed when registry degraded) |
| Quests: dependency cycles (reuses `core/validation/quest-validator`) | ✅ blocking |
| Quests: undefined / unused reward tables | ✅ |
| Quests: empty chapters, unreachable quests | ✅ |
| Recipes: authored-only validation surfaced from `core/recipe/validation` | ✅ |
| Pack: cover image, pack info fields, zero chapters | ✅ |
| Registry stats + degraded-registry diagnostic in the verdict | ✅ |
| Copy button on every finding (Trust Rule) | ✅ |
| Tier 2 progression topology / Tier 3 flavor analytics | ❌ quarantined (§9.3) |

---

## Priority shortlist — what to build first

Ordered by value / effort. Items 1–2 are done. Items 3–4 are the remaining cheap wins; 5–6 are the biggest editing gaps; 7 is the deep WYSIWYG work.

1. ✅ **Resurface orphaned per-quest fields in the live modal** — `repeat_cooldown`, `hide_lock_icon`, `guide_page`, `max_completable_dependents`, `dependency_requirement`, `min_required_dependencies` now all editable in the Advanced section of `QuestDetailModal.tsx`.
2. ✅ **Reward-table editor screen** — `RewardTablesModal.tsx` (🎁 Tables): weighted entries, loot_size/empty_weight, reorder, usage count; `RewardCard` gets a table `<select>` for choice/all_table/random rewards.
3. ✅ **Right-click context menus** — node menu (Edit/Duplicate/Copy ID/Complete/Reset/Delete, bulk variants on multi-selection) and empty-pane menu (Add Quest, Add Link, New Quest with Task, Paste Quest), with right-click-to-position placement at the cursor via `QuestContextMenu.tsx`.
4. ✅ **Undo / redo (Ctrl+Z/Y)** — full-graph snapshot history on every `commitGraph` mutation, ↩/↪ toolbar buttons with disabled states.
5. **Task/reward field completion** — kill tag/custom_name/nbt_filter, location W×H×D box + ignore_dim, item `task_screen_only`/`only_from_crafting` + match_components, command reward permission_level/silent/feedback_message, item reward random_bonus/only_one, per-task title/icon/description, common reward fields (team/autoclaim/exclude/blocking/blur), gamestage team_stage/remove, advancement criterion.
   - ✅ Kill: entityTypeTag (`entityTypeTag` key), custom_name, nbt_filter; kill count now FTB `value`.
   - ✅ Location: x/y/z + W×H×D box + ignore_dim; exports FTB `position`/`size` int arrays + `ignore_dimension`.
   - ✅ Stage: team_stage editable (FTB has no task-level `remove`).
   - ✅ Advancement: criterion editable.
   - ✅ Task optional: serialized as FTB `optional_task` (legacy `optional` still read).
   - ✅ Command reward: permission_level/silent/feedback_message editable.
   - ✅ Item reward: random_bonus/only_one editable.
   - ✅ Item task: task_screen_only / only_from_crafting / match_components editable.
   - ✅ Common reward fields: team_reward / auto / exclude_from_claim_all / ignore_reward_blocking / disable_reward_screen_blur editable.
   - ⬜ Remaining (FTB does not persist per-task title/icon/description, so nothing left to serialize): none.
6. ✅ **Canvas tools** — quest search/filter bar (dim non-matches, Enter focuses), align/distribute on multi-selection, per-edge bezier control-point editing (editor-graph persistence), cut (Ctrl+X) + duplicate (Ctrl+D), editing-mode (read-only) toggle, book-level visual presets.
   - ✅ Search bar — `QuestSearchBar` matches label/id/subtitle/objective target, dims/highlights quest nodes, Enter selects + flies to the first match.
   - ✅ Align/distribute — `AlignDistributeControls` + pure `align.ts` (left/center-X/right/top/center-Y/bottom, horizontal/vertical distribute) in FTB grid coords.
   - ✅ Cut + duplicate — Ctrl+X (copy+delete), Ctrl+D (copy+paste) with the existing clipboard.
   - ✅ Editing-mode toggle — 🔒 View lock in `QuestCanvas` disables node drag, connect, reconnect, delete, and the add/context-menu mutations while keeping selection and pan/zoom.
   - ✅ Bezier control points per edge — `EdgeBezierEditor` draggable handles (anchored to the handle anchors so curves track quests); live preview + single undoable commit per drag; persisted in `QuestEdgeData.bezier`/`QuestEdge.bezier` (editor-only — FTB has no SNBT field).
   - ✅ Book-level visual presets — self-authored `BOOK_THEME_PRESETS` (clean-room, no FTB theme data) repaint book/chapter defaults + quest colors and drive edge colors via `edge_color`/`edge_cycle_color`.
7. **Theme-file fidelity (§16)** — parse `ftb_quests_theme.txt` and drive edge/panel/checkmark/spacing rendering from it.
8. 🟡 **Remaining book-level settings** — emergency items (+cooldown), lock message, show lock icons, disable gui, pause game, drop book on death, drop loot crates, hide excluded quests, verify on load, default disable JEI, fallback locale, loot crate no-drop % — all shipped end-to-end (import/export/UI + roundtrip test). Remaining: **book icon picker**, **book default quest size (book-level, distinct from per-chapter)**, **save-as-file**.
9. **Import/export hardening** — user layout choice, fix subdirs drops, unify `min_width`/`invisible` aliases, emit `chapter_groups.snbt`, parse/export quest `tags`.
10. **Description editor** — multi-page + inline images (§17).
