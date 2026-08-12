pub mod config;
pub mod behavior;
pub mod history;
pub mod hotswap;
pub mod mod_intel;
pub mod modpack;
pub mod project;
pub mod quest_graph;
pub mod runtime;

pub use config::*;
pub use behavior::*;
pub use history::*;
pub use hotswap::*;
pub use mod_intel::*;
pub use modpack::*;
pub use quest_graph::*;
pub use project::*;
pub use runtime::*;

use crate::db::Database;
use crate::models::{Recipe, ModLoader, ModSource, ModEntry};
use crate::quest::QuestGraph;
use anyhow::Result;
use std::path::PathBuf;
use walkdir::WalkDir;
use tauri::State;
use uuid::Uuid;

/// Tauri-specific adapter bridging ProgressEmitter to Tauri's event system.
/// Lives here so both runtime.rs and project.rs can use it.
pub(crate) struct TauriProgressEmitter(pub tauri::AppHandle);

impl crate::minecraft::ProgressEmitter for TauriProgressEmitter {
    fn emit_progress(&self, progress: crate::minecraft::LaunchProgress) {
        use tauri::Emitter;
        let _ = self.0.emit("mc-launch-progress", progress);
    }
}

// ... rest of the file

/// Resolve the CurseForge API key: runtime env var (dev override) > OS
/// keychain > database fallback (key_store.rs). The compile-time baked key
/// path (`option_env!`) was REMOVED 2026-08-10 — a credential compiled into
/// every distributed binary is a published credential.
pub(super) fn resolve_curseforge_api_key(db: &Database) -> Result<Option<String>, String> {
    // 1. Runtime env var (dev override)
    if let Ok(key) = std::env::var("CURSEFORGE_API_KEY") {
        if !key.is_empty() {
            return Ok(Some(key));
        }
    }
    // 2. OS keychain, then the database fallback.
    Ok(crate::key_store::get(db).0)
}

/// Load quest graph from a pack directory and save to project config.
/// Tries native quests.json first, then falls back to FTB Quests SNBT import.
pub(super) fn load_quest_from_pack(project_id: &str, pack_dir: &PathBuf) -> Result<(), String> {
    let quest_path = pack_dir.join("quests.json");
    if quest_path.exists() {
        let content = std::fs::read_to_string(&quest_path).map_err(|e| e.to_string())?;
        let graph: QuestGraph = serde_json::from_str(&content).map_err(|e| e.to_string())?;
        let graph_path = crate::path_safety::quest_graph_path(
            pack_dir.to_str().ok_or("Invalid pack directory path")?,
        )?;
        crate::path_safety::atomic_write_str(&graph_path, &serde_json::to_string_pretty(&graph).map_err(|e| e.to_string())?)?;
        crate::quest_cache::put(project_id, &graph);
        eprintln!("[ModCanvas] Loaded quest graph from pack: {} nodes, {} edges", graph.nodes.len(), graph.edges.len());
        return Ok(());
    }

    // Fallback: try importing FTB Quests SNBT data
    if let Ok(result) = crate::imports::ftb_quests::import_ftb_quests(pack_dir) {
        if result.quest_count > 0 && result.chapter_count > 0 {
            let graph_path = crate::path_safety::quest_graph_path(
                pack_dir.to_str().ok_or("Invalid pack directory path")?,
            )?;
            crate::path_safety::atomic_write_str(
                &graph_path,
                &serde_json::to_string_pretty(&result.graph).map_err(|e| e.to_string())?,
            )?;
            crate::quest_cache::put(project_id, &result.graph);
            eprintln!(
                "[ModCanvas] Imported FTB Quests from pack: {} chapters, {} quests, {} nodes, {} edges",
                result.chapter_count,
                result.quest_count,
                result.graph.nodes.len(),
                result.graph.edges.len(),
            );
        } else {
            eprintln!("[ModCanvas] No FTB Quests data found in pack at {:?}", pack_dir);
        }
    }

    Ok(())
}

/// Scan an instance's mods folder and populate the database with mod info.
/// This allows mods from imported Prism instances to appear in the Mods tab.
#[tauri::command]
pub async fn scan_instance_mods(
    db: State<'_, Database>,
    project_id: String,
) -> Result<Vec<ModEntry>, String> {
    let pid = Uuid::parse_str(&project_id).map_err(|e| e.to_string())?;
    
    // Get the project to find its path
    let projects = db.list_projects().map_err(|e| e.to_string())?;
    let project = projects.into_iter()
        .find(|p| p.id == pid)
        .ok_or_else(|| "Project not found".to_string())?;
    
    let game_dir = PathBuf::from(&project.path);
    let mods_dir = game_dir.join("mods");
    
    if !mods_dir.exists() {
        eprintln!("[ModCanvas] No mods directory found at {:?}", mods_dir);
        return Ok(Vec::new());
    }
    
    let mut mods = Vec::new();
    
    for entry in WalkDir::new(&mods_dir).into_iter().filter_map(|e| e.ok()) {
        let file_path = entry.path();
        if file_path.extension().map_or(false, |ext| ext == "jar") {
            if let Ok(Some(mod_info)) = crate::shared::extract_mod_info_from_jar(file_path) {
                let mod_id = mod_info.mod_id.unwrap_or_else(|| {
                    file_path.file_stem()
                        .and_then(|s| s.to_str())
                        .unwrap_or("unknown")
                        .to_string()
                });
                
                let entry = ModEntry {
                    id: Uuid::new_v4(),
                    project_id: pid,
                    mod_id: mod_id.clone(),
                    slug: mod_id.clone(),
                    name: mod_id.clone(),
                    version: mod_info.version.unwrap_or_default(),
                    description: mod_info.description.unwrap_or_default(),
                    author: String::new(),
                    source: match mod_info.loader {
                        Some(ModLoader::Fabric) => ModSource::Modrinth,
                        Some(ModLoader::Quilt) => ModSource::Modrinth,
                        Some(ModLoader::Forge) => ModSource::CurseForge,
                        Some(ModLoader::NeoForge) => ModSource::CurseForge,
                        _ => ModSource::Local,
                    },
                    enabled: true,
                    added_at: chrono::Utc::now(),
                    icon: mod_info.icon_data_url,
                    file_name: file_path
                        .file_name()
                        .map(|s| s.to_string_lossy().to_string()),
                };
                mods.push(entry);
            }
        }
    }
    
    // Save to database (upsert by mod_id)
    for mod_entry in &mods {
        let _ = db.add_mod(mod_entry);
    }
    
    eprintln!("[ModCanvas] Scanned {} mods from instance at {:?}", mods.len(), mods_dir);
    Ok(mods)
}

#[tauri::command]
pub async fn generate_recipe_scripts(
    project_id: String,
    recipes: Vec<Recipe>,
    disabled_ids: Vec<String>,
) -> Result<ScriptOutput, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let (kubejs, ct) =
            crate::scriptgen::generate_script_strings(&recipes, &disabled_ids, "ModCanvas Pack");
        Ok(ScriptOutput { kubejs, crafttweaker: ct })
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn write_script_files(
    db: State<'_, Database>,
    project_id: String,
    kubejs_script: String,
    crafttweaker_script: String,
) -> Result<(), String> {
    use crate::path_safety::{atomic_write_str, validate_project_write};
    use std::path::PathBuf;

    let pid = Uuid::parse_str(&project_id).map_err(|e| e.to_string())?;
    let project = db
        .get_project(&pid)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Project not found".to_string())?;
    let root = PathBuf::from(&project.path);

    // Scope: write KubeJS recipes under
    // `<project>/kubejs/server_scripts/modcanvas_recipes.js` (a dedicated file
    // so a save NEVER overwrites a pack-author's existing recipe files, e.g.
    // `recipes.js`) and CraftTweaker under
    // `<project>/scripts/modcanvas_crafttweaker.zs`. Both are validated to
    // remain inside the project root and written atomically so an interrupted
    // write never corrupts the existing script.
    let kubejs_rel = "kubejs/server_scripts/modcanvas_recipes.js";
    let kubejs_abs = validate_project_write(&project.path, kubejs_rel)?;
    if let Some(parent) = kubejs_abs.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    atomic_write_str(&kubejs_abs, &kubejs_script)?;

    let ct_rel = "scripts/modcanvas_crafttweaker.zs";
    let ct_abs = validate_project_write(&project.path, ct_rel)?;
    if let Some(parent) = ct_abs.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    atomic_write_str(&ct_abs, &crafttweaker_script)?;

    Ok(())
}

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScriptOutput {
    pub kubejs: String,
    pub crafttweaker: String,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct PrismInstance {
    pub name: String,
    pub path: String,
}

/// List Prism Launcher instances by scanning the standard instances directory.
#[tauri::command]
pub fn list_prism_instances() -> Result<Vec<PrismInstance>, String> {
    let home = dirs_next::home_dir().ok_or_else(|| "Cannot find home directory".to_string())?;
    let instances_dir = home.join(".local/share/PrismLauncher/instances");
    if !instances_dir.exists() {
        return Ok(Vec::new());
    }

    let mut instances = Vec::new();
    for entry in std::fs::read_dir(&instances_dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }

        let cfg_path = path.join("instance.cfg");
        if !cfg_path.exists() {
            continue;
        }

        let name = read_prism_instance_name(&cfg_path).unwrap_or_default();
        if name.is_empty() {
            continue;
        }

        let mc_dir = if path.join(".minecraft").exists() {
            path.join(".minecraft")
        } else if path.join("minecraft").exists() {
            path.join("minecraft")
        } else {
            continue;
        };

        instances.push(PrismInstance {
            name,
            path: mc_dir.to_string_lossy().to_string(),
        });
    }

    instances.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(instances)
}

fn read_prism_instance_name(cfg_path: &std::path::Path) -> Option<String> {
    let content = std::fs::read_to_string(cfg_path).ok()?;
    for line in content.lines() {
        if line.starts_with("name=") {
            return Some(line[5..].trim().to_string());
        }
    }
    None
}
