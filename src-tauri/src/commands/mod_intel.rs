use tauri::State;
use uuid::Uuid;

use crate::db::Database;
use crate::mod_intelligence::ModIntelligence;
use crate::models::*;

use super::resolve_curseforge_api_key;

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct SearchResult {
    pub id: String,
    pub name: String,
    pub texture_url: Option<String>,
    pub tags: Vec<String>,
    pub source: String, // "modrinth", "curseforge", "local"
    pub mod_id: Option<String>,
    pub version: Option<String>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct TagInfo {
    pub id: String,
    pub name: String,
    pub member_count: usize,
    pub description: Option<String>,
}

#[tauri::command]
pub async fn get_project_mod_metadata(
    db: State<'_, Database>,
    intelligence: State<'_, ModIntelligence>,
    project_id: String,
) -> Result<Vec<ModMetadata>, String> {
    let pid = Uuid::parse_str(&project_id).map_err(|e| e.to_string())?;
    let mods = db.get_project_mods(&pid).map_err(|e| e.to_string())?;

    let projects = db.list_projects().map_err(|e| e.to_string())?;
    let project = projects.into_iter()
        .find(|p| p.id == pid)
        .ok_or_else(|| "Project not found".to_string())?;

    let loader_str = project.mod_loader.to_string();
    let mod_ids: Vec<String> = mods.iter().map(|m| m.mod_id.clone()).collect();

    let cf_api_key = resolve_curseforge_api_key(&db)?;
    Ok(intelligence
        .batch_get_metadata(&mod_ids, &loader_str, &project.minecraft_version, cf_api_key.as_deref())
        .await)
}

#[tauri::command]
pub async fn check_compatibility_async(
    db: State<'_, Database>,
    intelligence: State<'_, ModIntelligence>,
    project_id: String,
) -> Result<CompatibilityResult, String> {
    let pid = Uuid::parse_str(&project_id).map_err(|e| e.to_string())?;
    let mods = db.get_project_mods(&pid).map_err(|e| e.to_string())?;

    let projects = db.list_projects().map_err(|e| e.to_string())?;
    let project = projects.into_iter()
        .find(|p| p.id == pid)
        .ok_or_else(|| "Project not found".to_string())?;

    let loader_str = project.mod_loader.to_string();
    let cf_api_key = resolve_curseforge_api_key(&db)?;
    Ok(intelligence
        .check_compatibility_async(&mods, &loader_str, &project.minecraft_version, cf_api_key.as_deref())
        .await)
}

#[tauri::command]
pub async fn get_dep_names(
    intelligence: State<'_, ModIntelligence>,
    mod_ids: Vec<String>,
) -> Result<Vec<serde_json::Value>, String> {
    let mut results = Vec::new();
    for mod_id in &mod_ids {
        match intelligence.fetch_project_basic(mod_id).await {
            Ok(meta) => {
                results.push(serde_json::json!({
                    "mod_id": mod_id,
                    "slug": meta.slug,
                    "name": meta.name
                }));
            }
            Err(e) => {
                eprintln!("[ModCanvas] get_dep_names failed for {}: {}", mod_id, e);
                results.push(serde_json::json!({
                    "mod_id": mod_id,
                    "slug": mod_id,
                    "name": mod_id
                }));
            }
        }
    }
    Ok(results)
}

#[tauri::command]
pub fn get_pack_icon(path: String) -> Result<Option<String>, String> {
    let p = std::path::Path::new(&path);
    Ok(crate::icons::get_pack_icon(p))
}

#[tauri::command]
pub fn log_debug(message: String) -> Result<(), String> {
    println!("[DEBUG] {}", message);
    Ok(())
}
