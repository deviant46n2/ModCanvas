# Global History (undo / redo)

A single, app-wide, chronologically ordered history shared by every editing
surface (quest canvas, config editor, raw scripts). Ctrl+Z / Ctrl+Y walk one
timeline across tool switches, so "move a quest → switch → edit a config →
undo" reverses that exact sequence in the same order.

## Module layout (Data/Parsers layer)

- `frontend/src/core/history/store.ts` — `HistoryStore`
  - `commit(entry, { split })` records one logical edit. Consecutive edits of
    the same `(subject, target)` inside the coalescing window are folded into a
    single undo gesture (e.g. all the state updates of one node drag collapse
    to one Ctrl+Z). Pass `split: true` for discrete actions (add node, rename)
    so they each get their own undo step.
  - `undo()` / `redo()` step the cursor and return the entry whose `before` /
    `after` the caller must reapply; `peekUndo()` surfaces the top entry for
    toolbar/button visibility.
  - `snapshot()` feeds a history drawer; `exportJournal()` produces durable,
    JSON-flattened records with a `present` flag mirroring the cursor.
  - `loadJournal(records)` rehydrates a store from a journal (preserving
    presence and id/group counters) so history survives app restarts.
  - In-memory trim caps `maxEntries` (oldest dropped, presence preserved).
  - Subjects: `'graph'` | `'config'` | `'text'`.
- `frontend/src/core/history/journal.ts` — durable `.jsonl` codec
  - `encodeJournal` / `parseJournal`: one JSON record per line; corrupt lines
    are skipped individually so one bad line never loses the rest.
  - `parseContent` / `store.rehydrate`: reassemble flattened string vs object
    payloads.

## I/O / driver layer

- `frontend/src/services/history.ts` — invokes the backend journal commands.
- `src-tauri/src/commands/history.rs` — `read_history_journal` /
  `write_history_journal`: read/write the per-project journal (atomic write,
  EBUSY-safe).
- `src-tauri/src/path_safety.rs` — `history_journal_path` /
  `history_journal_path_in`: resolves `<cache>/history/<project-id>/journal.jsonl`,
  validates the project id (Uuid), and creates the directory. Tested against
  traversal and round-trip.

## Wiring (React)

- `frontend/src/hooks/history-provider.tsx` — `HistoryProvider` + `useHistory()`:
  - Owns one `HistoryStore` per active project (`attachProject`), loads its
    journal on open, and debounced-persists `exportJournal()` after every change.
  - Provides `commit`, `undo`, `redo`, `register(subject, handler)`, and the
    global Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y key handler (skipped inside inputs).
  - `undo()`/`redo()` route the popped entry to the registered apply handler for
    its subject, which re-applies the before/after snapshot to live state.
- `App.tsx` wraps the workspace in `HistoryProvider`.
- `QuestBookEditor` — `commitGraph` commits each graph mutation into the shared
  store (removing its old local undo/redo); a `'graph'` handler restores
  snapshots to the canvas. Undo/redo is keyboard-only (Ctrl+Z / Ctrl+Y) —
  the canvas toolbar buttons were removed as surface duplication (s49-followup).
- `useConfigState` / `ConfigsTab` — `updateConfigValue` commits before/after
  `ConfigValue` trees into the store; raw-mode textarea edits go through
  `setRawConfigContent`, which commits the before/after file content too (rapid
  keystrokes coalesce into one step). The undo button appears only when the top
  history entry is a config edit (`canUndoConfig`).

## Cross-tool routing (auto-switch)

When a history step targets an editor whose owning tab is not active, the
`HistoryProvider` routes the restore so it is still applied:

- `App.tsx` registers a `HistoryRoute` per subject:
  - `graph`: `restore` persists the snapshot back to the backend
    (`saveQuestGraph`) and `navigate` switches to the quests tab; when the
    editor remounts it loads the restored graph from the quest cache.
  - `config`: `navigate` switches to the configs tab.
- `useConfigState`'s `'config'` handler opens the target file (if it isn't the
  one already open) with the restored tree, so a config undo made from another
  tab is visible on return.
- A route runs on every undo/redo **in addition to** the mounted editor's
  in-memory handler, so the canonical (persisted) state always matches the
  undone history step.

## History rules

1. **Chronological, cross-tool order** — undo always pops the newest edit,
   regardless of which tool made it.
2. **Gesture coalescing** — same resource edited within `coalesceWindowMs`
   (default 1000 ms) folds into one undo step; `split` forces a boundary.
3. **Branch truncation** — a fresh edit after an undo drops the redo branch.
4. **Durability** — the provider persists `exportJournal()` (debounced, atomic)
   and rehydrates on project open, so history survives restarts.
5. **Bounded memory, full log** — memory keeps a short window for instant
   Ctrl+Z; the durable journal holds the long history.

## Timeline drawer (history UI)

- `frontend/src/components/history/HistoryDrawer.tsx` — floating drawer opened
  from the "History" button (top-right of the workspace). Lists every recorded
  entry in chronological order with subject badge, label, target filename,
  relative time, and an "undone" strike-through for redo-branch entries; the
  current position is highlighted with an accent border and a "now" badge.
- Time travel: clicking any entry calls `jumpTo(index + 1)`, which applies the
  intermediate steps (`before` for undoing entries, `after` for redoing) in
  order through the normal routing pipeline, so the whole workspace lands at
  that exact point in the timeline.
- The drawer also exposes Undo / Redo buttons (same as Ctrl+Z / Ctrl+Shift+Z).

## Quest working-graph persistence

The editor's quest working graph (the `QuestGraph` the canvas edits and that
history undo/redo snapshots restore) is stored in a hidden `.modcanvas/`
state directory under the project/instance root — `<instance>/.modcanvas/quests.json`
— so it survives restarts alongside the durable history journal:

- `src-tauri/src/path_safety.rs` — `quest_graph_path(project_path)` resolves the
  `.modcanvas/quests.json` path, creates the state dir, and validates the result
  stays strictly inside the project root (traversal/symlink defense).
- `src-tauri/src/quest_cache.rs` — `load(project_id, graph_path)` reads from the
  workspace state file (cached in-memory), and migrates the legacy
  `{temp}/modcanvas_configs/{pid}/quests.json` working graph into the workspace
  the first time a project opens after the layout change.
- `src-tauri/src/commands/quest_graph.rs` — `get_quest_graph` / `save_quest_graph`
  resolve the project from the DB and read/write the workspace state file via
  atomic writes; all quest mutation commands now take `db: State<Database>`.
- `load_quest_from_pack` (import/ingest) and `export_ftb_quests_to_dir` also
  use the workspace state file instead of the temp mirror.

This is what makes quest undo durable across restarts: `saveQuestGraph` writes
to the instance-scoped file, `getQuestGraph` reloads it on project open, and the
history journal restores snapshots against it.

## Known limitations / next steps

- Raw-mode config edits are recorded per-keystroke into a single coalesced
  step; a "split on save" gesture (so each explicit save is its own undo step)
  is not implemented yet.

## Tests

`frontend/src/core/history/store.test.ts` covers ordering, cross-tool undo,
gesture coalescing, `split`, time-window breaks, branch truncation, bounding,
journal round-trips, corrupt-line recovery, `loadJournal` rehydration,
`peekUndo`, and `jumpTo` time travel (forward, backward, clamp). Rust
`path_safety` tests cover journal path scoping, invalid-id rejection, atomic
round-trip, and the `.modcanvas/quests.json` workspace-path scoping; `quest_cache`
tests cover disk reads, cache invalidation, and legacy temp-mirror migration.