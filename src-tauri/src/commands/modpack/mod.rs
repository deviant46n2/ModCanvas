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

/// Open Prism Launcher focused on the project's instance (PRISM-LEAN, s53):
/// `prismlauncher --show <instanceId>` lands the user on the instance window,
/// where Prism's own mod downloader — version matching AND dependency
/// resolution — takes over. The instance ID is the folder name of the
/// instance dir under `instances/`. Non-instance-backed projects (scratch
/// packs) error; the UI falls back to manual-download links.
#[tauri::command]
pub async fn open_prism_instance(
    project_id: String,
    db: State<'_, Database>,
) -> Result<(), String> {
    let pid = Uuid::parse_str(&project_id).map_err(|e| format!("Invalid project id: {e}"))?;
    let project = db
        .get_project(&pid)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Project not found".to_string())?;

    let instance_id = prism_instance_id(&project.path).ok_or_else(|| {
        "This pack is not tied to a Prism instance — install its mods manually from the project pages instead."
            .to_string()
    })?;

    std::process::Command::new("prismlauncher")
        .arg("--show")
        .arg(&instance_id)
        .spawn()
        .map_err(|e| format!("Failed to open Prism Launcher: {e}"))?;
    Ok(())
}

/// Derive a Prism instance ID from a project's game dir. Prism layouts are
/// `<root>/instances/<instanceId>/minecraft` — the ID is the instance folder
/// name, validated by its parent being `instances`. Anything else (scratch
/// packs, imported folders outside Prism) is not instance-backed.
fn prism_instance_id(game_dir: &str) -> Option<String> {
    let minecraft_dir = std::path::Path::new(game_dir);
    let instance_dir = minecraft_dir.parent()?;
    let instances_dir = instance_dir.parent()?;
    if instances_dir.file_name()?.to_str()? != "instances" {
        return None;
    }
    Some(instance_dir.file_name()?.to_string_lossy().to_string())
}

#[cfg(test)]
mod tests {
    use super::prism_instance_id;

    #[test]
    fn prism_instance_id_from_instance_layout() {
        let id = prism_instance_id("/home/u/.local/share/PrismLauncher/instances/My Pack/minecraft");
        assert_eq!(id.as_deref(), Some("My Pack"));
    }

    #[test]
    fn prism_instance_id_rejects_scratch_pack_paths() {
        assert_eq!(prism_instance_id("/home/u/packs/my-scratch-pack/minecraft"), None);
        assert_eq!(prism_instance_id("/home/u/.local/share/PrismLauncher/instances"), None);
    }
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
