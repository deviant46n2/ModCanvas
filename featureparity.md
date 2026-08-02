# ModCanvas ↔ FTB Quests In-Game Editor — Feature Parity Checklist

Reference for closing the gap between the **ModCanvas** desktop workbench and the **FTB Quests** in-game editor. Every item below is a capability the in-game editor exposes; the status column says whether ModCanvas ships it.

- ✅ **Parity** — ModCanvas covers it.
- 🟡 **Partial** — import/export and/or data model support exists, but no live editor UI (or the round-trip is lossy).
- ❌ **Missing** — not implemented at all.

FTB source references (`/tmp/ftbq/common/...`) are the authoritative behavior we aim to match. ModCanvas references are the live editor (`QuestBookEditor.tsx` / `QuestCanvas.tsx` / `QuestDetailModal.tsx`); the legacy `QuestGraph.tsx` stack is dead code and ignored.

---

## 1. File / global settings (`data.snbt`)

Reached in-game via the Settings gear → **Edit File** (`OtherButtonsPanelBottom.java:122`, `ftbquests.gui.edit_file`).

| FTB editor field | FTB source | ModCanvas | Notes / what to add |
|---|---|---|---|
| Default quest shape | `data.snbt: default_quest_shape` | ✅ | Editable in `book-settings.tsx`; written on export |
| File progression mode | `data.snbt: progression_mode` | ✅ | Editable; written on export |
| Grid scale | `data.snbt: grid_scale` | ✅ | Editable; written on export |
| Default reward team (per-team reward split) | `data.snbt: default_reward_team` | ✅ | Read on import + editable in `book-settings.tsx`; written on export |
| Default consume items | `data.snbt: default_consume_items` | ✅ | Read on import + editable; written on export |
| Default autoclaim rewards | `data.snbt: default_autoclaim_rewards` | ✅ | Read on import + editable (disabled/enabled/no_toast/invisible); written on export |
| Detection delay | `data.snbt: detection_delay` | ✅ | Read on import + editable; written on export |
| Book icon / background image | `QuestObjectBase` icon, chapter image | 🟡 | Data model carries `book_icon` / `book_background_image` but the live UI never opens the book icon picker. |
| Save on Server / Save as File | `ftbquests.gui.save_on_server` / `save_as_file` | 🟡 | Save + Save & Hot-Reload over WS exist; no "save as file" into an arbitrary path. |

---

## 2. Quest object — common properties (right-click → Edit / Quick Properties)

Built from `QuestObjectBase.fillConfigGroup` + `Quest.fillConfigGroup` (`Quest.java:595-643`).

| Field | FTB source | ModCanvas | Notes / what to add |
|---|---|---|---|
| Title | `QuestObjectBase` | ✅ | Text input (`QuestDetailModal.tsx:74`) |
| Subtitle | `Quest.java:598` | ✅ | Text input |
| Description (multiline) | `MultilineTextEditorScreen` | ✅ | Textarea |
| Icon | `EditableIconItemStack` | ✅ | Icon picker with texture search |
| Tags | `QuestObjectBase.addList("tags")` | 🟡 | In data model, but not parsed from/exported to file, no UI |
| Color (outline) | theme `quest_not_started_color` | ✅ | Color input |

---

## 3. Quest appearance & behavior (per-quest config)

`Quest.fillConfigGroup` (`Quest.java:595-643`). "Model" = parsed/exported but no live UI; "UI" = editable control in the live editor.

| Field | Group | FTB source | ModCanvas | Notes / what to add |
|---|---|---|---|---|
| Shape | appearance | `appearance.addEnum("shape", ...)` | ✅ | Dropdown (default/circle/square/rounded_square/diamond/pentagon/hexagon/octagon/heart/gear) |
| Size | appearance | `appearance.addDouble("size", 0–8)` | ✅ | Scale slider + W/H inputs |
| X / Y | appearance | `appearance.addDouble("x"/"y")` | ✅ | Drag on canvas |
| Min width | appearance | `appearance.addInt("min_width", 0–3000)` | 🟡 | UI exists (`min_window_width`) but export writes `min_width` while import reads `min_window_width` — round-trip asymmetry |
| Icon scale | appearance | `appearance.addDouble("icon_scale", 0.1–2.0)` | ✅ | 0.1–2.0 input; renderer applies 2/3 × scale; import/export key handled |
| Hide until deps complete | visibility | `addTristate("hide_until_deps_complete")` | 🟡 | Model + import/export only (legacy name `hide_quest_until_deps_complete`) |
| Hide until deps visible | visibility | `addTristate("hide_until_deps_visible")` | 🟡 | Model + import/export only |
| Invisible | visibility | `addBool("invisible")` | 🟡 | Model + import/export only (`invisible_until_completed`) |
| Invisible until X tasks | visibility | `addInt("invisible_until_tasks")` | 🟡 | Model + import/export only (`invisible_until_x_tasks`) |
| Hide details until startable | visibility | `addTristate("hide_details_until_startable")` | 🟡 | Model + import/export only |
| Hide text until complete | visibility | `addTristate("hide_text_until_complete")` | 🟡 | Model + import/export only |
| Hide lock icon | visibility | `addBool("hide_lock_icon")` | ✅ | Checkbox in editor; `hide_lock_icon` parsed/exported |
| Dependencies (list) | dependencies | `addList("dependencies")` | ✅ | Drawn as edges; bulk dependency ops missing |
| Dependency requirement (ALL / ONE) | dependencies | `addEnum("dependency_requirement")` | 🟡 | Model + import/export only |
| Min required dependencies | dependencies | `addInt("min_required_dependencies")` | 🟡 | Model + import/export only |
| Hide dependency lines | dependencies | `addTristate("hide_dependency_lines")` | ✅ | Checkbox |
| Hide dependent lines | dependencies | `addBool("hide_dependent_lines")` | ✅ | Checkbox |
| Max completable dependents | dependencies | `addInt("max_completable_dependents")` | ✅ | Number input in editor; parsed/exported |
| Guide page | misc | `addString("guide_page")` | ✅ | Text input in editor; parsed/exported |
| Disable JEI / recipe mod | misc | `addEnum("disable_jei")` | ✅ | "Hide JEI Recipe" checkbox |
| Repeatable | misc | `addTristate("can_repeat")` | ✅ | Checkbox (`can_be_repeatable`) |
| Repeat cooldown | misc | `addInt("repeat_cooldown")` | ✅ | Seconds input in editor; exports FTB-canonical `can_repeat` + `repeat_cooldown` (legacy `repeat_time`/`repeat_min_delay`/`repeat_max_delay` accepted on import, never emitted) |
| Optional | misc | `addBool("optional")` | ✅ | Checkbox |
| Ignore reward blocking | misc | `addBool("ignore_reward_blocking")` | ✅ | Checkbox |
| Progression mode (linear/flexible) | misc | `addEnum("progression_mode")` | ✅ | Dropdown |
| Require sequential tasks | misc | `addTristate("require_sequential_tasks")` | ✅ | Checkbox |
| Silently complete / disable toast | misc | (misc) | ✅ | "Silently Complete" + "Disable Toast" checkboxes |
| Disable reward (pause reward) | misc | `pause_reward` | 🟡 | `pause_reward` parsed/exported, no UI |
| Quest background | (extra) | `quest_background` | 🟡 | `quest_background` parsed/exported, no UI |

---

## 4. Quest context menu (right-click a quest)

`QuestButton.java:135-158` → `QuestScreen.addObjectMenuItems` (`QuestScreen.java:251-342`).

| Action | FTB source | ModCanvas | Notes / what to add |
|---|---|---|---|
| Edit | `selectServer.edit` | ✅ | Double-click opens quest modal |
| Move | `gui.move` | ✅ | Drag nodes |
| Quick Properties (inline submenu) | `ftbquests.gui.copy_id.quick_properties` | ❌ | No inline properties submenu (fields live in the modal) |
| Delete (with confirm) | `selectServer.delete` | ✅ | Delete button in modal |
| Reset Progress | `ftbquests.gui.reset_progress` | ❌ | No progress simulation at all |
| Complete Instantly | `ftbquests.gui.complete_instantly` | ❌ | Same |
| Copy ID | `ftbquests.gui.copy_id` | ❌ | No copy-ID (used by FTB's paste-from-clipboard) |
| Edit Linked Quest / Edit Reward Table | link/random-reward shortcuts | ❌ | Links & tables unsupported (below) |
| Multi-select: add/remove deps, bulk move, add/clear rewards, bulk size, delete | `QuestButton.java:183-216` | 🟡 | Multi-select + batch move only; no bulk dep/reward/size/delete |
| Multi-select quick actions (copy/move/rotate) | `QuestScreen.java:382-388` | ❌ | — |

---

## 5. Edit-mode empty-space right-click menu

`QuestPanel.mousePressed` (`QuestPanel.java:465-526`).

| Action | ModCanvas |
|---|---|
| Create any task type (all task types offered) | 🟡 Tasks are added per-quest via the modal, not placed on the canvas |
| Create chapter image | ✅ (Decorations toolbar toggle) |
| Paste quest (with deps) / paste quest (no deps) | ❌ No copy/paste |
| Paste quest link | ❌ |
| Paste task | ❌ |
| Paste image | ❌ |

---

## 6. Tasks / objectives

FTB task registry (`TaskTypes.java`): item, custom, xp, dimension, stat, kill, location, checkmark, advancement, observation, biome, structure, gamestage, fluid, energy (platform). ModCanvas objective types (`quest-form-constants.ts:65-85`): item_acquisition, item_retrieval, item_crafting, block_break, block_place, entity_kill, location_visit, advancement, observation, visit_biome, find_structure, fluid, energy, xp, stat, command, game_stage, checkmark, custom.

| FTB task | FTB editable fields | ModCanvas | Notes / what to add |
|---|---|---|---|
| Item | item, count, consume_items, only_from_crafting, match_components, task_screen_only, nbt + smart filter | 🟡 | Has item/count/consume/nbt. `only_from_crafting` ≈ separate `item_crafting` type; `match_components` ≈ `match_nbt`/`ignore_nbt`; `task_screen_only` missing. FTB **smart filters** (`ftbfiltersystem:filter` DSL) are imported/exported, and their member icons render on canvas nodes/objectives/rewards — cycling `item`/`tag`/`mod` members, with `mod(...)` resolved to a representative item from the instance item registry. `component`/`block`/`stack_size` members are preserved but not used as icon candidates (no single representative texture). |
| Custom | custom JSON, max_progress | 🟡 | `custom_json` parsed/exported; not editable in UI, no max_progress |
| XP | value, points | ✅ | xp_points / xp_levels inputs |
| Dimension | dim | 🟡 | Imported as `location_visit`; no dedicated UI |
| Stat | stat, value | ✅ | stat_name / stat_value |
| Kill | entity, entity_type_tag, value, custom_name, nbt_filter | 🟡 | entity + count only; no tag, custom name, nbt filter |
| Location | dim, ignore_dim, x, y, z, w, h, d | 🟡 | x/y/z/dim/radius UI; FTB uses W×H×D box, ModCanvas uses radius |
| Checkmark | (none) | ✅ | |
| Advancement | advancement, criterion | 🟡 | advancement only; no criterion |
| Observation | timer, observe_type, to_observe | 🟡 | `observation_range` only |
| Biome | biome | ✅ | biome_id |
| Structure | structure | ✅ | structure_id |
| Gamestage | stage, team_stage | 🟡 | stage only; no team_stage |
| Fluid | fluid stack | ✅ | fluid_id + amount |
| Energy | value, max_input | 🟡 | amount + unit; no max_input |
| Block break / place, item retrieval (ModCanvas extras) | — | ✅ | Not distinct FTB types (FTB flags on ItemTask) |
| Command (ModCanvas extra) | — | ✅ | Not an FTB task type (FTB only has command reward) |
| Image | — | 🟡 | In Rust enum only; no UI, exported as empty custom |
| Common task fields (title, icon, description, optional) | `Task.java` | 🟡 | No per-task title/icon/description editing in live UI |

---

## 7. Rewards

FTB reward registry (`RewardTypes.java`): item, choice, all_table, random, loot, command, custom, xp, xp_levels, advancement, toast, gamestage, currency (not enabled by default). ModCanvas reward types (`quest-form-constants.ts:87-102`): item, choice, item_weighted, random, all_table, loot_table, experience, xp_levels, command, advancement, toast, unlock, game_stage, custom.

| FTB reward | FTB editable fields | ModCanvas | Notes / what to add |
|---|---|---|---|
| Item | item, count, random_bonus, only_one | 🟡 | item/count/weight; no random_bonus/only_one |
| XP | xp | ✅ | |
| XP Levels | xp_levels | ✅ | |
| Command | command, permission_level, silent, feedback_message | 🟡 | command only |
| Loot | loot table | ✅ | loot_table field |
| Choice / All table / Random | table (reward-table object) | 🟡 | Types exist; items list/table payload **not editable** in UI |
| Advancement | advancement, criterion | 🟡 | type exists; advancement_id not editable |
| Toast | description | 🟡 | type exists; toast_message not editable |
| Gamestage | stage, remove | 🟡 | stage only; no remove flag |
| Currency | coins | ❌ | Not supported (not enabled by default in FTB) |
| Custom | custom JSON | 🟡 | Type exists; no editor |
| Common reward fields (team, autoclaim, exclude_from_claim_all, ignore_reward_blocking, disable_reward_screen_blur) | `Reward.java:126-136` | ❌ | None editable (autoclaim hardcoded at file level) |

---

## 8. Reward tables

FTB has dedicated `RewardTable` objects (`EditRewardTableScreen.java`, `RandomReward.java`, `AllTableReward.java`) — weighted item pools referenced by random/all-table rewards.

| Capability | ModCanvas |
|---|---|
| Edit weighted reward tables | ✅ Import/export `reward_tables/<hex>.snbt` (weighted pools, loot_size, empty_weight, hide_tooltip, use_title) + frontend table picker on random/choice/all_table rewards |
| `table_id` / `reward_chests` on rewards | ✅ `table_id` read as raw long and resolved to the table's items on import; written back as a raw long on export; `reward_chests` carried through the model |
| Choice reward options (`ChoiceReward`) | 🟡 `table_id` reference editable via the reward-table picker; per-entry choices editable inside the referenced table |

---

## 9. Chapter-level editing

Right-click a chapter tab → Edit (`ChapterPanel.java:429-459`; `Chapter.fillConfigGroup`, `Chapter.java:410-433`).

| Field | FTB source | ModCanvas | Notes / what to add |
|---|---|---|---|
| Title | `QuestObjectBase` | ❌ No chapter rename UI |
| Icon | `QuestObjectBase` | ❌ Icon picker supports `chapter` target but nothing opens it |
| Subtitle | `Chapter.java:413` | ❌ Not parsed/exported |
| Default quest shape | `Chapter.java:416` | 🟡 Parsed + exported (subdirs), but never editable in UI | `import.rs:700,753` / `export.rs:208` |
| Default quest size | `Chapter.java:417` | 🟡 Hardcoded `24×24` on import, never parsed or exported | `import.rs:750` |
| Default min width | `Chapter.java:418` | ❌ |
| Always invisible | `Chapter.java:421` | ❌ |
| Default hide dependency lines | `Chapter.java:422` | 🟡 In model (`default_hide_dependency_lines`), no UI |
| Hide quest details until startable | `Chapter.java:423` | ❌ |
| Hide quest until deps visible | `Chapter.java:424` | ❌ |
| Hide quest until deps complete | `Chapter.java:425` | ❌ |
| Hide text until complete | `Chapter.java:426` | ❌ |
| Autofocus id | `Chapter.java:429` | ❌ |
| Progression mode | `Chapter.java:430` | 🟡 Parsed on import, **dropped on export**, no UI | `import.rs:701,755`; `build_subdirs_chapter` omits it |
| Default repeatable | `Chapter.java:431` | ❌ |
| Consume items | `Chapter.java:432` | ❌ |
| Require sequential tasks | `Chapter.java:433` | ❌ |
| Reorder (move up/down) | `ChapterPanel` move items | ❌ Chapters display in order only |
| Change group | `ftbquests.gui.change_group` | ❌ |
| Delete chapter | `selectServer.delete` | ❌ No chapter delete |
| Add chapter / add chapter group | `ChapterPanel.java:226,245` | 🟡 "+ Add Chapter" exists (hardcoded defaults); no "add group" |
| Chapter background image / description | `ChapterImage` / `description` | 🟡 Background image shown from theme at runtime, not editable; `description` not parsed |

---

## 10. Chapter groups

`ChapterGroup.fillConfigGroup` (`ChapterGroup.java:101-102`), tabs in `ChapterPanel`.

| Capability | ModCanvas |
|---|---|
| Render groups as tabs with collapse | ✅ `ChapterTree` group headers |
| Create group | ❌ |
| Rename group | ❌ |
| Reorder group (move up/down) | ❌ |
| Delete group | ❌ |
| Assign chapter to group | 🟡 Group resolved from chapter `group` key on import; no UI |
| Write `chapter_groups.snbt` on export | ❌ Export only writes per-chapter `group` keys |

---

## 11. Chapter images / decorations

FTB `ChapterImage` (drag/resize/rotate; properties x, y, w, h, rotation, image, scale, order, alpha, color, click, hover).

| Capability | ModCanvas |
|---|---|
| Place images on canvas | ✅ Decorations toolbar + `ChapterDecorationsCanvas` |
| Drag / resize / rotate / delete handles | ✅ |
| Alpha / order / image-key numeric edit | ✅ `DecorationPanel` |
| Click → open URL, hover tooltip | ✅ `ChapterImagesLayer` |
| Full import/export round-trip | ✅ |

This is the strongest parity area — no work needed.

---

## 12. Quest links (cross-chapter references)

FTB `QuestLink` (`QuestLinkButton.java`, paste-link, `ftbquests.gui.edit_linked_quest`). ModCanvas models links as `node_type: quest_link` nodes with a `link_target` id.

| Capability | ModCanvas |
|---|---|
| Create quest links | ✅ "🔗 Add Link" canvas button creates a `quest_link` node |
| Render link buttons | ✅ Dashed shape + 🔗 badge; label shows link title |
| Edit linked quest from link | ✅ Detail modal "Quest Link" section: pick the target quest from a dropdown (quests across all chapters) |
| Import / export fidelity | ✅ `linked_quest` read on import (SNBT + JSON5), written on export in both subdirs & flat layouts (`QuestLink.java:writeData` equivalent) |

---

## 13. Progress testing / simulation

FTB exposes **Reset Progress** and **Complete Instantly** per-object (`QuestScreen.java:303-311`) and globally (`OtherButtonsPanelBottom.java:125-130`). ModCanvas provides an editor-side progress simulation (ephemeral, never serialized): a **Simulate** toolbar toggle dims hidden/locked quests per FTB's `Quest.isVisible` chain, with **Complete All** / **Reset All** per chapter, double-click to toggle a quest's completion on the canvas, and Complete/Reset in the quest detail modal.

| Capability | ModCanvas |
|---|---|
| Reset progress (per object / global) | ✅ Simulate mode → Reset All / double-click / detail-modal Reset |
| Complete instantly (per object / global) | ✅ Simulate mode → Complete All / double-click / detail-modal Complete |
| Progress preview / dependency-visibility simulation | ✅ `core/quest/progress.ts` (`computeVisibility`/`isLocked`), dim + hidden/locked badges live on canvas |

---

## 14. Canvas & editing tools

| Tool | FTB | ModCanvas |
|---|---|---|
| Zoom / pan / fit | ✅ | ✅ |
| Grid snap + Shift = free move | ✅ | ✅ |
| Multi-select (box) | ✅ | ✅ |
| Select All | ✅ (Ctrl+A) | ❌ |
| Copy / paste (quests, tasks, images, links) | ✅ (Ctrl+C/V + right-click paste) | ❌ |
| Cut / duplicate / bulk delete | ✅ | ❌ (per-node delete only) |
| Nudge selected (arrow keys) | ✅ | ❌ |
| Align / distribute tools | ✅ (from FTB library multi-select menu) | ❌ (exists only in dead legacy code) |
| Dependency cycle detection + warning | ✅ | ✅ `quest-edges.tsx` |
| Dependency edge drawing / reconnect / delete | ✅ | ✅ |
| Quest search / filter bar | ✅ (KEY_GUI_SEARCH) | ❌ |
| Extended-info / dependency-highlight hover | ✅ | 🟡 Hover highlight/dim exists |
| Move tool / auto-pin | ✅ | 🟡 Drag built-in; no explicit tool |
| Undo / redo | ❌ (not in FTB) | ❌ |
| Emergency items | ✅ | ❌ |
| Reward tables screen | ✅ | ❌ |
| Key reference / guides / wiki | ✅ | ❌ |
| Editing-mode toggle | ✅ | ❌ (app is always an editor) |

---

## 15. Import / export fidelity

| Concern | FTB | ModCanvas | Notes |
|---|---|---|---|
| Flat-chapter layout (`quests/chapters/*.snbt`) | reads | ✅ export | |
| Subdirs layout (`<chapter>/chapter.snbt`) | reads | ✅ export | |
| Layout choice | — | ❌ Always writes **both** layouts; no user choice | |
| Subdirs export completeness | — | 🟡 Drops chapter icon / progression_mode / default_quest_size / description | `export.rs:195-231` |
| Comment-preserving writes | — | ✅ atomic `.tmp` + AST-preserving | |
| Legacy key aliases | — | 🟡 `min_width` vs `min_window_width`; `invisible` vs `invisible_until_completed` asymmetries | |

---

## Priority shortlist — what to build first

Highest-value gaps to close (in suggested order):

1. ✅ **Per-chapter editing** (rename, icon, default shape/size/color, progression mode, reorder, delete) + parse/export the missing chapter fields.
2. ✅ **Chapter-group editing** (create/rename/reorder/assign) + write `chapter_groups.snbt`.
3. ✅ **Copy / paste / select-all / arrow-nudge / bulk delete** — cheap canvas wins, unblocks most FTB workflows.
4. ✅ **Progress simulation** — Complete All / Reset All per chapter, double-click toggle, visibility/lock preview via `core/quest/progress.ts`.
5. ✅ **Quest-link support** (create link nodes, render, edit target).
6. ✅ **Reward tables** — weighted table editing + wire `table_id`/`reward_chests` through import/export; make choice/all_table/random payloads editable.
7. ✅ **Global `data.snbt` settings UI** (reward team, consume items, autoclaim, detection delay) + read them on import instead of hardcoding on export.
8. ✅ **Remaining per-quest fields UI**: invisible-until, hide-details/text-until, min_required_dependencies, dependency_requirement, repeat cooldown (FTB-canonical `repeat_cooldown`), hide lock icon, guide page, max_completable_dependents.
9. **Task/reward field completion**: kill nbt_filter & custom_name & type tag, location W×H×D box, observation timer/type/target, item only_from_crafting & task_screen_only, reward permission_level/silent/random_bonus/only_one, per-task title/icon/description.
10. **Canvas tools**: quest search bar, alignment/distribute, undo/redo, editing-mode toggle.
