# Mods Tab

> **Status: s54 — PRISM-LEAN (chunk 2 shipped).** ModCanvas *curates and
> diagnoses*; Prism Launcher *executes* the mods the app cannot download
> itself. The old Add-Mods search surface (search commands, cross-source
> merge, source toggles, category filter, result rows) was **deleted** in
> chunk 2 (roadmap §0 row 6) — evidence-backed, s52 pattern. What remains is
> the split of labor: **Modrinth** installs happen in-app with one click
> (the Modrinth API is keyless — an honest one-click); **CurseForge**
> installs (FTB Quests) happen in Prism, which carries its own CF key and
> parses CF dependencies ModCanvas cannot see.

The Mods tab is the project's mod-management surface: browse installed mods,
toggle them on/off (individually or in bulk), scan the instance's `mods/`
folder, and check missing dependencies. Adding new mods hands off to Prism;
missing Modrinth dependencies install in-app.

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

## Adding mods (PRISM-LEAN)

- **Add mods in Prism** (section-actions button) — `open_prism_instance`
  (`src-tauri/src/commands/modpack/mod.rs`): spawns
  `prismlauncher --show <instanceId>` where the instance ID is the folder name
  of the instance dir under `instances/` (validated; scratch packs without a
  Prism instance get a clear error and fall back to manual project-page links).
  Prism opens focused on the pack — its downloader resolves versions and
  dependencies. **The app never needs a CurseForge key for installs: Prism
  bundles its own.**
- **One-click Modrinth installs** — `install_modrinth_mod`
  (`src-tauri/src/commands/modpack/install.rs`, s54): downloads a Modrinth
  jar into `<instance>/mods/` and records the DB row with jar-derived
  metadata. Modrinth-only by design — the Modrinth API is keyless, so the
  button is honest (a CF one-click would either need the user's key or
  install a broken mod: CF deps aren't parsed, so e.g. FTB Quests would land
  without its three required deps). Serves two surfaces: the wizard's curated
  step (Modrinth picks) and the compat panel's missing-dependency buttons.
- **FTB Quests installs in Prism** — the one CurseForge core pick. The
  wizard's curated step renders a step-by-step guide (Prism → Mods → Download
  Mods → search FTB Quests → Install, and accept **FTB Library**, **FTB
  Teams**, **Architectury** — all required), and the core-mod gate finding
  carries the same fix copy. ModCanvas cannot download FTB Quests itself
  (CF-only, keyless path impossible) and cannot see its deps — Prism can.
- **The core-mod gate (s53)** — Pack Health's **Mods** section
  (`core/pack-health/checks/mods.ts`) verifies ModCanvas's own dependencies
  (FTB Quests + KubeJS) against the scanned mods/ jar names riding the ingest
  result (`IngestResult.mods`, null when the mods dir doesn't exist — no claim,
  Trust Rule). Missing core mods are **blocking**, and the wizard's green check
  disables Launch until they land. The gate makes the handoff *verified*: a
  skipped Prism install can no longer produce a "ready to test" pack whose
  quest book never appears in-game. Each finding's detail now carries the
  exact fix (s54): the FTB Quests one names the three deps.
- **Scan Instance Mods** — re-scans the instance `mods/` folder and records
  what's there, so Prism-installed mods are tracked without re-import.

### Deleted in chunk 2 (s54) — the search surface

The Add-Mods search (Modrinth/CurseForge source toggles, category filter,
`+ Add` install), the `search_mods` / `install_mod_from_search` commands, the
cross-source merge (`search_merge.rs`), the orphaned CurseForge download
functions, and `SearchResultRow` / `CategorySelect` / `SourceToggles` were
removed with consumer tracing + grep proof (4 test files deleted, 2 edited).
Rationale (unchanged from s53): ModCanvas's own search cannot reliably surface
CF mods (verified: `searchFilter=ftb` returns 50 irrelevant hits, zero FTB
mods), CF file dependencies are not parsed (`CurseForgeFileInfo`,
`mod_intelligence/types.rs`), and Prism does both — maturely.

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
- **No stored `file_name`** (legacy rows, placeholder rows): row-only removal,
  success toast.

`ModEntry.file_name` is populated at import time: instance and mrpack imports
thread the jar path through `UnresolvedMod → ResolvedMod → ModEntry`. The
upsert (`db.rs add_mod`) deliberately omits `file_name` from its
`ON CONFLICT DO UPDATE` list. Existing DBs get the column via the
`pragma_table_info` + `ALTER TABLE` migration in `db.rs init_schema`; old rows
stay NULL (no backfill).

- **Bulk actions** — checking any row reveals the bulk bar with *Enable
  selected* / *Disable selected*; the header checkbox selects/deselects every
  mod in the filtered list.

## Missing-dependency diagnosis

The compatibility check (`check_compatibility_async`, `modrinth/compat.rs`)
walks Modrinth version dependency metadata and surfaces missing required
dependencies. **This is ModCanvas's diagnosis job under PRISM-LEAN** — the
panel tells the user what's missing, and resolved **Modrinth** deps install
with one click (`install_payload_for` is Modrinth-only, s54; CurseForge deps
render without a button — installs execute in Prism). Two honesty rules: a dep
whose metadata could not be resolved gets no claim, and only **required**
dependencies are gaps (optional/recommended are the player's choice).

## Backend & Data Flow

- **Installed mods**: `get_project_mods` / `scan_instance_mods` /
  `toggle_mod_enabled` / `remove_mod` — DB-backed, unchanged by PRISM-LEAN.
- **`open_prism_instance`** (`modpack/mod.rs`) — the handoff: project id →
  instance id (parent folder under `instances/`) → `prismlauncher --show <id>`.
  Non-instance-backed projects error with the manual-install fallback.
- **`install_modrinth_mod`** (`modpack/install.rs`) — the one-click Modrinth
  installer (wizard + compat panel). Replaces the deleted
  `install_mod_from_search`; CurseForge-only by removal.
- **Compatibility**: `check_compatibility_async` — diagnosis + Modrinth-only
  install payloads (`CompatibilityInstall` carries no source since s54).

## Components

- `frontend/src/components/common/ModsTab.tsx` — grid, filter input, selection
  state, bulk bar, compatibility panel, **Add mods in Prism** handoff.
- `frontend/src/components/common/CuratedModsStep.tsx` — wizard step 4:
  curated list with **one-click Install on Modrinth picks**, the **FTB Quests
  installs in Prism** guide (three deps named), **Open Prism to install
  these** handoff, and manual-link fallback for non-instance packs.
- `frontend/src/hooks/useModState.ts` — installed-mod state, compat check +
  the compat panel's one-click installs (`useCompatInstall`).
- `frontend/src/services/mods.ts` — `installModrinthMod`, `listCuratedMods`,
  metadata/compat calls; the search service functions were deleted.

## CurseForge API key storage & security

The CurseForge API key is still held for **ModCanvas's own CF API calls**
(the CF zip import resolves manifest mods — `import-flow.md`; curated pick
resolution; CF metadata in the grid/compat) — but **never for installs**:
Prism bundles its own key, and the in-app installer is Modrinth-only
(keyless) since s54. Storage contract (`src-tauri/src/key_store.rs`):

- **Kernel keyring** (keyutils) is the primary store.
- **Database fallback**: when no keyring exists, the key falls back to the
  `settings` table — and Settings SAYS SO. The database file is mode 0600.
- **Never in the binary.** The compile-time baked-key path was removed
  2026-08-10. Runtime env var (`CURSEFORGE_API_KEY`) remains as a dev override.
- **Never over IPC to the renderer.** `get_curseforge_api_key` returns only
  `{has_key, store}`.
- Precedence: runtime env var > keychain > database fallback.
