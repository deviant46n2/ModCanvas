# Mods Tab

The Mods tab is the project's mod-management surface: browse installed mods,
toggle them on/off (individually or in bulk), and search Modrinth / CurseForge
to **download and install** new ones straight into the selected Prism
instance's `mods/` folder. It is a local, offline-first feature — the only
network traffic is the user-initiated Modrinth/CurseForge search and download.

## Layout

- **Project Mods** — a responsive multi-column grid (`repeat(auto-fill,
  minmax(280px, 1fr))`) of compact cards. Each card shows:
  - a per-row selection checkbox (feeds the bulk action bar),
  - a 36 px thumbnail — the mod's own jar icon (extracted by
    `extract_mod_info_from_jar` and stored on `ModEntry.icon`), a Modrinth /
    CurseForge URL, or a rounded monogram fallback (never a broken image),
  - name + author on one line, a two-line ellipsized description,
  - source badge (Modrinth/CurseForge), version chip, download count, and a
    warning dot when required dependencies are missing,
  - the per-row ON/OFF pill switch and a remove button.
- **Bulk actions** — checking any row reveals the bulk bar with *Enable
  selected* / *Disable selected*; the header checkbox selects/deselects every
  mod in the filtered list. Bulk toggling calls the existing `toggleModEnabled`
  IPC path once per selected mod.
- **Add Mods** — the same compact row layout (thumbnail, name, description,
  meta, `+ Add` button) with the Modrinth/CurseForge source tabs preserved.
  The selected tab controls which registry is searched; search results carry a
  `source` tag from the backend.

## Install Flow

`+ Add` on a search result now performs a **real install** (not just a DB row):

1. `install_mod_from_search` (`src-tauri/src/commands/modpack.rs`) resolves the
   project's instance dir, path-validates `<instance>/mods`, and downloads:
   - **Modrinth** — `ModIntelligence::download_mod` picks the latest version
     matching the project's loader + MC version.
   - **CurseForge** — `resolve_curseforge_file` queries
     `GET /v1/mods/{id}/files` (game version + `modLoaderType` filter), skips
     early-access/unavailable files, and downloads the best match via
     `download_curseforge_mod_for_version`. Requires an API key (Settings →
     gear icon), or the `CURSEFORGE_API_KEY` env var / baked key.
2. The downloaded jar is written atomically (`.tmp` + rename) with the filename
   sanitized so a URL can't escape the `mods/` dir (`sanitize_filename`).
3. The jar is re-inspected with `extract_mod_info_from_jar` so the DB row
   carries the real `mod_id` / `version` / description / jar icon; search
   metadata is the fallback.
4. The `ModEntry` is upserted into the DB and returned; the frontend reloads
   the project's mod list and shows a success/error toast. Per-row buttons
   switch to a disabled "Installing..." state while the download runs.

Notes: after installing, the jar is visible to Prism and the game immediately
(next launch). Quest-editor textures/items for the new jar appear after the
next Refresh / texture re-index (`scan_instance_textures` validates layer
metadata so it picks up new jars). Dependencies are not auto-installed yet —
"Load Dependencies" fills the metadata map for the compat checks.

## Backend & Data Flow

- `ModMetadata` (both `src-tauri/src/models.rs` and the frontend type in
  `frontend/src/services/types.ts`) now carries `icon: Option<String>` /
  `icon: string | null` and `source: String` / `source: 'modrinth' |
  'curseforge'`. The backend tags each search result with its registry.
- `search_mods` accepts a `source` arg (`modrinth` | `curseforge` | `all`) and
  only queries the requested registry (CurseForge is skipped without an API
  key), then dedupes by `mod_id`.
- **CurseForge results are never dropped for a version mismatch.** The search
  response's `gameVersions` are mapped into `supported_versions`, and any
  result whose available versions don't cover the pack's MC version (exact, or
  a `1.21` covers `1.21.1`-style prefix) is kept but tagged
  `mismatch = "Version: requires …"`. The UI shows a "diff version" warning
  chip (tooltip = reason) and mismatches sort below exact matches. Installing
  a mismatched result still works — `resolve_curseforge_file` picks the newest
  available file.
- **Modrinth deliberately has no mismatch handling.** Its search facet
  (`["versions:1.21.1"]`) only returns projects with a real file for the exact
  version, so non-matching results never appear — there is nothing to rescue or
  mark. Applying the CurseForge "diff version" treatment here would only add
  dead UI. If broader results are ever wanted, expose it as an opt-in toggle
  (e.g. "include 1.20/1.21 results" that widens the facet), not automatic
  marking.
- Icon URLs are **parsed from responses the backend already fetches** — no new
  network calls:
  - Modrinth search hits (`ModrinthHit.icon_url`) and project detail
    (`ModrinthProject.icon_url`);
  - CurseForge mod info `logo.thumbnailUrl`.
- Installed mod rows resolve their icon from the DB `ModEntry.icon` (jar icon
  extracted at scan/install time); search rows use the result's own `icon`.
- Thumbnails render through `ModThumb` in `frontend/src/components/common/rows.tsx`:
  a `null`/missing icon or an `<img>` `onError` falls back to a monogram tile,
  so the layout never breaks.

## Components

- `frontend/src/components/common/ModsTab.tsx` — grid layout, filter input,
  selection state (`Set<mod_id>`), header select-all, bulk bar, compatibility
  panel, search + install section.
- `frontend/src/components/common/rows.tsx` — `ModRow`, `SearchResultRow`,
  `ModThumb`, and the shared `sourceKey` helper. `SearchResultRow` takes
  `installingIds` and shows a per-row "Installing..." state.
- `frontend/src/hooks/useModState.ts` — `addModToProject` calls
  `install_mod_from_search`, tracks `installingIds`, and surfaces results via
  the app toast system. `handleSearchMods` passes the active source tab.
- `frontend/src/services/mods.ts` — `searchMods`, `installModFromSearch`.

