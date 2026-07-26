use chrono::Utc;
use tauri::AppHandle;
use tauri::State;
use uuid::Uuid;

use crate::db::Database;
use crate::minecraft::{InstanceManager, MinecraftInstance};
use crate::mod_intelligence;
use crate::models::*;

#[tauri::command]
pub fn create_project(
    db: State<'_, Database>,
    name: String,
    minecraft_version: String,
    mod_loader: String,
    path: String,
) -> Result<Project, String> {
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
pub fn list_projects(db: State<'_, Database>) -> Result<Vec<Project>, String> {
    db.list_projects().map_err(|e| e.to_string())
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
        enabled: true,
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
pub async fn search_mods(
    query: String,
    loader: String,
    mc_version: String,
) -> Result<Vec<ModMetadata>, String> {
    let loader_enum = match loader.as_str() {
        "Fabric" => ModLoader::Fabric,
        "Quilt" => ModLoader::Quilt,
        "NeoForge" => ModLoader::NeoForge,
        _ => ModLoader::Forge,
    };
    mod_intelligence::search_modrinth(&query, &loader_enum, &mc_version).await
}

#[tauri::command]
pub fn check_compatibility(
    db: State<'_, Database>,
    project_id: String,
) -> Result<CompatibilityResult, String> {
    let pid = Uuid::parse_str(&project_id).map_err(|e| e.to_string())?;
    let mods = db.get_project_mods(&pid).map_err(|e| e.to_string())?;
    Ok(mod_intelligence::check_compatibility(&mods))
}

#[tauri::command]
pub fn get_config(path: String) -> Result<serde_json::Value, String> {
    let content = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;

    if path.ends_with(".toml") || path.ends_with(".cfg") {
        let val: toml::Value = toml::from_str(&content).map_err(|e| e.to_string())?;
        let json_str =
            serde_json::to_string(&val).map_err(|e| e.to_string())?;
        serde_json::from_str(&json_str).map_err(|e| e.to_string())
    } else {
        serde_json::from_str(&content).map_err(|e| e.to_string())
    }
}

#[tauri::command]
pub fn save_config(path: String, content: String) -> Result<(), String> {
    std::fs::write(&path, &content).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_mod_metadata(mod_id: String) -> Result<ModMetadata, String> {
    mod_intelligence::get_mod_metadata(&mod_id).await
}

// Minecraft Instance Commands

#[tauri::command]
pub fn create_mc_instance(
    manager: State<'_, InstanceManager>,
    name: String,
    mc_version: String,
    loader: String,
    loader_version: Option<String>,
) -> Result<MinecraftInstance, String> {
    manager
        .create_instance(&name, &mc_version, &loader, loader_version.as_deref())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_mc_instances(manager: State<'_, InstanceManager>) -> Vec<MinecraftInstance> {
    manager.list_instances()
}

#[tauri::command]
pub async fn launch_mc_instance(
    manager: State<'_, InstanceManager>,
    app: AppHandle,
    instance_id: String,
    username: String,
    _java_path: Option<String>,
    min_mem: Option<String>,
    max_mem: Option<String>,
) -> Result<(), String> {
    manager
        .launch_instance(
            app,
            &instance_id,
            &username,
            min_mem.as_deref().unwrap_or("2G"),
            max_mem.as_deref().unwrap_or("4G"),
        )
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn stop_mc_instance(
    manager: State<'_, InstanceManager>,
    instance_id: String,
) -> Result<bool, String> {
    manager
        .stop_instance(&instance_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn remove_mc_instance(
    manager: State<'_, InstanceManager>,
    instance_id: String,
) -> Result<bool, String> {
    manager
        .remove_instance(&instance_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_mc_logs(
    manager: State<'_, InstanceManager>,
    instance_id: String,
) -> Result<String, String> {
    manager
        .get_logs(&instance_id)
        .map_err(|e| e.to_string())
}
