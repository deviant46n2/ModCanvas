// Scanning + parsing pack recipe sources into the app's `Recipe` model.
// Pure-ish: no UI, no IPC — only filesystem reads. The scanner walks the
// pack's real recipe locations (data/*/recipes/*.json, KubeJS server scripts,
// CraftTweaker scripts) so the editor can load *existing* recipes, not just
// author new ones.
// Split into: `helpers` (JSON->model converters), `pack_scan` (the pack
// walker + its end-to-end tests), plus the per-source parsers below.

pub mod cache;
pub mod crafttweaker;
pub mod kubejs;
pub mod scan;
pub mod vanilla;
mod helpers;
mod crafttweaker_helpers;
mod kubejs_helpers;
mod pack_scan;

pub(crate) use helpers::{base_recipe, first_ingredient, ingredient_from_item_or_tag, result_from_output};
pub use pack_scan::scan_pack_recipes;

use crate::models::Recipe;
use serde::{Deserialize, Serialize};

/// Provenance of a discovered recipe.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum RecipeOrigin {
    /// A data-pack JSON at `data/<ns>/recipes/<name>.json`.
    Vanilla,
    /// A KubeJS `event.*` recipe call in `kubejs/server_scripts/**`.
    Kubejs,
    /// A CraftTweaker `recipes.add*` / `furnace.*` call in `scripts/**`.
    Crafttweaker,
}

/// 1-based line range of a recipe call inside its source file, covering the
/// whole call including any swallowed `.modifier(...)` chains.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LineSpan {
    pub start: u32,
    pub end: u32,
}

/// A recipe recovered from a KubeJS/CraftTweaker script, plus the source line
/// range it was found on (used for comment-out / uncomment).
#[derive(Debug, Clone)]
pub struct ParsedRecipe {
    pub recipe: Recipe,
    pub lines: Option<LineSpan>,
}

/// A recipe discovered on disk, ready to be loaded into the editor.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscoveredRecipe {
    pub recipe: Recipe,
    pub origin: RecipeOrigin,
    /// Absolute path of the source file.
    pub source: String,
    /// Recipe name/id from the source (file stem, or KubeJS `output` id).
    pub id: String,
    /// Human description of the file (e.g. `data/minecraft/recipes/x.json`).
    pub label: String,
    /// True when this file is pack-authored (editable) vs from a mod jar.
    pub editable: bool,
    /// Source line span of the call (KubeJS/CraftTweaker only; `None` for
    /// vanilla JSON / jar recipes which have no comment-out mechanism).
    pub span: Option<LineSpan>,
}

impl DiscoveredRecipe {
    fn label_for(path: &std::path::Path, root: &std::path::Path) -> String {
        path.strip_prefix(root)
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_else(|_| path.to_string_lossy().to_string())
    }
}

/// Tauri command: scan a project path for discoverable recipes.
/// Heavy (reads every jar's recipe JSONs on a real pack) — runs off the main
/// thread so the webview stays responsive during the first scan.
#[tauri::command]
pub async fn scan_pack_recipes_cmd(project_path: String) -> Result<Vec<DiscoveredRecipe>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let path = std::path::Path::new(&project_path);
        if !path.is_dir() {
            return Err(format!(
                "The project folder '{}' does not exist on disk — the pack may have been moved or deleted. Delete this project and re-create/re-import it.",
                project_path
            ));
        }
        Ok(scan_pack_recipes(path))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests;
