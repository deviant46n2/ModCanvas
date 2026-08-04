# Load Pack Flow

The **Load Pack** button (workspace header, `topbar.tsx`) loads an instance into
the app: textures, FTB Quests, instance mods, and configs. It is the header's
primary action while no pack is loaded; once loaded, **Test** takes over the
primary slot and the pack can be closed from the **Project** menu. See
`docs/workspace-actions.md`. This document describes what it does, how progress
is reported, and the app-start behavior.

## What "Load Pack" does (in order)

1. **Textures** — `ingest_active_instance_cmd` scans every mod jar under
   `mods/` (plus `kubejs/assets`) for item textures and builds a compact
   descriptor index. Results are cached on disk (`~/.cache/modcanvas/ingest_*.json`)
   and validated against the current jar set, so repeat loads are fast.
2. **FTB Quests** — `import_ftb_quests_from_dir` reads the instance's quest
   data and saves the resulting graph to the database.
3. **Mods** — `scan_instance_mods` scans the instance `mods/` folder and
   registers each mod; the DB project mods are then loaded.
4. **Configs** — the project's config files are loaded for the Configs tab.

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
(quests/mods/configs) advance through explicit progress updates in `loadPack`.
`LoadPackModal` renders the stage label, message, detail line, and a
`file` / `done / total` line so loading feels file-by-file.

The ingest command gained an `AppHandle` parameter to emit these events; the
underlying scanner is still cache-validated so a cached reload is instant
(progress jumps to the cached result rather than re-scanning).

## App-start behavior (important)

- On launch, if a last-opened project is remembered, it is re-selected so the
  workspace returns to that pack — but **mods/configs are NOT auto-loaded**.
  They load only when the user clicks **Load Pack**. This keeps app startup
  fast; the Mods tab is empty until the pack is explicitly loaded.
- This was a deliberate change: previously `useEffect([selectedProject])`
  called `loadProjectMods` on every open, which slowed startup.

## Project list persistence

The sidebar project list is the SQLite `projects` table
(`app_data_dir/modcanvas.db`) — the **persistent source of truth**. On every
`list_projects` call the backend re-scans the instance roots and calls
`Database::sync_prism_instances`, which is **strictly additive**: live
instances are inserted or updated in place by their `game_dir` path, but rows
are **never deleted** by the sync.

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

- Backend: `src-tauri/src/ingest.rs` (`IngestProgress`,
  `ingest_active_instance_with_progress`, `ingest_active_instance_cmd`)
- Frontend: `frontend/src/hooks/useAppState.ts` (`loadPack`, event listener),
  `frontend/src/components/common/LoadPackModal.tsx`
