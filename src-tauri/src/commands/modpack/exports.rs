use tauri::State;

use uuid::Uuid;

use crate::db::Database;
use crate::imports::{create_mrpack_zip, curseforge, mrpack};
use crate::models::*;
use crate::path_safety::atomic_write_str;
#[tauri::command]
pub async fn export_modrinth_mrpack(
    project_id: String,
    db: State<'_, Database>,
) -> Result<String, String> {
    let pid = Uuid::parse_str(&project_id).map_err(|e| e.to_string())?;
    let project = db.list_projects().map_err(|e| e.to_string())?
        .into_iter()
        .find(|p| p.id == pid)
        .ok_or("Project not found")?;
    
    let _mods = db.get_project_mods(&pid).map_err(|e| e.to_string())?;
    
    // Generate mrpack structure
    let temp_dir = tempfile::tempdir().map_err(|e| e.to_string())?;
    let mods_dir = temp_dir.path().join("mods");
    let config_dir = temp_dir.path().join("config");
    std::fs::create_dir_all(&mods_dir).map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&config_dir).map_err(|e| e.to_string())?;
    
    let files = Vec::new();
    let mut dependencies = mrpack::MrPackDependencies {
        minecraft: project.minecraft_version.clone(),
        forge: None,
        neoforge: None,
        fabric: None,
        quilt: None,
        loaders: Vec::new(),
    };
    
    match project.mod_loader {
        ModLoader::Fabric => dependencies.fabric = Some("latest".to_string()),
        ModLoader::Quilt => dependencies.quilt = Some("latest".to_string()),
        ModLoader::NeoForge => dependencies.neoforge = Some("latest".to_string()),
        ModLoader::Forge => dependencies.forge = Some("latest".to_string()),
        ModLoader::Vanilla => {},
    }
    
    let index = mrpack::MrPackIndex {
        format_version: 1,
        game: "minecraft".to_string(),
        version_id: project.pack_version.clone(),
        name: project.name.clone(),
        summary: Some(project.description.clone()),
        files,
        dependencies,
    };
    
    let index_json = serde_json::to_string_pretty(&index).map_err(|e| e.to_string())?;
    crate::path_safety::atomic_write_str(&temp_dir.path().join("modrinth.index.json"), &index_json).map_err(|e| e.to_string())?;
    
    // Create .mrpack zip
    let output_path = temp_dir.path().join(format!("{}.mrpack", project.name.replace(' ', "_")));
    create_mrpack_zip(temp_dir.path(), &output_path).map_err(|e| e.to_string())?;
    
    Ok(output_path.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn export_curseforge_zip(
    project_id: String,
    db: State<'_, Database>,
) -> Result<String, String> {
    let pid = Uuid::parse_str(&project_id).map_err(|e| e.to_string())?;
    let projects = db.list_projects().map_err(|e| e.to_string())?;
    let project = projects.into_iter()
        .find(|p| p.id == pid)
        .ok_or("Project not found")?;
    
    let mods = db.get_project_mods(&pid).map_err(|e| e.to_string())?;
    
    // Get config files
    let config_files_result = crate::commands::config::list_config_files_internal(&project);
    let config_files = config_files_result.unwrap_or_default();
    
    // Generate CurseForge zip
    let output_path = std::env::temp_dir().join(format!("{}.zip", project.name.replace(' ', "_")));
    curseforge::CurseForgeExporter::export(&project, &mods, &config_files, &output_path)
        .map_err(|e| e.to_string())?;
    
    Ok(output_path.to_string_lossy().to_string())
}
