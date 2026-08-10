//! Project templates — self-authored starter content packages scaffolded into
//! a new project by the First-Pack wizard (roadmap P0-WIZARD).
//!
//! Template content lives in `src-tauri/templates/` — deliberately OUTSIDE
//! `src/`, so the integrity line-limit scan treats it as data, not code — and
//! is embedded at compile time via `include_str!`. Content mirrors the app's
//! own export output (subdirs layout: `config/ftbquests/quests/`), so a
//! scaffolded pack imports, re-exports, and loads in-game exactly like a real
//! pack. Everything is self-authored plain text: the no-bundling rule
//! (AGENTS.md) is untouched.
//!
//! The seam: `scaffold_template` is pure (path in, files out, no Tauri
//! state), so `create_project` stays a thin command wrapper and the scaffold
//! is directly unit-testable.

use serde::Serialize;
use std::path::Path;

/// One template package. `files` maps a relative path (resolved under
/// `<project>/config/ftbquests/quests/`) to its embedded contents.
#[derive(Clone, Serialize)]
pub struct TemplateMeta {
    pub id: &'static str,
    pub name: &'static str,
    pub description: &'static str,
    #[serde(skip)]
    files: &'static [(&'static str, &'static str)],
}

const TEMPLATES: &[TemplateMeta] = &[TemplateMeta {
    id: "exploration",
    name: "Exploration Starter",
    description: "A collect-craft-build starter chapter that works on any version.",
    files: &[
        (
            "data.snbt",
            include_str!("../../templates/exploration/data.snbt"),
        ),
        (
            "Exploration_Starter/chapter.snbt",
            include_str!("../../templates/exploration/Exploration_Starter/chapter.snbt"),
        ),
    ],
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
pub fn scaffold_template(project_root: &Path, template_id: &str) -> Result<(), String> {
    let tpl = TEMPLATES
        .iter()
        .find(|t| t.id == template_id)
        .ok_or_else(|| format!("Unknown project template '{template_id}'"))?;

    let root = project_root
        .to_str()
        .ok_or_else(|| format!("Project path is not valid UTF-8: {}", project_root.display()))?;

    for (rel, contents) in tpl.files {
        // Same layout the app's own exporter produces, so the load pipeline
        // (`apiImportFtbQuests`) picks the scaffolded pack up like any real
        // pack on the first open.
        let rel = format!("ftbquests/quests/{rel}");
        let target = crate::path_safety::validate_project_write(root, &rel)?;
        if let Some(parent) = target.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create template directory {:?}: {e}", parent))?;
        }
        crate::path_safety::atomic_write_str(&target, contents)?;
    }
    Ok(())
}

#[cfg(test)]
mod tests;
