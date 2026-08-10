# Templates — First-Pack wizard content packages

Templates are self-authored starter content that the First-Pack wizard (roadmap
P0-WIZARD) scaffolds into a new project on creation. They exist so a beginner
creates a *coherent* pack, not an empty directory.

## Where templates live

- **Content:** `src-tauri/templates/<template_id>/` — deliberately OUTSIDE
  `src/`, so the integrity line-limit scan (`lineLimitPaths` in
  `integrity-rules.json`) treats them as data, not code.
- **Registry:** `src-tauri/src/templates/mod.rs` — the `TEMPLATES` const array.
  Each entry is a `TemplateMeta { id, name, description, files }`, where
  `files` maps a relative path to content embedded at compile time via
  `include_str!`.
- **The only ids that exist are the ids in the registry.** The frontend never
  hardcodes a template list; it asks `list_project_templates` (which returns
  `{id, name, description}`).

## The scaffold

`create_project` (with `template_id: Some(id)`) calls
`crate::templates::scaffold_template(&path, &id)` in the same command — there
is never a "created but empty" state. The modal passes `None` and behaves
exactly as before.

Each file is written to `<project>/config/ftbquests/quests/<rel>` through:

1. `validate_project_write` — scopes the write to `<project>/config`,
   traversal- and symlink-checked.
2. `atomic_write_str` — tmp + rename, so an interrupted scaffold can never
   corrupt an instance.

## Content rules

1. **Mirror the exporter's subdirs layout.** The package's `quests/` structure
   must match what `export_ftb_quests_snbt` produces (`data.snbt` +
   `<chapter>/chapter.snbt`), so the app's own importer — the same one that
   runs on every pack open — consumes the scaffold like any real pack. The
   fidelity tests enforce this: `templates/tests.rs` imports every scaffold
   and asserts chapters/quests/tasks/edges survive, including an
   import → export → re-import round trip.
2. **No comments in template SNBT.** The sidecar comment machinery is for the
   app's own exports; template content stays plain to keep diffs clean.
3. **Vanilla ids only.** Template content must work on every served version
   without adapter gating (no data components, no version-specific fields).
4. **Self-authored text only** — the no-bundling rule (AGENTS.md §6) is
   untouched: templates never contain image bytes or game-derived assets.
5. **Numeric suffixes matter** (`1L`, `0.5d`) — the SNBT serializer and the
   game both require them; see AGENTS.md "Stringified NBT".

## Adding a template

1. Create `src-tauri/templates/<id>/` with the content files (subdirs layout).
2. Add a `TemplateMeta` entry to `TEMPLATES` in `templates/mod.rs` with a
   one-line `description` for the wizard card.
3. Add a test to `templates/tests.rs` that scaffolds the new id and asserts
   it imports cleanly (the existing tests are the template).
4. Run `cargo test templates::` and the full suite; verify integrity + health
   before committing.

Templates are versioned with the app: changing the package format means
changing the registry and its tests in the same commit. Content can be
extended independently (more quests, config profiles, recipe scripts) as long
as it stays inside the same layout.
