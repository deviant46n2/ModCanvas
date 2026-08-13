# Pack Loading & Refresh Flow

Opening a pack IS loading it. There is no separate "Load Pack" button anymore:
from the launcher you **Open** a pack, and the full cache-aware load pipeline
runs behind a progress modal. Once loaded, **Refresh** / **Force Full Re-index**
re-run the same pipeline. See `docs/launcher.md` for the launcher screen and
`docs/workspace-actions.md` for the header actions.

## What opening a pack does (in order)

`useAppState.openPack(project)` (formerly `loadPack`) runs this pipeline and
shows `LoadPackModal` progress:

1. **Textures** — `ingest_active_instance_cmd` scans every mod jar under
   `mods/` (plus `kubejs/assets`) for item textures and builds a compact
   descriptor index. Results are cached on disk (`~/.cache/modcanvas/ingest_*.json`)
   and validated against the current jar set, so repeat loads are fast.
2. **FTB Quests** — `import_ftb_quests_from_dir` reads the instance's quest
   data and saves the resulting graph to the database.
3. **Mods** — `scan_instance_mods` scans the instance `mods/` folder and
   registers each mod; the DB project mods are then loaded.
4. **Configs** — the project's config files are loaded for the Configs tab.

The pipeline is shared (`runLoadPipeline(project, force, wasLoaded)` in
`useAppState.ts`) by open, refresh, and force re-index. `force` is forwarded to
`ingest_active_instance_cmd`, which **discards the ingest cache** so a
same-size/same-mtime file replacement is still picked up.

If a fresh open fails, the workspace rolls back to the launcher (the modal keeps
showing the error). If a refresh fails, the previously loaded data is kept.

## Progress reporting

The backend emits granular, per-jar progress during texture scanning via a
Tauri event (`modcanvas-load-pack-progress`, payload `IngestProgress`):

```ts
interface IngestProgress {
  stage: 'textures'
  message: string
  progress: number      // 0-100 (coarse stage weight)
  file?: string          // current jar name
  done?: number          // jars processed
  total?: number         // total jars
}
```

`useAppState` subscribes to this event and merges it into `LoadPackProgress`
(never letting the bar regress, via `Math.max`). The remaining stages
(quests/mods/configs) advance through explicit progress updates in
`runLoadPipeline`. `LoadPackModal` renders the stage label, message, detail
line, and a `file` / `done / total` line so loading feels file-by-file.

### Scans never block the UI thread

The first texture pass on a large, never-run pack (no disk cache) can take tens
of seconds — 33s on a 479-mod instance. All heavy load-path commands run off
the main thread so the webview stays responsive: `ingest_active_instance_cmd`,
`scan_instance_textures_cmd`, `scan_instance_animations_cmd`,
`scan_instance_items_cmd`, `import_ftb_quests_from_dir` (and `_one_click`) use
`tauri::async_runtime::spawn_blocking`; the State-based mod scans
(`scan_instance_mods`, `sync_instance_mods`) are `async fn` commands that run
on the async runtime. The result is a live progress bar during first load
instead of a frozen window. The on-disk texture/ingest caches keep every later
load instant.

### Materialization speed + UI jank

The texture index is a one-time disk-cached scan; what runs on **every** open
is materialization (reading each referenced PNG and base64-encoding it). Two
measures keep that fast and smooth:

- **Rust `materialize.rs`** keeps a process-wide LRU cache of open
  `ZipArchive` handles (cap 256) instead of re-parsing each jar's central
  directory per 200-key batch — a 50k-entry jar costs ~78ms to open, which
  made materialization ~8× slower. Reusing handles cut 4000 keys from ~16s to
  ~1.9s.
- **Frontend** raises `BATCH_SIZE` to 500 and **coalesces re-renders**:
  `QuestBookEditor` bumps `textureTick` at most once per 120ms instead of once
  per batch, so the canvas doesn't rebuild all nodes hundreds of times while
  textures stream in.

## Refresh / Force Full Re-index

- **Refresh** (header button, or Project menu → Pack) re-runs the load pipeline
  cache-aware: `scan_instance_textures` / `scan_instance_animations` /
  `scan_instance_items` auto-detect jar/kubejs changes via `(name,size,mtime)`
  layer validation, `scan_instance_mods` rescans the mods folder, config files
  are re-listed, and the quest graph is re-read from disk.
- **Force Full Re-index** (Project menu → Pack) is Refresh with `force = true`:
  the ingest cache is deleted before scanning, so a file replaced in place
  (same size, same mtime) is picked up.

## App-start behavior (important)

- On launch, if a last-opened project is remembered (`modcanvas:last-project-id`),
  it is **reopened with the full cache-aware load** (`openPack`), not just
  re-selected. Warm caches make this fast; a cold pack shows the progress modal.
- If no last project matches, the app stays on the launcher.

## Single-pack model

Exactly one pack is open at a time. The workspace is shown only when
`openProject` is set (`useProjectState.ts`); otherwise the launcher is shown.
There is no pack list inside the workspace — the header **Projects** button
returns to the launcher (guarded by the dirty-pack Save / Discard / Cancel
prompt, see `docs/workspace-actions.md`).

## Project list persistence

The project list is the SQLite `projects` table
(`app_data_dir/modcanvas.db`) — the **persistent source of truth**. On every
`list_projects` call the backend re-scans the instance roots and calls
`Database::sync_prism_instances`, which is **strictly additive**: live
instances are inserted or updated in place by their `game_dir` path, but rows
are **never deleted** by the sync.

Each project row carries a `source` column (`"modcanvas"` for manual/imported
packs, `"prism"` for Prism-synced instances) that drives the launcher's source
badges.

This is deliberate. Deleting a Prism instance in the launcher, deleting an
imported pack's folder, or losing the instance-scan root (the app can fall
back between the Prism roots and `app_data/instances`) must not silently wipe
a project the user has worked on. Projects leave the list only through an
explicit **Delete** action (`delete_project` command), which also removes the
pack's files on disk.

## Instance root discovery

`InstanceManager` scans **all** existing Prism instance roots and merges the
results, so instances spread across several Prism installs all appear. On
Linux the candidates are the native root
(`~/.local/share/PrismLauncher/instances`), the Flatpak root
(`~/.var/app/org.prismlauncher.PrismLauncher/data/PrismLauncher/instances`),
and the data-local root; duplicates are de-duplicated by canonical path
(`LauncherDriver::resolve_instance_roots`). The **primary** root — the first
existing candidate, or whichever has the most instance subdirectories
(`resolve_instance_root`) — is where new instances are created. If no Prism
root exists, `app_data/instances` is the single fallback root, and the
`MODCANVAS_INSTANCES_DIR` env var overrides all of the above.

> Historical bug (fixed): `resolve_instance_root` used to pick a **single**
> root by "most subdirectories", and `upsert_prism_instances` ran
> `DELETE FROM projects WHERE path NOT IN (live paths)` on every sync.
> Instances in the non-selected root were invisible, and whichever scan won
> wiped the other root's projects from the DB — so deleted-instance packs and
> live packs flip-flopped and never coexisted.

## Files

- Backend: `src-tauri/src/ingest/` (`IngestProgress` in `models.rs`,
  `ingest_active_instance_with_progress`, `ingest_active_instance_cmd`,
  `force` flag), `src-tauri/src/db.rs` (`sync_prism_instances`, `source` column)
- Frontend: `frontend/src/hooks/useAppState.ts` (`openPack`, `refreshPack`,
  `runLoadPipeline`, event listener), `frontend/src/components/common/LoadPackModal.tsx`
