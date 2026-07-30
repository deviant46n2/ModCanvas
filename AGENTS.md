# AGENTS.md — Developer Guidelines for AI Coding Agents

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

- **Path Security:**
  - All workspace file operations MUST be scoped strictly within the project/instance root directory.
  - Validate and sanitize all file paths to prevent directory traversal (`../`) or symlink escapes.

---

## Command Matrix & Development Workflow

### Dev Server & Build
- **Install Dependencies:** `pnpm install` (or `cargo check` depending on native bindings)
- **Start Local UI Dev:** `pnpm dev`
- **Build Release Binaries:** `pnpm build`

### Testing & Verification
- **Run Unit Tests:** `pnpm test`
- **Run Parser Validation:** `pnpm test:parsers`
- **Lint & Format Check:** `pnpm lint`

---

## Pre-Commit Checklist for Agents

Before finalizing any PR, commit, or file edit, ensure:
1. **Documentation is updated:** Any new CLI flag, IPC channel, configuration rule, or UI node parameter is accurately reflected in `/docs` or relevant markdown files.
2. **Comment preservation check:** Verify that saving a config or script file does not erase user comments.
3. All native parser tests (`.snbt`, `.json5`, `.nbt`) are green.
4. No network requests are added to critical local UI path execution.
5. Windows file-handle access includes error handling or retry loops for `EBUSY`.
6. The change does not introduce forced online login or cloud-gated UI states.
