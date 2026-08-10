pub mod curseforge;
pub mod curated;
pub mod exports;
pub mod ftb;
pub mod loader_version;
pub mod mrpack;
pub mod packwiz;
pub mod search;
pub mod search_merge;

pub use curseforge::*;
pub use curated::*;
pub use exports::*;
pub use ftb::*;
pub use mrpack::*;
pub use packwiz::*;
pub use search::*;

use tauri::State;
use uuid::Uuid;
use std::path::PathBuf;

use crate::commands::{load_quest_from_pack, resolve_curseforge_api_key};
use crate::db::Database;
use crate::imports::{ImportResult, resolution};
use crate::minecraft::deploy_companion_mod_to_dir;
use crate::mod_intelligence::ModIntelligence;
use crate::models::*;

fn try_deploy_companion(loader: &ModLoader, mc_version: &str, game_dir: &str) {
    let loader_str = match loader {
        ModLoader::NeoForge => "neoforge",
        ModLoader::Forge => "forge",
        ModLoader::Fabric => "fabric",
        ModLoader::Quilt => "quilt",
        ModLoader::Vanilla => return,
    };
    let path = std::path::PathBuf::from(game_dir);
    if let Err(e) = deploy_companion_mod_to_dir(&path, loader_str, mc_version) {
        eprintln!("[ModCanvas] Auto-deploy companion mod skipped: {e}");
    }
}

/// Open Prism Launcher's main window (for modpack browsing/management).
#[tauri::command]
pub async fn open_prism_launcher() -> Result<(), String> {
    std::process::Command::new("prismlauncher")
        .spawn()
        .map_err(|e| format!("Failed to open Prism Launcher: {e}"))?;
    Ok(())
}

#[tauri::command]
pub async fn import_instance_folder(
    path: String,
    db: State<'_, Database>,
    intelligence: State<'_, ModIntelligence>,
) -> Result<ImportResult, String> {
    let path = PathBuf::from(path);
    let result = crate::imports::instance::InstanceImporter::import(&path).map_err(|e| e.to_string())?;
    
    // Get CurseForge API key from settings
    let curseforge_api_key = resolve_curseforge_api_key(&db)?;
    
    let unresolved_mods = result.unresolved_mods.clone();
    let resolved = resolution::resolve_mods(
        unresolved_mods,
        &result.project.minecraft_version,
        result.project.mod_loader.clone(),
        intelligence.inner(),
        curseforge_api_key.as_deref()
    ).await;
    
    let mut final_result = result;
    final_result.mods = resolved.into_iter().map(|r| crate::imports::ResolvedMod {
        mod_id: r.mod_id,
        slug: r.slug,
        name: r.name,
        version: r.version,
        source: r.source,
        file_name: r.file_name,
    }).collect();
    
    db.create_project(&final_result.project).map_err(|e| e.to_string())?;
    try_deploy_companion(&final_result.project.mod_loader, &final_result.project.minecraft_version, &final_result.project.path);
    
    for mod_entry in &final_result.mods {
        let entry = ModEntry {
            id: Uuid::new_v4(),
            project_id: final_result.project.id,
            mod_id: mod_entry.mod_id.clone(),
            slug: mod_entry.slug.clone(),
            name: mod_entry.name.clone(),
            version: mod_entry.version.clone(),
            description: String::new(),
            author: String::new(),
            source: ModSource::Modrinth,
            enabled: true,
            added_at: chrono::Utc::now(),
        icon: None,
        file_name: Some(crate::models::normalize_mod_file_name(&mod_entry.file_name)),
        };
        db.add_mod(&entry).map_err(|e| e.to_string())?;
    }
    
    // Load quest graph from pack if exists
    if let Some(ref graph) = final_result.quest_graph {
        load_quest_from_pack(&final_result.project.id.to_string(), &PathBuf::from(&final_result.project.path))?;
        eprintln!("[ModCanvas] Loaded quest graph from pack: {} nodes", graph.nodes.len());
    }
    
    Ok(final_result)
}

#[tauri::command]
pub async fn auto_import_pack(
    path: String,
    db: State<'_, Database>,
    intelligence: State<'_, ModIntelligence>,
) -> Result<ImportResult, String> {
    let path = PathBuf::from(path);
    
    if crate::imports::mrpack::MrPackImporter::can_import(&path) {
        import_modrinth_mrpack(path.to_string_lossy().to_string(), db, intelligence).await
    } else if crate::imports::curseforge::CurseForgeImporter::can_import(&path) {
        import_curseforge_zip(path.to_string_lossy().to_string(), db, intelligence).await
    } else if crate::imports::packwiz::PackwizImporter::can_import(&path) {
        import_packwiz(path.to_string_lossy().to_string(), db, intelligence).await
    } else if crate::imports::instance::InstanceImporter::can_import(&path) {
        import_instance_folder(path.to_string_lossy().to_string(), db, intelligence).await
    } else {
        Err("Unsupported pack format".to_string())
    }
}

/// Open a native file picker for a modpack file, returning the absolute path.
///
/// The `tauri-plugin-dialog` -> rfd pipeline is unreliable on Wayland: rfd's
/// gtk3 backend cannot map a dialog window on some compositors (e.g. COSMIC),
/// and its xdg-portal backend can silently hang when the portal's FileChooser
/// implementation never presents a window. This command bypasses both by
/// invoking a standalone GTK picker (`zenity`/`kdialog`) via subprocess, which
/// renders its own top-level window and works on Wayland. Falls back to
/// `kdialog` when zenity is absent; returns `None` when the user cancels.
#[tauri::command]
pub fn pick_import_file() -> Result<Option<String>, String> {
    let filters = "*.zip *.mrpack *.toml";

    let zenity = std::process::Command::new("zenity")
        .args(["--file-selection", "--title", "Select modpack file", "--file-filter", &format!("Modpack files | {filters}")])
        .output();

    let output = match zenity {
        Ok(o) => o,
        Err(_) => std::process::Command::new("kdialog")
            .args(["--getopenfilename", "/", "*.zip *.mrpack *.toml"])
            .output()
            .map_err(|e| format!("Failed to launch file picker (zenity/kdialog not found): {e}"))?,
    };

    if !output.status.success() {
        return Ok(None); // user cancelled
    }

    let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if path.is_empty() {
        Ok(None)
    } else {
        Ok(Some(path))
    }
}
