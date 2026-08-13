# AGENTS.md — Developer Guidelines for AI Coding Agents

## Communication & Honesty

- Be direct and honest. Never be sycophantic or validating — do not flatter
  ideas, code, or questions just to be agreeable.
- Give candid assessments of plans, designs, and code, including when
  something is a bad idea or has a better alternative. State disagreement with
  reasoning; do not hedge around it.
- No reassurance filler ("great question", "you're right", "nice work") — drop
  praise and validation padding entirely.
- **Never tell the user to rest, take a break, wind down, or stop for the day.**
  The user is a chronic insomniac; rest suggestions are triggering, not
  helpful — including as a closing nicety ("rest up", "you've earned a break").
  The user sets the pace, always: sessions end when the user ends them, and an
  agent suggesting otherwise is a breach. When the tutor's fatigue rule in the
  global config says "no fatigue assumptions", this is the concrete form it
  takes for this maintainer.
- This section mirrors the global opencode agent rules (honesty / hand-off /
  partnership) in `~/.config/opencode/AGENTS.md` — keep the two in sync when
  you edit either one.

## Project Overview
This project is an offline-first desktop workbench and IDE tailored for Minecraft modpack creators and server engineers. Its core capabilities include a visual progression canvas, a local diagnostic engine, and runtime hot-swapping via IPC.

---

## Architectural Principles & Strict Boundaries

1. **Mandatory Documentation Synchronization:**
   - **Documentation is code.** Whenever you add a new feature, update an existing component, or modify a workflow, you MUST update the corresponding documentation (e.g., `/docs`, `README.md`, or component inline docs) in the same pass.
   - Do NOT mark a task as complete if feature logic is updated but documentation is left outdated.

2. **Atomic & Safe File System Operations:**
   - NEVER overwrite user workspace files directly using unsafe I/O.
   - Always write changes to a temporary file (`.tmp`) first and atomically rename/swap to prevent file corruption during crashes or interrupted writes.
   - **Preserve User Comments:** When editing `.json5`, KubeJS `.js`, or SNBT files, use comment-preserving AST parsers. Do NOT strip user comments or custom indentation.

3. **Game Version & Data Component Awareness:**
   - Be strictly aware of Minecraft version boundaries.
   - **Pre-1.20.5:** Uses traditional stringified NBT structures.
   - **1.20.5 / 1.21+:** Uses Minecraft Data Components syntax.
   - Serializers and schemas MUST validate against the target pack's specific Minecraft version before emitting item data.
   - Version boundaries are enforced by the adapter matrix (`adapters/`); use `IMinecraftVersionAdapter.getSNBTSpec().dataComponents` to query Data Component support at runtime rather than hardcoding version strings.

4. **Zero Mandatory AI/Cloud Dependencies:**
   - The core application MUST remain 100% deterministic, offline-first, and locally executed.
   - Do NOT insert required LLM SDKs, remote API calls, or forced cloud telemetry into core features.
   - All external AI tooling MUST be exposed solely through opt-in MCP (Model Context Protocol) endpoints or local API bridges.

5. **OS-Aware File Systems & Hot-Swapping:**
   - POSIX file writes can occur directly on Linux environments.
   - Windows writes MUST account for JVM file locks (`EBUSY`). Always use a two-tier pipeline (Local IPC Socket bridge to the in-game mod -> Staged `.tmp` disk sync fallback).

6. **No Bundling of Game Assets (Minecraft/Jar Images):**
   - The application bundle (the Rust binary AND `frontend/dist`) MUST NEVER contain image bytes extracted from `.jar` archives or Minecraft instance files — vanilla assets, mod assets, resource packs, or mod UI textures (e.g. FTB Quests theme icons).
   - All game-derived imagery MUST be served at runtime via lazy materialization: the compact index stores source descriptors only (`jar:<abs_path>!<zip_internal_path>` or absolute paths), PNG bytes are read on demand and returned as in-memory data URLs (e.g. `resolve_texture_urls`). Never copy, commit, or generate those images into `frontend/public/`, `frontend/src/assets/`, or `tauri.conf.json` `bundle.resources`.
   - `frontend/public/` and `frontend/src/assets/` may only contain original, self-authored branding/UI assets (e.g. `hero.png`).
   - The on-disk texture cache (`~/.cache/modcanvas/instance_textures_*.json`) stores index metadata + descriptors only — never image bytes.
   - Any existing assets copied out of an instance (e.g. the FTB Quests theme pack under `frontend/public/theme/ftbquests/`) are banned from the bundle and MUST be resolved from the instance's own jars/resource packs at runtime instead.

---

## Modular Architecture & Code Organization Rules

1. **Strict Separation of Concerns (The 3-Layer Rule):**
   - **Data/Parsers Layer (`/src/core/`):** Pure TypeScript/Rust functions. No UI hooks, no DOM manipulation, no IPC calls. These must be 100% testable in isolation.
   - **I/O & Driver Layer (`/src/drivers/`):** File access, launcher execution (e.g., `LauncherDriver`), and IPC sockets. Keep system calls strictly encapsulated here.
   - **UI Layer (`/src/components/`):** React/Svelte components. UI nodes must never perform direct disk reads or trigger un-buffered file writes.

2. **File & Function Size Limits:**
   - Single files MUST NOT exceed **300 lines of code**. If a file grows beyond 300 lines, refactor helper functions or sub-components into separate utility/module files.
   - Functions MUST focus on a single responsibility.

3. **Loose Coupling via Interfaces:**
   - External dependencies (like Prism Launcher or the local database) MUST interact through abstract interfaces (e.g., `ILauncherDriver`, `IStorageAdapter`).
   - Never directly import third-party launcher or storage internals into core business logic.

4. **Version/Loader Adapter Matrix (`/frontend/src/adapters/`):**
   - All version-specific and loader-specific logic MUST be isolated in dedicated adapter modules under `adapters/`.
   - The directory layout follows a matrix pattern: `v{MAJOR}_{MINOR}_{PATCH}/{loader}.ts`.
   - Each adapter implements `IMinecraftVersionAdapter` and lives in its own file — no shared mutable state.
   - Use `getAdapter(mcVersion, loader)` from `adapters/factory.ts` to resolve the correct adapter at runtime.
   - Adding a new version or loader means creating a new file; never modify existing adapter code.
   - **Adapter scope: major versions only (s51 decision).** Adapters exist for major stable Minecraft versions (1.20.1, 1.21.1) — the versions modpacks actually target. Minor/patch versions (e.g. 1.20.4, 1.21.2) get NO card; they resolve through the factory fallback chain. Adding a minor card requires an explicit scope decision first — the default is no. Known cost, surfaced: a minor-version pack resolves to the default card (1.21.1/neoforge), which is wrong for pre-1.20.5 minors — acceptable because the app targets major-version packs, and the `UnsupportedVersionBanner` (workspace-level, cross-version fallback only) tells the user their pack is on unsupported rules. Revisit if real packs demand it.
   - Test coverage in `adapters/matrix.test.ts` must verify isolation, exact resolution, and fallback behavior.

---

## Code Style & Performance Rules

- **Stringified NBT (`.snbt`):**
  - Custom serializers MUST maintain strict FTB Quests compatibility.
  - Do NOT format FTB `.snbt` files with standard JSON formatters, as missing commas and implicit arrays are required by native parsers.
  - Number suffixes (`10L`, `1.0d`, `1.0f`) MUST be preserved during parsing and writing.

- **Node Canvas & UI Performance:**
  - Keep canvas state management strictly decoupled from visual node rendering pipelines.
  - NEVER dispatch state mutations directly inside node render hooks or canvas frame loops (prevent infinite re-renders).

- **Texture Indexing & Caching (`src-tauri/src/instance_textures/`):**
  - The texture index MUST stay compact: values are source descriptors (`jar:<abs_path>!<zip_internal_path>` or an absolute kubejs file path), NOT base64 data URLs. Data URLs are materialized lazily on demand via `resolve_texture_urls` (batch per jar, capped at `BATCH_SIZE` keys from the frontend).
  - Bump `CACHE_VERSION` whenever the index shape, key forms, or layer semantics change; the disk cache (`~/.cache/modcanvas/instance_textures_<hash>.json`) is validated against current jar/kubejs layer metadata on every load so reloads never rescan.
  - The in-process `INDEX_MEMO` memo is for batch materialization only — `scan_instance_textures` must ALWAYS validate layer metadata so edits to kubejs/jars are picked up (tests `kubejs_model_change_invalidates_cache` enforce this).
  - Block/hand-modeled 3D items resolve to `bake:<ns>:<kind>/<path>` descriptors in the index (never image bytes). These are NOT materialized offline: `resolve_texture_urls` skips `bake:` keys, and the frontend treats them as engine-needed — it queues them to the companion mod's in-game renderer (`RENDER_ITEMS_REQUEST`/`RESULT`) and shows the "run the instance to capture textures" prompt until real icons land. The software rasterizer was removed (there is no offline placeholder; 3D icons require a run with the companion). Cross-model plants still use the `cross`/`fan` texture slots for flat-texture classification.
  - Do not add new versions of the old data-URL index format; keep scans enumeration-only (no PNG byte reads) and keep the frontend's lazy materialization path (`texture-loader.ts` + `QuestBookEditor.tsx`) as the sole way to obtain displayable URLs.
  - Item tag resolution (`instance_textures/tags.rs`, command `resolve_item_tags`) is a separate index: it scans `data/*/tags/item/*.json` (1.21+) and `data/*/tags/items/*.json` (pre-1.20.5) across vanilla jars, mods, resource packs, instance `data/`, and `kubejs/data/`, expanding `#tag` references cycle-safely. It has its own `TAG_INDEX_MEMO` (do not share the texture `INDEX_MEMO`).
  - `.mcmeta` animation metadata (`scan_instance_animations_cmd`) is a parallel map stored in the same `InstanceTextureCache` under `animations`, keyed by the same texture-key forms as the texture index. It is collected in the same single scan pass (`merge_archive_ex`/`merge_dir_ex`) and shares the texture cache's `CACHE_VERSION` and layer-metadata validation. The editor animates icons/decorations via `frontend/src/components/quest/AnimatedSprite.tsx` (CSS `steps()` strip animation; reordered/interpolated sheets are baked on a canvas by `frontend/src/services/sprite-sheet.ts` using the pure parser `frontend/src/core/quest/animated-texture.ts`).
  - FTB Filter System smart filters serialize their DSL in nested item Data Components (`item.components."ftbfiltersystem:filter"`) and the item id is always `ftbfiltersystem:smart_filter`. The export MUST emit that nested form whenever the DSL is present — regardless of flat vs subdirs chapter layout — because the plain-string `item` field cannot carry it. The DSL grammar (`item/item_tag/tag/mod` calls wrapped in `or/and/xor/not`) is parsed by `frontend/src/core/quest/smart-filter.ts`; `not(...)` members are excluded from icon candidates.
  - SNBT serializer MUST quote compound keys containing a colon (e.g. `"ftbfiltersystem:filter"`), matching FTB's own output — the tokenizer splits unquoted keys at `:` so unquoted namespaced keys break import/export round-trips.

- **Path Security:**
  - All workspace file operations MUST be scoped strictly within the project/instance root directory.
  - Validate and sanitize all file paths to prevent directory traversal (`../`) or symlink escapes.

---

## Command Matrix & Development Workflow

### Dev Server & Build
- **Install Dependencies:** `pnpm install` (or `cargo check` depending on native bindings)
- **Start Local UI Dev:** `pnpm dev`
- **Build Release Binaries:** `pnpm build`

### Rebuild After Code Changes (Mandatory)
- The app binary embeds both the Rust backend (`src-tauri/**`) and the frontend bundle (`frontend/**`). A stale binary silently serves old behavior — the UI cannot tell you the backend changed.
- ANY edit that affects the app MUST be followed by a rebuild before the change is reported as done or "working":
  - During active development, run the app through `pnpm dev` — Rust changes trigger an automatic rebuild, and frontend edits hot-reload.
  - For a standalone/release binary, run `pnpm build`.
- After rebuilding, VERIFY the running binary is newer than the last edit (compare `src-tauri/target/debug/modcanvas` mtime against the newest changed source file). Never claim a fix/feature works against an unbuilt change.

### The Companion Mod Has Its Own Rebuild+Restart Loop (s14 lesson)
- The companion (`workbench-companion-neoforge-1.21/**`) is a separate artifact from the app binary: it is a mod jar loaded by the GAME at launch. **A running game cannot pick up a new companion jar** — mods load once, at startup.
- ANY edit to companion code requires, in order:
  1. `./gradlew build` (in `workbench-companion-neoforge-1.21/`) — produces `build/libs/workbench-companion-1.0.0.jar`.
  2. **Deploy** the jar into the instance: `cp build/libs/workbench-companion-1.0.0.jar "<instance>/minecraft/mods/` — and VERIFY the copy happened (md5 differs from the old jar; check the new constant/symbol is present via `javap -p -verbose` if unsure — `strings` on a class file does NOT show float constants).
  3. **Restart the game** (full relaunch, not just rejoin a world).
- Companion changes that alter renderer semantics (e.g. per-face light constants) are coupled to the app's `engine_renders.rs` `CACHE_VERSION`: bump it in the SAME pass, and **restart the app too** (the new binary enforces the cache invalidation; an old app process keeps serving the stale cache).
- The s14 trap: the fix was committed, the jar was re-copied, but the jar was the OLD build (identical md5) and the app never restarted — the "dirt block not fixed" observation was invalid because neither artifact ran the new code. Verification loop = rebuild → deploy → restart BOTH app and game → then observe.

### Branch convention (s48, revised — solo mainline)
- `master` is the **single mainline**: all work lands here. Solo project, no
  release lines yet — no `stable`/`nightly` branches until CI or users exist
  (they're recreatable in seconds when they do; the three-branch shape was
  tried and deliberately collapsed for being ceremony without a consumer).
- **Known-good states get tags, not branches** (`git tag v0.1.0`): a tag is
  immutable and drift-free. Release-worthy master tip → tag.
- **Push at boundaries** — a commit that isn't pushed exists in exactly one place
  (the s48 lesson: a week of single-copy work). Push IS backup.

### Testing & Verification
- **Run Unit Tests:** `pnpm test` (in `frontend/` — includes frontend parser tests like smart-filter DSL)
- **Run Rust Tests:** `cargo test` (in `src-tauri/` — includes SNBT/NBT/JSON5 parser + import/export round-trip tests)
- **Lint & Format Check:** `pnpm lint` (in `frontend/`)

---

## Maintainer Tooling (state-truth suite — use it, don't improvise)

This repo ships a tool suite (built s21–s22) that exists so the maintainer can
verify AI claims against the repo instead of trusting them. **Use these tools
at the moments they exist for** — that is the point of having built them:

- **Session start:** read `docs/workarounds.md` (the lived-experience
  register) and list owed items via `/owed`. `pnpm backup` archives the tutor
  arc (`.tutor` + memory store + config) — automated daily via the
  `modcanvas-backup.timer` systemd user unit, so a forgotten boundary run no
  longer leaves the arc unprotected (s30); manual runs still fine at
  boundaries. `pnpm memory-check` validates every handoff's `GOTCHAS:` /
  `DECISIONS:` pointers resolve to real entries — chained after backup in the
  same timer unit, so a skipped boundary ritual surfaces as a failed unit
  (s33 compressed-handoff contract).
- **Repo health, before trusting a diff:** `pnpm integrity`
  (`node scripts/integrity-check.mjs` — 9 sections: line-limit,
  asset-bundle, stale-binary, diff-hygiene, adapter-matrix, doc-sync,
  doc-anchors, build-smoke, suite-self). Violations are new debt; PARKED entries are
  known debt with written reasons (revisit on touching change — the tripwire);
  ACCEPTED entries are intentional decisions, not debt — zero deduction, and the
  reason MUST cite an existing doc (AGENTS.md / README.md / docs/*.md) so the
  decision is reviewable, never a free pass; CANDIDATES need maintainer judgment.
  `pnpm health` states known-debt explicitly, so a sub-100 score can only mean
  accepted decisions or actual debt — never an unexplained number.
- **Before claiming any fix or feature works:** `/verify-build` — rebuild →
  deploy → restart → observe, each step graded on EVIDENCE (mtime, md5,
  process start, fresh log). A claim without evidence for all four steps is
  not done.
- **Diagnosing:** load the `tutor-observation` skill (pin the raw
  observation before any theory) and, for companion probes, the
  `tutor-instrument` skill (prove the instrument applied, can fire, won't
  NPE, and that the log being read is the one being written).
- **Any claim, including your own:** `/verify` — restate, read the code it
  points at, grade PASS/FAIL/PARTIAL/UNVERIFIABLE with a provenance header.
  The code wins over any confident story.
- **Checking the tutor's own config:** `/audit` (command/skill references,
  profile mirror, stale contracts).

Detail lives in `docs/tooling.md` (the reference) — this section is the
contract-level hook, not a duplicate. The suite obeys the repo's own rules:
documented, tracked, tested (`pnpm test:tools`), and every tool stays under
the 300-line limit it enforces.

---

## Pre-Commit Checklist for Agents

Before finalizing any PR, commit, or file edit, ensure:
1. **Documentation is updated:** Any new CLI flag, IPC channel, configuration rule, or UI node parameter is accurately reflected in `/docs` or relevant markdown files.
2. **Comment preservation check:** Verify that saving a config or script file does not erase user comments.
3. All native parser tests (`.snbt`, `.json5`, `.nbt`) are green.
4. No network requests are added to critical local UI path execution.
5. Windows file-handle access includes error handling or retry loops for `EBUSY`.
6. The change does not introduce forced online login or cloud-gated UI states.
7. **Binary is rebuilt:** Any change to `src-tauri/**` or `frontend/**` was rebuilt and verified (run the app via `pnpm dev`, or `pnpm build` for a release binary) before being marked complete.
