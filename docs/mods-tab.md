# Mods Tab

> **Status: s53 — PRISM-LEAN.** ModCanvas *curates and diagnoses*; Prism
> Launcher *executes* mod installation. The in-app Add-Mods search and
> install machinery is **DEPRECATED** under the s53 ruling (roadmap §0) —
> Prism's own downloader does version matching AND dependency resolution
> (verified: installing FTB Quests in Prism pulls FTB Library + FTB Teams +
> Architectury API automatically). ModCanvas does not reimplement it. The
> deprecated surface stays functional until its evidence-backed deletion
> (chunk 2, roadmap §0) — the code is not a lie, it is a documented state.

The Mods tab is the project's mod-management surface: browse installed mods,
toggle them on/off (individually or in bulk), scan the instance's `mods/`
folder, and check missing dependencies. Adding new mods hands off to Prism.

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
  dependencies. The app never needs a CurseForge key for installs: **Prism
  bundles its own.**
- **The core-mod gate (s53)** — Pack Health's **Mods** section
  (`core/pack-health/checks/mods.ts`) verifies ModCanvas's own dependencies
  (FTB Quests + KubeJS) against the scanned mods/ jar names riding the ingest
  result (`IngestResult.mods`, null when the mods dir doesn't exist — no claim,
  Trust Rule). Missing core mods are **blocking**, and the wizard's green check
  disables Launch until they land. The gate makes the handoff *verified*: a
  skipped Prism install can no longer produce a "ready to test" pack whose
  quest book never appears in-game.
- **Curated step (wizard step 2)** — same handoff: the curated list
  (backend-filtered to the pack's loader/version) tells the user *what* to
  install; "Open Prism to install these" does the *how*.
- **Scan Instance Mods** — re-scans the instance `mods/` folder and records
  what's there, so Prism-installed mods are tracked without re-import.

### DEPRECATED (chunk 2 pending — see roadmap §0)

The Add-Mods search (Modrinth/CurseForge source toggles, category filter,
`+ Add` install) and the one-click missing-dependency install in the compat
panel. The s53 ruling's rationale: ModCanvas's own search cannot reliably
surface CF mods (verified: `searchFilter=ftb` returns 50 irrelevant hits,
zero FTB mods; the s33 slug fallback cannot rescue a query that is no mod's
slug), CF file dependencies are not even parsed
(`CurseForgeFileInfo`, `mod_intelligence/types.rs`), and Prism does both —
maturely. The machinery stays until chunk 2's evidence-backed deletion
(consumer tracing, grep-proof, tests moved or killed — the s52 pattern).

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
panel tells the user what's missing; the fix is a Prism install (the
one-click install buttons are DEPRECATED, see above). Two honesty rules: a dep
whose metadata could not be resolved gets no claim, and only **required**
dependencies are gaps (optional/recommended are the player's choice).

## Backend & Data Flow

- **Installed mods**: `get_project_mods` / `scan_instance_mods` /
  `toggle_mod_enabled` / `remove_mod` — DB-backed, unchanged by PRISM-LEAN.
- **`open_prism_instance`** (`modpack/mod.rs`) — the handoff: project id →
  instance id (parent folder under `instances/`) → `prismlauncher --show <id>`.
  Non-instance-backed projects error with the manual-install fallback.
- **`search_mods` / `install_mod_from_search`** — DEPRECATED (chunk 2).
- **Compatibility**: `check_compatibility_async` — diagnosis only going
  forward; install payloads (`CompatibilityInstall`) deprecated with the panel.

## Components

- `frontend/src/components/common/ModsTab.tsx` — grid, filter input, selection
  state, bulk bar, compatibility panel, **Add mods in Prism** handoff.
- `frontend/src/components/common/CuratedModsStep.tsx` — wizard step 4:
  curated list (display-only rows) + **Open Prism to install these** handoff +
  manual-link fallback for non-instance packs.
- `frontend/src/hooks/useModState.ts` — installed-mod state, compat check.
- `frontend/src/services/mods.ts` / `services/project.ts` —
  `openPrismForProject(projectId)`.

## CurseForge API key storage & security

The CurseForge API key is still held (the CF zip import resolves manifest
mods — `import-flow.md`), but **no longer needed for mod installs** — Prism
bundles its own key. Storage contract (`src-tauri/src/key_store.rs`):

- **Kernel keyring** (keyutils) is the primary store.
- **Database fallback**: when no keyring exists, the key falls back to the
  `settings` table — and Settings SAYS SO. The database file is mode 0600.
- **Never in the binary.** The compile-time baked-key path was removed
  2026-08-10. Runtime env var (`CURSEFORGE_API_KEY`) remains as a dev override.
- **Never over IPC to the renderer.** `get_curseforge_api_key` returns only
  `{has_key, store}`.
- Precedence: runtime env var > keychain > database fallback.
