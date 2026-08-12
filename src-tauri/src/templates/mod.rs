//! Project templates — self-authored starter content packages scaffolded into
//! a new project by the First-Pack wizard (roadmap P0-WIZARD).
//!
//! Template content lives in `src-tauri/templates/` — deliberately OUTSIDE
//! `src/`, so the integrity line-limit scan treats it as data, not code — and
//! is embedded at compile time via `include_str!`. Content mirrors the app's
//! own export output (FlatChapters layout: `config/ftbquests/quests/chapters/
//! *.snbt` — the ONLY layout FTB Quests 1.21.x reads, verified in the
//! 2101.1.30 jar), so a scaffolded pack imports, re-exports, and loads
//! in-game exactly like a real pack. Everything is self-authored plain text:
//! the no-bundling rule (AGENTS.md) is untouched.
//!
//! The seam: `scaffold_template` is pure (path in, files out, no Tauri
//! state), so `create_project` stays a thin command wrapper and the scaffold
//! is directly unit-testable.

use serde::Serialize;
use std::path::Path;

/// One template package. `files` maps a relative path (resolved under
/// `<project>/config/ftbquests/quests/`) to its embedded contents;
/// `state_files` maps a relative path (resolved under the PROJECT ROOT —
/// `.modcanvas/` private state) to its embedded contents.
#[derive(Clone, Serialize)]
pub struct TemplateMeta {
    pub id: &'static str,
    pub name: &'static str,
    pub description: &'static str,
    #[serde(skip)]
    files: &'static [(&'static str, &'static str)],
    #[serde(skip)]
    state_files: &'static [(&'static str, &'static str)],
}

const TEMPLATES: &[TemplateMeta] = &[TemplateMeta {
    id: "exploration",
    name: "First Steps — Play & Shape Your Pack",
    description: "A survival intro that doubles as a ModCanvas tour: quests, recipes, configs, health, launch, export.",
    files: &[
        (
            "data.snbt",
            include_str!("../../templates/exploration/data.snbt"),
        ),
        (
            "chapters/Exploration_Starter.snbt",
            include_str!("../../templates/exploration/chapters/Exploration_Starter.snbt"),
        ),
        (
            "chapters/Shape_Your_Pack.snbt",
            include_str!("../../templates/exploration/chapters/Shape_Your_Pack.snbt"),
        ),
    ],
    // Example behaviors ship with the template so a new pack demonstrates
    // the Behaviors tab (roadmap §11.3: "Loot-on-kill / advancement gating
    // examples shipped in templates"). They are scaffolded as PRIVATE state
    // (`.modcanvas/`), same as the app writes on save — the Behaviors tab
    // lists them on first open, and Save re-emits the artifacts.
    state_files: &[(
        ".modcanvas/behaviors.json",
        include_str!("../../templates/exploration/behaviors.json"),
    )],
}];

/// List the templates the wizard can offer. Ids here are the only ids the
/// scaffold command accepts — the frontend never hardcodes a template list.
pub fn list_templates() -> Vec<TemplateMeta> {
    TEMPLATES.to_vec()
}

/// Write a template package into a project root: `<root>/config/ftbquests/
/// quests/<...>`. Every write goes through `validate_project_write` (scoped
/// to `<root>/config`, traversal-checked) and `atomic_write_str` (tmp +
/// rename), so an interrupted scaffold can never corrupt an instance.
///
/// The wizard may point at an EXISTING instance, so the scaffold refuses to
/// touch a quests dir that already holds content — a second scaffold or a
/// wizard run against an instance the game has already written would
/// otherwise clobber a real quest book.
pub fn scaffold_template(project_root: &Path, template_id: &str) -> Result<(), String> {
    let tpl = TEMPLATES
        .iter()
        .find(|t| t.id == template_id)
        .ok_or_else(|| format!("Unknown project template '{template_id}'"))?;

    let root = project_root
        .to_str()
        .ok_or_else(|| format!("Project path is not valid UTF-8: {}", project_root.display()))?;

    let quests_dir = project_root.join("config").join("ftbquests").join("quests");
    if quests_dir.exists() && quests_dir.read_dir().map_err(|e| e.to_string())?.next().is_some() {
        return Err(format!(
            "Project already contains a quest book at {} — templates only start fresh packs",
            quests_dir.display()
        ));
    }

    for (rel, contents) in tpl.files {
        // Same layout the app's own exporter produces (FlatChapters on
        // 1.21.x), so the load pipeline (`apiImportFtbQuests`) picks the
        // scaffolded pack up like any real pack on the first open.
        let rel = format!("ftbquests/quests/{rel}");
        let target = crate::path_safety::validate_project_write(root, &rel)?;
        if let Some(parent) = target.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create template directory {:?}: {e}", parent))?;
        }
        crate::path_safety::atomic_write_str(&target, contents)?;
    }

    // Private state files land at the PROJECT ROOT (`.modcanvas/...`) — the
    // same paths the app's own stores write, so the Behaviors tab reads a
    // scaffolded pack like one it created itself. The config-scoped
    // validate_project_write is wrong for these (they are not config); the
    // project-root scoping is validate_under_root.
    for (rel, contents) in tpl.state_files {
        let target = crate::path_safety::validate_under_root(project_root, rel)?;
        if let Some(parent) = target.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create template state dir {:?}: {e}", parent))?;
        }
        crate::path_safety::atomic_write_str(&target, contents)?;
    }
    Ok(())
}

#[cfg(test)]
mod tests;
