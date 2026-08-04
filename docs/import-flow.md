# Import Modpack Flow

How a pack (`.mrpack`, CurseForge `.zip`, packwiz, or instance folder) is
brought into ModCanvas. Applies to the **Import Modal**
(`frontend/src/components/common/modals.tsx`) and its state wiring in
`frontend/src/hooks/useAppState.ts`.

## Opening the modal

- **Project list / sidebar** → "Import" opens the Import Modal.
- **Drag-and-drop** — dropping a `.zip`, `.mrpack`, or `.toml` file anywhere
  on the window opens the modal pre-filled with that file's absolute path
  (`useAppState.ts` listens to `getCurrentWindow().onDragDropEvent`).

## Selecting a file

The **Browse** button calls `pick_import_file` (Rust), which spawns a
standalone GTK picker (`zenity --file-selection`, falling back to
`kdialog`) and returns the selected absolute path.

**Why not `tauri-plugin-dialog` / `rfd`:** the dialog plugin's Linux backends
are unreliable on Wayland. rfd's default **gtk3** backend opens a GTK dialog
window that fails to map on some compositors (notably COSMIC), so nothing
appears and the IPC promise never resolves. Switching to rfd's **xdg-portal**
backend doesn't help: it shells out to `zenity`/`kdialog` for file dialogs,
and — where the portal's own FileChooser impl (e.g. COSMIC's) creates the
D-Bus request but never presents a window — the call still hangs. A standalone
`zenity` process renders its own top-level window and works on Wayland.

**Runtime dependency:** `zenity` (GTK) or `kdialog` (KDE) must be installed.
On Arch: `sudo pacman -S zenity`.

Defensive UX (kept regardless of backend):

- The path input is **editable** — paste/type the full path manually.
- **Drag-drop** provides real absolute paths via Tauri's native drop event
  (unlike a hidden `<input type="file">`, which does not expose paths on
  WebKitGTK — `File.path` is an Electron/NW.js extension, not available here).
  Note: wry's WebKitGTK drag-drop has historically been unreliable on Linux;
  the editable input + zenity Browse are the primary paths.

## Import

**Import** calls `auto_import_pack(path)` (Rust), which auto-detects the
format in order:

1. `.mrpack` (or dir containing `modrinth.index.json`) → MrPack importer
2. `.zip`/`.curseforge` containing `manifest.json` → CurseForge importer
3. dir with `pack.toml` + `index.toml` → packwiz importer
4. dir with `instance.json` / `mmc-pack.json` / `mods/` → instance importer
5. otherwise → **"Unsupported pack format"**

A zip only imports if it is a CurseForge-format pack (has `manifest.json`
inside). A bare zip of a modpack folder is not detected; it must be extracted
and imported as an instance folder, or re-zipped with a `manifest.json`.

### CurseForge importer

The CurseForge importer (`src-tauri/src/imports/curseforge.rs`) **extracts the
zip into a persistent per-import game directory** under
`~/.local/share/modcanvas/imports/<name>-<short-id>` (same `imported_pack_extract_dir`
mechanism as `.mrpack`). `overrides/` is merged into the game-dir root, so
`project.path` points at a real, launchable game dir — not at the `.zip`. This
was the historical bug: the old importer left `project.path` pointing at the
zip file, producing a "phantom" project with no files.

When a CurseForge API key is configured (`CURSEFORGE_API_KEY` in `.env`, or
the DB setting), `import_curseforge_zip` also **downloads every declared mod
jar** via `GET /v1/mods/{modId}/files/{fileId}` (per-file endpoint, 4 in
flight) into the game dir's `mods/` folder, and stores real metadata in the
DB. Without a key — or for mods whose download fails — placeholder entries are
stored instead, so the mods list still reflects what the pack declares.

> **API key gotcha:** CurseForge rejects invalid keys with HTTP 403 on every
> endpoint. A key that looks like `$2a$10$...` (bcrypt-hashed) or that returns
> 403 on `GET /v1/mods/<id>` is not usable. Get a real key from the
> [CurseForge Console](https://console.curseforge.com/) and put it in `.env`
> as `CURSEFORGE_API_KEY=<token>`. Verify with:
> `curl -H "x-api-key: $KEY" -H "Accept: application/json" \
>   https://api.curseforge.com/v1/mods/1217060` → expect HTTP 200.

Extraction specifics worth keeping in mind:

- Entry paths are sanitized with `sanitize_zip_entry_path` (traversal/symlink
  defense). The `overrides/` prefix strip must go through `Path::strip_prefix`
  (not `str::strip_prefix`, which drops the separator and yields an absolute
  path — a regression that broke extraction with `Permission denied`).
- Config-file collection skips binary/non-UTF8 files (e.g.
  `config/inventory-particles/cache/**/*.png` and `.cached` files crash
  `read_to_string`).

## Files

- `frontend/src/hooks/useAppState.ts` — `pickImportPath`, `importPack`,
  drag-drop listener.
- `frontend/src/components/common/modals.tsx` — `ImportModal`.
- `frontend/src/services/project.ts` — `pickImportFile` invoke wrapper.
- `src-tauri/src/commands/modpack.rs` — `pick_import_file` (zenity/kdialog),
  `import_curseforge_zip` + `download_curseforge_manifest_mods`,
  `auto_import_pack` + importers.
- `src-tauri/src/imports/curseforge.rs` — `CurseForgeImporter` (zip → game dir).
