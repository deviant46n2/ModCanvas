# Launcher

The launcher (`frontend/src/components/launcher/Launcher.tsx`) is the app's
landing screen. It replaces the old sidebar project browser + welcome screen.
It renders whenever no pack is open; the workspace renders otherwise
(`App.tsx` gates on `openProject`).

## Single-pack model

Exactly one pack is open at a time. **Opening a pack is a full load** — there
is no pack list inside the workspace and no "Load Pack" step (see
`docs/load-pack.md`). Leaving the workspace (header **Projects** back button)
is guarded by the dirty-pack Save / Discard / Cancel prompt
(`docs/workspace-actions.md`).

## Layout

```
┌──────────────────────────────────────────────────────────┐
│ [logo] ModCanvas        [Prism] [Refresh] [Import] [New] │
├──────────────────────────────┬───────────────────────────┤
│ project list (source badges) │ preview pane              │
│   • Pack A            ModCanvas │   name, badge          │
│   • Pack B                Prism │   MC / loader / ver    │
│                                │   path / description    │
│                                │   [Open] [Delete]      │
└──────────────────────────────┴───────────────────────────┘
```

## Interactions

- **Single-click** a project → selects it for the metadata preview (never opens
  it).
- **Double-click**, **Enter**, or the preview **Open** button → `openPack`,
  which runs the full cache-aware load behind `LoadPackModal`.
- **Refresh** → reloads the project list (`list_projects`, which re-syncs Prism
  instances additively).
- **Prism** → `open_prism_launcher` (browse instances in Prism Launcher).
- **Import** → the Import modal (.zip / .mrpack / .toml, or drop a pack file
  onto the window).
- **New Project** → creates a pack and opens it.
- **Delete** → targets the selected project; gated by `DeleteConfirmModal`.

## Source badges

Each row carries a badge derived from the project's `source` field:

- **ModCanvas** (`source = "modcanvas"`) — manual projects and imported packs
  (.mrpack / CurseForge / packwiz / instance).
- **Prism** (`source = "prism"`) — instances synced from a live Prism Launcher
  install by `Database::sync_prism_instances`.

The backend adds the column via migration (`ALTER TABLE projects ADD COLUMN
source TEXT DEFAULT 'modcanvas'`) and sets it on insert/update during the Prism
sync.

## State

`useProjectState.ts` owns both `openProject` (the workspace pack) and
`selectedProject` (the launcher preview highlight). They are deliberately
separate concepts: selection never triggers a load.

## Files

- `frontend/src/components/launcher/Launcher.tsx`
- `frontend/src/hooks/useProjectState.ts` (`openProject`, `selectedProject`,
  `openPack`, `closePack`, `selectProject`)
- `frontend/src/App.tsx` (renders launcher vs workspace)
- `frontend/src/App.css` (`.launcher*`, `.launcher-badge`, `.badge-*` styles)
- Backend: `src-tauri/src/db.rs` (`source` column),
  `src-tauri/src/models.rs` (`Project.source`)
