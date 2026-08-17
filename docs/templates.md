# Templates — first-pack content packages

Templates are self-authored starter content that a start path scaffolds into a
new project on creation. They exist so a new pack is a *coherent* pack, not an
empty directory.

## The shipped templates (s49)

The registry ships two templates, both consumed by the four-card StartChooser
(`frontend/src/components/common/StartChooser.tsx`):

| id | Name | What it scaffolds |
|---|---|---|
| `intro` | Intro — your first pack in minutes | One chapter, 6 quests: the core loop (workbench → add quest → task+reward → save → health) + a final **Shed the Guide** quest that teaches deleting the chapter. Lands in Beginner Mode. No behaviors state. |
| `ide-tour` | IDE Tour — learn every tool | One chapter, 21 quests: the full feature walkthrough (quests, recipes, configs, behaviors, loot, mods, health, launch, export) + **Shed the Guide**. Pure tool teaching — no play chapter. Ships **14 example behaviors** — the minimal complete vocabulary showcase (every trigger/condition/action, both backends; see `docs/behaviors.md` "Template examples"). |

Both end with **Shed the Guide** — a self-removing lesson: the last quest of a
guided start teaches the user to delete the guide chapter, converging a guided
start to the same result as a blank one (gear icon in the chapter tree →
Delete Chapter, `ChapterSettings.tsx`).

## Where templates live

- **Content:** `src-tauri/templates/<template_id>/` — deliberately OUTSIDE
  `src/`, so the integrity line-limit scan (`lineLimitPaths` in
  `integrity-rules.json`) treats them as data, not code.
- **Registry:** `src-tauri/src/templates/mod.rs` — the `TEMPLATES` const array.
  Each entry is a `TemplateMeta { id, name, description, files, state_files }`,
  where `files` maps a relative path to content embedded at compile time via
  `include_str!`, and `state_files` maps project-root private state (e.g.
  `.modcanvas/behaviors.json`).
- **The only ids that exist are the ids in the registry.** The chooser's two
  template cards pass the ids `intro` and `ide-tour`; adding a third template
  means a third card + a registry entry, never a hardcoded content list.

## The scaffold

`create_project` (with `template_id: Some(id)`) calls
`crate::templates::scaffold_template(&path, &id)` in the same command — there
is never a "created but empty" state. A blank start passes `None` and behaves
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
4. **Icons are compound, never bare strings.** Every `icon` field must use the
    1.21 Data Components compound form (`icon = { id = "minecraft:chest" }`),
    the exact form the exporter emits and the game's own save uses. A bare
    string (`icon = "minecraft:chest"`) parses but renders no icon in-game —
    a scaffolded pack shows icon-less quests until the first save rewrites
    them. Locked by `template_icon_fields_are_never_bare_strings` (the s45
    item-lock's sibling).
5. **Self-authored text only** — the no-bundling rule (AGENTS.md §6) is
    untouched: templates never contain image bytes or game-derived assets.
6. **Numeric suffixes matter** (`1L`, `0.5d`) — the SNBT serializer and the
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
