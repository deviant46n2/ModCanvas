# ModCanvas — Implementation TODO

Task tracker for the **Launcher + single-pack load + no-gaps runtime capture** redesign.
Status: **Phase 1–4 implemented** (launcher, single-pack lifecycle, workspace chrome,
dirty-guard, Refresh/re-index, hotswap freeze, companion trim, bulk capture + runtime
extraction, item browser, docs + tests). Remaining: release rebuild. Decisions were
agreed with the user on 2026-08-04.

## Locked decisions

- Launcher landing screen; exactly one pack open at a time; opening = full load (cache-aware).
- Auto-enter last-opened pack on launch.
- Manual Refresh / Re-index for cache invalidation — NO live folder watcher.
- Hotswap `RELOAD_*` chat-command path frozen. WS server + engine-render + runtime extraction stay.
- **No gaps in visual parity:** bulk-capture ALL item icons in-game + extract runtime-only textures.
- Companion target for v1: **1.21.1 NeoForge only** (archive fabric/forge/neoforge variants).
- Merged launcher list with `ModCanvas` / `Prism` source badges.
- Save / Discard / Cancel confirm when leaving a dirty pack.

---

## Phase 1 — Launcher & single-pack lifecycle

- [x] **State model**: split pack "open" from any selection concept.
  - Files: `frontend/src/hooks/useProjectState.ts`, `frontend/src/hooks/useAppState.ts`
  - `openProject: Project | null`; screen = `openProject ? 'workspace' : 'launcher'`.
  - `openPack(project)` = full pipeline (ingest → import FTB → save graph → scan mods → load configs), with `LoadPackModal` progress.
  - `closePack()` resets mods/configs/recipes/pack-health/quest state; `openProject = null` → launcher.
  - Re-key `App.tsx` effects currently tied to `selectedProject?.id` (history attach, recipe-store clear, mod/config reset) onto `openProject`.
  - Backend: added `projects.source` column (`modcanvas`/`prism`) for launcher badges.
- [x] **Auto-reopen**: on launch, if `modcanvas:last-project-id` matches a known project → `openPack(last)` (fast when caches warm). Else launcher.
- [x] **Launcher screen**: new `frontend/src/components/launcher/Launcher.tsx` (replaces `sidebar.tsx` as browser + `welcome`).
  - Merged project list with source badges, refresh / import / new / delete / Prism browse.
  - Single-click = select + metadata preview; double-click / Enter / **Open** = `openPack` with progress modal.
  - `App.tsx` renders `<Launcher/>` when no open pack, `<ProjectWorkspace/>` otherwise.
- [x] Remove `frontend/src/components/common/sidebar.tsx` from the workspace (no pack list in editor).

## Phase 2 — Workspace chrome, dirty-guard, manual refresh

- [x] **Workspace header**: show open pack name + a **Projects** back button (→ confirm → `closePack`).
  - Files: `frontend/src/components/common/ProjectWorkspace.tsx`, `frontend/src/components/common/topbar.tsx`
  - Remove the old **Load Pack** button (open = load); add **Refresh**.
- [x] **Save/Discard/Cancel** confirm on leaving a dirty pack.
  - Dirty surfaces: config editor `configDirty` (quest graph auto-saves to DB).
  - **Save** flushes `saveConfigFile`; **Discard** drops; **Cancel** stays.
  - Orchestrator in `useAppState.ts` (`requestClosePack` / `saveAndClosePack` / `discardAndClosePack` / `cancelLeavePack`) + `LeavePackModal.tsx`.
- [x] **Refresh / Re-index** action: re-invokes `scan_instance_textures` / `scan_instance_animations` (auto-detects changes via `(name,size,mtime)` layer validation), `scan_instance_items`, `scan_instance_mods`, `list_config_files`, re-reads quest graph. Reuse `LoadPackModal` for progress.
- [x] **Force full re-index** option (bypasses cache; covers same-size/same-mtime replace edge) — new `force` flag on ingest (`src-tauri/src/ingest.rs`), exposed as Project menu → Force Full Re-index.

## Phase 3 — Hotswap freeze + no-gaps capture

- [x] **Freeze hotswap**: stop wiring `SyncPipeline.broadcastReload` and `RELOAD_*` sends into live use (leave code dormant).
  - `frontend/src/core/sync/config.ts` — `HOTSWAP_FROZEN = true` gate.
  - `sync-pipeline.ts` — `PipelineConfig.hotswapFrozen` (default true) suppresses the post-save broadcast; method stays dormant.
  - `useQuestToolbarActions.ts` / `useRecipeSave.ts` — RELOAD_* sends gated behind the flag.
- [x] **Companion trim**: keep only `workbench-companion-neoforge-1.21`; removed fabric/forge/legacy-neoforge from deploy matrix (`src-tauri/src/minecraft.rs`); archived the other dirs under `workbench-companion-archived/` (build outputs removed, gitignore hardened).
- [x] **Bulk item-icon capture (no gaps for items)** — already implemented (verified): on companion connect, `QuestBookEditor` queues every registry item lacking a resolved icon through `engine-render.ts` (batched 32, visible-first priority via `queueEngineRendersPriority`, persisted to `engine_renders_<hash>.json` with jar-signature invalidation). Statusbar shows capture progress; `JeiDrawer` `?` cells fill in as results arrive and on reload.
- [x] **Runtime texture extraction (no gaps for non-items)**:
  - `AssetExporter.java` generalized from one-shot to request-driven (`extract()`), keeping the narrow `ASSETS_READY` path as-is.
  - New `EXTRACT_TEXTURES_REQUEST` / `RESULT` channels (`src-tauri/src/ws_ipc.rs` constants + companion handler, works from the main menu).
  - Frontend `services/runtime-textures.ts` derives quest-referenced namespaces from the graph + `ftbquests`, requests once per pack, merges results into the texture index with `runtime:` precedence.
  - New Rust disk cache `src-tauri/src/runtime_textures.rs` (mirrors `engine_renders`, atomic writes, jar-signature invalidation) + prune-cache coverage.
  - Docs: `docs/engine-renders.md` updated.
- [x] **Item browser**: promoted to a first-class view in the **Recipes tab** — a new "Registry" palette tab beside Items/Tags browsing the instance item registry (`ItemRegistryEntry[]` fed by the quest editor's scan + engine-render/runtime-texture capture). Header query filters locally (`@modid` + name/id, no remote search in registry mode); rows are draggable into the crafting grid and show engine/runtime-captured icons. Pure logic in `services/item-registry.ts` (tested); `JeiDrawer` still powers the quest-editor objective/reward picker.

### Open implementation details (Phase 3)
- Runtime extraction strategy: **enumerate-then-merge** (companion dumps its full runtime-resolvable texture map for quest-referenced namespaces) vs **request-by-key** (frontend sends specific missing keys). Lean enumerate — validates against companion ResourceManager cost before committing.
- Whether quest graph needs an explicit "dirty" flag beyond what commits already persist.

## Phase 4 — Docs, tests, rebuild

- [~] **Docs** (AGENTS.md: docs are code) — all Phase 1–3 docs done:
  - [x] `docs/load-pack.md` — open = full cache-aware load; Refresh; force re-index.
  - [x] `docs/workspace-actions.md` — header/Projects back, Save/Discard/Cancel, removed Load Pack.
  - [x] New `docs/launcher.md`.
  - [x] `docs/engine-renders.md` — bulk capture + runtime texture extraction channels.
  - [x] `docs/PROJECT_BIBLE.md` §8.4 — hotswap frozen, single canonical companion.
  - [x] `docs/recipe-editor.md` — Registry (item browser) tab.
- [x] **Frontend tests**: launcher/open-close state transitions; Save-Discard-Cancel; bulk-capture queueing; runtime-texture merge.
  - [x] runtime-texture merge — `services/runtime-textures.test.ts` (7 tests).
  - [x] bulk-capture queueing — covered by `services/engine-render.test.ts`.
  - [x] launcher/open-close state transitions — `components/launcher/Launcher.test.tsx` + `hooks/useProjectState.test.ts` (14 tests; caught a real Enter double-fire bug in the launcher).
  - [x] Save-Discard-Cancel — `components/common/LeavePackModal.test.tsx`.
- [x] **Rust tests**: runtime-texture export cache roundtrip + invalidation; deploy-matrix trim; force reindex.
  - [x] runtime-texture cache — `src-tauri/src/runtime_textures.rs` (roundtrip / missing / version-mismatch / jar-change).
  - [x] deploy-matrix trim — `minecraft.rs::deploy_matrix_is_neoforge_only` (forge/fabric/quilt rejected).
  - [x] force reindex — `ingest.rs::test_force_reindex_discards_valid_cache` (force rewrites a valid cache).
  - [x] Bonus fix: eliminated the pre-existing `prune_removes_only_non_kept_hashes` flake — `prune_caches` now takes the cache dir as a parameter instead of re-deriving it from the process-global `XDG_CACHE_HOME`, so the prune test no longer mutates the env var (which raced every concurrent cache test). Full suite green 5/5 runs.
- [x] Existing parser/round-trip tests stay green (`cargo test`, `pnpm test`, `pnpm lint`).
- [ ] **Rebuild** via `cargo tauri build --no-bundle` (only path that embeds frontend); verify binary mtime newer than last edit before marking complete.

---

## Key reference points

- Load pipeline / progress listener: `frontend/src/hooks/useAppState.ts`
- Project selection + last-opened persistence: `frontend/src/hooks/useProjectState.ts`
- Workspace shell + prompt + modal: `frontend/src/components/common/ProjectWorkspace.tsx`
- Load progress modal: `frontend/src/components/common/LoadPackModal.tsx`
- Header: `frontend/src/components/common/topbar.tsx`
- Pack browser (to be replaced by Launcher): `frontend/src/components/common/sidebar.tsx`
- Texture cache validation (auto-detect changes): `src-tauri/src/instance_textures.rs:118-181`
- Item registry scan: `src-tauri/src/indexer.rs` (cache-validated by jar count + size/mtime)
- WS IPC server + channels: `src-tauri/src/ws_ipc.rs`
- Engine-render capture pipeline: `frontend/src/services/engine-render.ts`
- Engine-render disk cache: `src-tauri/src/engine_renders.rs`
- Companion asset exporter (to generalize): `workbench-companion-neoforge-1.21/.../AssetExporter.java`
- Deploy matrix: `src-tauri/src/minecraft.rs:555-588`
- JEI-style picker: `frontend/src/components/jei/JeiDrawer.tsx`
