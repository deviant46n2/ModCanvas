# Config Editor (Configs Tab)

The Configs tab is a structured editor for a Minecraft instance's configuration
files, offering both a **Structured** view (typed `ConfigValue` tree) and a
**Raw** text mode with undo/redo.

## Backing Location

Configs are edited **in place** against the selected instance's real on-disk
`config/` directory, resolved from the project:

```
<instance_path>/config/...
```

The legacy temp-mirror (`{temp_dir}/modcanvas_configs/<project-id>`) is no longer
the source the editor reads/writes. It remains only for quest/progression graph
artifacts produced by the import pipeline.

## Backend Layout

- `src-tauri/src/commands/config.rs` — the six IPC commands. Each resolves the
  project via `Database::get_project(project_id)` and scopes every path to
  `<project_path>/config`.
- `src-tauri/src/path_safety.rs` — path-safety validators:
  - `project_config_root(project_path)` — returns `<project_path>/config`.
  - `validate_project_read(root, path)` — read-only; requires the file to exist
    and resolve strictly inside the config directory.
  - `validate_project_write(root, path)` — creates the `config/` directory if
    missing, and validates the target (including nested, not-yet-existing
    parents) stays inside the config directory.
  - `atomic_write` / `atomic_write_str` — write to a `.tmp` then atomic rename,
    with a Windows `EBUSY`/lock retry loop.
- `src-tauri/src/config_parser.rs` — pure typed parsers/serializers (TOML/JSON/
  Properties/YAML/HOCON) with no system I/O.

### Commands

| Command | Args | Description |
| --- | --- | --- |
| `list_config_files` | `project_id` | Recursively list `config/` files (rel path, name, format, size). |
| `read_config_file` | `project_id`, `path` | Read a file as text. |
| `write_config_file` | `project_id`, `path`, `content` | Atomic write raw text. |
| `parse_config_file` | `project_id`, `path` | Parse a file into a typed config tree. |
| `save_structured_config` | `project_id`, `path`, `config` | Serialize + atomic write. |
| `get_config` / `save_config` | `path` / `path, content` | Legacy temp-mirror helpers, kept for compatibility. |

All `project_id` values are `Uuid`s resolved via the `Database`. Path traversal,
absolute escapes, and symlink escapes outside the config root are rejected.

## Frontend Architecture

- `frontend/src/services/config.ts` — Tauri invoke wrappers, all taking
  `projectId`.
- `frontend/src/hooks/useConfigState.ts` — per-project config state (file list,
  current file, structured/raw modes, undo stack, save state).
- `frontend/src/components/common/ConfigsTab.tsx` + `config-editor.tsx` — UI.

The tab is shown only when a pack has loaded, via
`ProjectWorkspace.tsx` → `ConfigsTab`.

## Conventions

- Preserve user comments: structured saves go through the comment-preserving
  parser, never a lossy JSON reformat.
- Atomic writes: never write directly to the target on the main thread of a
  filesystem that may be locked; always stage `.tmp` then rename.