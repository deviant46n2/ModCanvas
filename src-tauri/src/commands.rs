use chrono::Utc;
use tauri::State;
use uuid::Uuid;

use crate::db::Database;
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
