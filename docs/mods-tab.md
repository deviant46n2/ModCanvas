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

## Removing mods

The per-row **remove (X)** button deletes the jar from the instance **and** the
DB row, atomically:

- `remove_mod` (`src-tauri/src/commands/project.rs`) looks up the row's stored
  `file_name` (bare jar name under `<instance>/mods/`), path-validates it
  (rejects separators / `..` traversal; `remove_file` on a symlink removes the
  link, never its target), deletes the file, then deletes the row.
- **File delete fails** (permissions, Windows JVM lock `EBUSY`): the command
  errors and the row is **kept** — the mods list never claims a mod whose jar
  is still present.
- **File already missing** (deleted outside ModCanvas): the row is still
  removed and the UI shows a warning toast ("its jar was already missing").
- **No stored `file_name`** (legacy rows, toggle-as-add, placeholder rows with
  no download): row-only removal, success toast.

`ModEntry.file_name` is populated at install/import time: instance and mrpack
imports thread the jar path through `UnresolvedMod → ResolvedMod → ModEntry`;
CurseForge downloads and search-installs record the written jar's basename.
The upsert (`db.rs add_mod`) deliberately omits `file_name` from its
`ON CONFLICT DO UPDATE` list so the toggle-as-add path cannot wipe a stored
name. Existing DBs get the column via the `pragma_table_info` + `ALTER TABLE`
migration in `db.rs init_schema`; old rows stay NULL (no backfill — re-deriving
the row→file link by scanning jars would be the aliasing trap).
- **Bulk actions** — checking any row reveals the bulk bar with *Enable
  selected* / *Disable selected*; the header checkbox selects/deselects every
  mod in the filtered list. Bulk toggling calls the existing `toggleModEnabled`
  IPC path once per selected mod.
- **Add Mods** — the same compact row layout (thumbnail, name, description,
  meta, `+ Add` button) with Modrinth/CurseForge **source toggles** (multi-select,
  default both on). Search queries every selected registry; results carry a
  `source` tag from the backend. Deselecting **all** sources disables the search
  input/button and shows "Select at least one source to search." — an explicit
  empty state, never a silent no-op.

## Install Flow

**Result ordering** (s33): each registry returns its own relevance order, and
the merged list preserves it — a stable sort sinks version-mismatched rows to
the bottom without reordering the rest. On top of that, an **exact-match
lift**: if a result's slug equals the query normalized (lowercase, spaces and
punctuation stripped — `"project e"` → `projecte`), it rises above all loose
matches from either registry, because an exact slug is definitionally the best
answer. CurseForge gets a **slug fallback**: CF's fuzzy `searchFilter` can
miss an exact-name mod entirely (ProjectE returns only its addons), so when
the fuzzy pass doesn't already contain the mod, a second `slug=` query runs
and prepends the hit. Merge lives in
`src-tauri/src/commands/modpack/search_merge.rs` (sort + dedup + lift);
normalization shared with `mod_intelligence/curseforge_search.rs`.

Search rows carry a **version-mismatch note** when a CurseForge result's
latest file targets a different MC version than the project. Mismatched rows
show an **"Unavailable"** button (disabled, mismatch as tooltip) — a click
can no longer dead-end into a cryptic download error. The CurseForge
no-file error itself names the requested loader + MC version.

The Add Mods search has a **category filter** (Modrinth only): a dropdown
with Modrinth's mod categories (Magic, Technology, …). The selected slug is
added to the search facets as `["categories:<slug>"]` — the same facet
mechanism the loader filter uses — so results are scoped to the category for
the project's loader + MC version. CurseForge has no equivalent facet: while
a category is selected, the CurseForge source is **paused** (skipped
server-side) and the UI shows why — otherwise unfiltered CF results mixed
into a category search would make the filter look broken.

`+ Add` on a search result now performs a **real install** (not just a DB row):

1. `install_mod_from_search` (`src-tauri/src/commands/modpack.rs`) resolves the
   project's instance dir, path-validates `<instance>/mods`, and downloads:
   - **Modrinth** — `ModIntelligence::download_mod` picks the latest version
     matching the project's loader + MC version.
   - **CurseForge** — `resolve_curseforge_file` queries
     `GET /v1/mods/{id}/files` (game version + `modLoaderType` filter), skips
     early-access/unavailable files, and downloads the best match via
      `download_curseforge_mod_for_version`. Requires an API key (Settings →
      gear icon) or the `CURSEFORGE_API_KEY` env var (dev override; the
      compile-time baked key was removed 2026-08-10).
2. The downloaded jar is written atomically (`.tmp` + rename) with the filename
   sanitized so a URL can't escape the `mods/` dir (`sanitize_filename`).
3. The jar is re-inspected with `extract_mod_info_from_jar` so the DB row
   carries the real `mod_id` / `version` / description / jar icon; search
   metadata is the fallback.
4. The `ModEntry` is upserted into the DB and returned; the frontend reloads
   the project's mod list and shows a success/error toast. Per-row buttons
   switch to a disabled "Installing..." state while the download runs.

**Author attribution (s48, s49 fallback):** Modrinth downloads route through
the counted endpoint (`GET /v2/version/{id}/download` — `modrinth_download_url`)
**with a CDN fallback**: when the counted endpoint fails (s49: Modrinth removed
it from their OpenAPI spec and it 404s for every id), the download falls back
to the version's primary CDN file URL from `files[].url`, which still serves.
Attribution is best-effort, never a hard dependency — the app never silently
fails a download over attribution. Order is locked by test
(`download_urls_prefer_counted_then_cdn_fallback`). Every registry/CDN request
carries the real User-Agent (`MODCANVAS_USER_AGENT` in
`mod_intelligence/types.rs` — `ModCanvas/<version>` with the repo as contact).
The prototype placeholder UA ("MMM/0.1.0 (contact@example.com)") was removed —
a placeholder UA both violates Modrinth's API terms and can strip attribution.
CurseForge downloads use the API-returned `downloadUrl` (the counted path);
the raw-CDN fallback stays a last resort.

**Version-list queries are percent-encoded (s49):** the version fetch
(`GET /v2/project/{id}/version?loaders=...&game_versions=...`) builds its JSON
filters through `version_url` (`mod_intelligence/modrinth.rs`), which
percent-encodes them exactly like the search facets. Raw `["neoforge"]` in the
query made the `url` crate encode only the quotes and leave raw brackets, and
Modrinth returned **404 for every version fetch** — the s49 walkthrough
finding: curated downloads and dependency resolution silently broke. Search
always encoded (`urlencoding`); the version fetches now do too, and a
regression test locks the encoded form.

Notes: after installing, the jar is visible to Prism and the game immediately
(next launch). Quest-editor textures/items for the new jar appear after the
next Refresh / texture re-index (`scan_instance_textures` validates layer
metadata so it picks up new jars).

## One-click missing dependencies

The compatibility check (`check_compatibility_async`, `modrinth/compat.rs`)
already resolves missing required dependencies' metadata while it runs; it now
carries that resolution back on each missing-dep issue as an `install` payload
(`CompatibilityInstall` in `models.rs`: source + mod_id + slug + name — exactly
what `install_mod_from_search` needs). The compat panel renders a per-issue
**Install** button and an **Install all missing** batch button. Install runs
through the same proven path as search-install (download → jar inspect → DB
upsert), then the check re-runs so the panel reflects reality.

Two honesty rules: a dep whose metadata could not be resolved at check time
gets **no button** (we don't install what we can't identify — e.g. CurseForge
deps without an API key configured), and only **required** dependencies get
install payloads (optional/recommended are the player's choice, not a gap to
auto-fill).

## Backend & Data Flow

- `ModMetadata` (both `src-tauri/src/models.rs` and the frontend type in
  `frontend/src/services/types.ts`) now carries `icon: Option<String>` /
  `icon: string | null` and `source: String` / `source: 'modrinth' |
  'curseforge'`. The backend tags each search result with its registry.
- `search_mods` accepts a `sources` array (`["modrinth"]` | `["curseforge"]` |
  `["modrinth", "curseforge"]`) and queries each selected registry in a loop
  (CurseForge is skipped without an API key; unknown source strings are logged
  and skipped — the seam a future source plugs into), then dedupes by `mod_id`.
  Frontend: `SourceToggles.tsx` (`frontend/src/components/common/`) owns the
  toggle state shape; `useModState` holds `searchSources`.
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


## CurseForge API key storage & security

The CurseForge API key is the one secret the app holds. Its storage contract
(`src-tauri/src/key_store.rs`):

- **OS keychain** (Secret Service on Linux) is the primary store. The key is
  never written to disk by the app itself — the OS keychain manages it.
- **Database fallback**: when no keychain daemon exists (headless session,
  locked keyring), the key falls back to the `settings` table — and Settings
  SAYS SO. The database file is enforced mode 0600 (`db.rs`) so even the
  fallback is not readable by other local users.
- **Never in the binary.** The compile-time baked-key path
  (`option_env!("CURSEFORGE_API_KEY")` + build.rs dotenv) was removed
  2026-08-10: a credential compiled into every distributed binary is a
  published credential. Runtime env var (`CURSEFORGE_API_KEY`) remains as a
  dev override only.
- **Never over IPC to the renderer.** `get_curseforge_api_key` returns only
  `{has_key, store}`; the key value is read back exclusively inside Rust.
- Precedence: runtime env var > keychain > database fallback.
