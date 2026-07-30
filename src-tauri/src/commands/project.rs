use chrono::Utc;
use tauri::{AppHandle, State};
use uuid::Uuid;

use crate::db::Database;
use crate::minecraft::InstanceManager;
use crate::models::*;
use super::resolve_curseforge_api_key;

#[tauri::command]
pub fn create_project(
    db: State<'_, Database>,
    name: String,
    minecraft_version: String,
    mod_loader: String,
    path: String,
) -> Result<Project, String> {
    let name = crate::path_safety::sanitize_project_name(&name)?;
    let loader = match mod_loader.as_str() {
        "Fabric" => ModLoader::Fabric,
        "Quilt" => ModLoader::Quilt,
        "NeoForge" => ModLoader::NeoForge,
        _ => ModLoader::Forge,
    };

    let now = Utc::now();
    let project = Project {
        id: Uuid::new_v4(),
        name,
        description: String::new(),
        minecraft_version,
        mod_loader: loader,
        pack_format: PackFormat::Unknown,
        pack_version: "1.0.0".to_string(),
        author: String::new(),
        created_at: now,
        updated_at: now,
        path,
    };

    db.create_project(&project).map_err(|e| e.to_string())?;
    Ok(project)
}

#[tauri::command]
pub fn list_projects(
    db: State<'_, Database>,
    manager: State<'_, InstanceManager>,
) -> Result<Vec<Project>, String> {
    let instances = manager.reload_instances();
    db.upsert_prism_instances(&instances)
        .map_err(|e| format!("Failed to sync instances: {e}"))?;
    db.list_projects().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_project(db: State<'_, Database>, project_id: String) -> Result<bool, String> {
    let id = Uuid::parse_str(&project_id).map_err(|e| e.to_string())?;

    // Look up the project's path so we can remove the Prism instance dir too
    if let Ok(Some(project)) = db.get_project(&id) {
        let game_dir = std::path::PathBuf::from(&project.path);
        if let Some(instance_dir) = game_dir.parent() {
            if instance_dir.exists() {
                let _ = std::fs::remove_dir_all(instance_dir);
            }
        }
    }

    db.delete_project(&id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_curseforge_api_key(db: State<'_, Database>) -> Result<Option<String>, String> {
    resolve_curseforge_api_key(&db)
}

#[tauri::command]
pub fn set_curseforge_api_key(db: State<'_, Database>, key: String) -> Result<(), String> {
    db.set_curseforge_api_key(&key).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn open_project(db: State<'_, Database>, project_id: String) -> Result<Project, String> {
    let projects = db.list_projects().map_err(|e| e.to_string())?;
    let id = Uuid::parse_str(&project_id).map_err(|e| e.to_string())?;
    projects
        .into_iter()
        .find(|p| p.id == id)
        .ok_or_else(|| "Project not found".to_string())
}

#[tauri::command]
pub fn add_mod(
    db: State<'_, Database>,
    project_id: String,
    mod_id: String,
    slug: String,
    name: String,
    version: String,
    description: String,
    author: String,
    source: String,
    enabled: Option<bool>,
) -> Result<ModEntry, String> {
    let entry = ModEntry {
        id: Uuid::new_v4(),
        project_id: Uuid::parse_str(&project_id).map_err(|e| e.to_string())?,
        mod_id,
        slug,
        name,
        version,
        description,
        author,
        source: match source.as_str() {
            "Modrinth" => ModSource::Modrinth,
            "CurseForge" => ModSource::CurseForge,
            _ => ModSource::Local,
        },
        enabled: enabled.unwrap_or(true),
        added_at: Utc::now(),
    };

    db.add_mod(&entry).map_err(|e| e.to_string())?;
    Ok(entry)
}

#[tauri::command]
pub fn remove_mod(
    db: State<'_, Database>,
    project_id: String,
    mod_id: String,
) -> Result<bool, String> {
    let pid = Uuid::parse_str(&project_id).map_err(|e| e.to_string())?;
    db.remove_mod(&pid, &mod_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_project_mods(
    db: State<'_, Database>,
    project_id: String,
) -> Result<Vec<ModEntry>, String> {
    let pid = Uuid::parse_str(&project_id).map_err(|e| e.to_string())?;
    db.get_project_mods(&pid).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn save_project(
    _db: State<'_, Database>,
    project_id: String,
) -> Result<(), String> {
    let _pid = Uuid::parse_str(&project_id).map_err(|e| e.to_string())?;
    // Project is already persisted in DB on creation/mod changes
    // This command exists as an explicit save point for the frontend
    Ok(())
}

#[tauri::command]
pub async fn test_project(
    app: AppHandle,
    db: State<'_, Database>,
    manager: State<'_, InstanceManager>,
    project_id: String,
    username: String,
    min_mem: Option<String>,
    max_mem: Option<String>,
) -> Result<(), String> {
    eprintln!("[ModCanvas] test_project CALLED with project_id={}", project_id);
    let pid = Uuid::parse_str(&project_id).map_err(|e| e.to_string())?;

    // Get project
    let projects = db.list_projects().map_err(|e| e.to_string())?;
    let project = projects.into_iter()
        .find(|p| p.id == pid)
        .ok_or_else(|| "Project not found".to_string())?;

    eprintln!("[ModCanvas] test_project: {} (path={})", project.name, project.path);

    // Find the matching Prism instance by game_dir path
    let instances = manager.list_instances();
    let instance = instances.iter()
        .find(|i| i.game_dir == project.path)
        .ok_or_else(|| format!("No Prism instance found for '{}' (path={})", project.name, project.path))?;

    eprintln!("[ModCanvas] Launching existing instance: {} (id={})", instance.name, instance.id);

    let min_mem = min_mem.unwrap_or_else(|| "2G".to_string());
    let max_mem = max_mem.unwrap_or_else(|| "4G".to_string());
    manager.launch_instance(
        Box::new(super::TauriProgressEmitter(app)),
        &instance.id,
        &username,
        &min_mem,
        &max_mem,
    )?;

    Ok(())
}

#[tauri::command]
pub fn deploy_companion_mod_for_project(
    db: State<'_, Database>,
    manager: State<'_, InstanceManager>,
    project_id: String,
) -> Result<(), String> {
    let pid = Uuid::parse_str(&project_id).map_err(|e| e.to_string())?;
    let project = db.get_project(&pid).map_err(|e| e.to_string())?
        .ok_or_else(|| "Project not found".to_string())?;

    let instances = manager.list_instances();
    let instance = instances.iter()
        .find(|i| i.game_dir == project.path)
        .ok_or_else(|| format!("No Prism instance found for '{}'", project.name))?;

    manager.deploy_companion_mod_by_id(&instance.id)
}

#[tauri::command]
pub fn sync_instance_mods(
    db: State<'_, Database>,
    project_id: String,
) -> Result<usize, String> {
    let pid = Uuid::parse_str(&project_id).map_err(|e| e.to_string())?;
    
    // Get the project to find its mods directory
    let project = db.get_project(&pid).map_err(|e| e.to_string())?
        .ok_or_else(|| "Project not found".to_string())?;
    
    let game_dir = std::path::PathBuf::from(&project.path);
    let mods_dir = game_dir.join("mods");
    
    db.sync_instance_mods(&pid, &mods_dir).map_err(|e| e.to_string())
}
