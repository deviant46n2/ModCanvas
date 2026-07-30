pub mod kubejs;
pub mod crafttweaker;

use crate::models::Recipe;
use std::path::PathBuf;

/// Generate all recipe scripts for a project
pub fn generate_all_scripts(
    recipes: &[Recipe],
    project_path: &std::path::Path,
) -> Vec<(PathBuf, String)> {
    let mut scripts = Vec::new();
    let scripts_dir = project_path.join("scripts");
    let kubejs_dir = scripts_dir.join("kubejs");
    
    // KubeJS scripts
    scripts.extend(kubejs::generate_kubejs_scripts(&kubejs_dir, recipes));
    
    // CraftTweaker scripts - generates a single file
    let ct_content = crafttweaker::generate_crafttweaker_scripts(recipes, "ModCanvas Pack");
    scripts.push((scripts_dir.join("crafttweaker.zs"), ct_content));
    
    scripts
}

/// Generate scripts and return both KubeJS and CraftTweaker as strings for frontend
pub fn generate_script_strings(
    recipes: &[Recipe],
    pack_name: &str,
) -> (String, String) {
    let kubejs_scripts = kubejs::generate_kubejs_scripts(&PathBuf::new(), recipes);
    let kubejs_combined = kubejs_scripts.iter().map(|(_, content)| content.as_str()).collect::<Vec<_>>().join("\n\n");
    let crafttweaker = crafttweaker::generate_crafttweaker_scripts(recipes, pack_name);
    (kubejs_combined, crafttweaker)
}