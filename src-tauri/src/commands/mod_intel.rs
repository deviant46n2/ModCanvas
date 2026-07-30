use tauri::State;
use uuid::Uuid;
use std::collections::HashMap;

use crate::db::Database;
use crate::mod_intelligence::ModIntelligence;
use crate::models::*;

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
pub async fn search_items(
    intelligence: State<'_, ModIntelligence>,
    query: String,
    loader: String,
    mc_version: String,
) -> Result<Vec<SearchResult>, String> {
    if query.trim().is_empty() {
        return Ok(Vec::new());
    }

    // Search Modrinth for items
    let mut results = Vec::new();
    
    // First, try to search Modrinth for projects matching the query
    let loader_enum = crate::models::ModLoader::from_str(&loader);
    let modrinth_results = intelligence.search_modrinth(&query, loader_enum, &mc_version).await
        .map_err(|e| e.to_string())?;
    
    for project in modrinth_results {
        results.push(SearchResult {
            id: project.mod_id.clone(),
            name: project.name,
            texture_url: project.documentation_url.clone(), // Use documentation_url as icon fallback
            tags: project.categories,
            source: "modrinth".to_string(),
            mod_id: Some(project.mod_id),
            version: None,
        });
    }
    
    Ok(results)
}

#[tauri::command]
pub async fn search_tags(
    intelligence: State<'_, ModIntelligence>,
    query: String,
    loader: String,
    mc_version: String,
) -> Result<Vec<TagInfo>, String> {
    if query.trim().is_empty() {
        return Ok(Vec::new());
    }

    // Search for mods that might provide the tag
    let loader_enum = crate::models::ModLoader::from_str(&loader);
    let modrinth_results = intelligence.search_modrinth(&query, loader_enum, &mc_version).await
        .map_err(|e| e.to_string())?;
    
    let mut results = Vec::new();
    for project in modrinth_results {
        results.push(TagInfo {
            id: format!("tag:{}", project.mod_id),
            name: project.name,
            member_count: 0,
            description: Some(project.description),
        });
    }
    
    Ok(results)
}

#[tauri::command]
pub async fn get_item_details(
    intelligence: State<'_, ModIntelligence>,
    item_id: String,
) -> Result<Option<SearchResult>, String> {
    // Parse item_id format: "project_id:version" or just "project_id"
    let parts: Vec<&str> = item_id.split(':').collect();
    let project_id = parts[0];
    
    let project = intelligence.fetch_project_basic(project_id).await
        .map_err(|e| e.to_string())?;
    
    Ok(Some(SearchResult {
        id: item_id,
        name: project.name,
        texture_url: project.documentation_url,
        tags: project.categories,
        source: "modrinth".to_string(),
        mod_id: Some(project.mod_id),
        version: None,
    }))
}

#[tauri::command]
pub fn check_compatibility(
    db: State<'_, Database>,
    project_id: String,
) -> Result<CompatibilityResult, String> {
    let pid = Uuid::parse_str(&project_id).map_err(|e| e.to_string())?;
    let mods = db.get_project_mods(&pid).map_err(|e| e.to_string())?;
    Ok(crate::mod_intelligence::check_compatibility(&mods))
}

#[tauri::command]
pub async fn get_mod_metadata(mod_id: String) -> Result<ModMetadata, String> {
    ModIntelligence::new().get_mod_metadata(&mod_id).await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Mod not found".to_string())
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

    Ok(intelligence.batch_get_metadata(&mod_ids, &loader_str, &project.minecraft_version).await)
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
    Ok(intelligence.check_compatibility_async(&mods, &loader_str, &project.minecraft_version).await)
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
pub fn scan_mod_jar_textures(mods_dir: String) -> Result<std::collections::HashMap<String, String>, String> {
    let path = std::path::Path::new(&mods_dir);
    Ok(crate::icons::scan_directory_for_jar_textures(path).by_item_id)
}

#[tauri::command]
pub fn get_texture_by_id(mods_dir: String, item_id: String) -> Result<Option<String>, String> {
    let path = std::path::Path::new(&mods_dir);
    if !path.exists() {
        return Ok(None);
    }
    for entry in std::fs::read_dir(path).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let jar_path = entry.path();
        if jar_path.extension().map_or(false, |ext| ext == "jar") {
            if let Some(data_url) = crate::icons::get_texture_from_jar(&jar_path, &item_id)
                .map_err(|e| e.to_string())?
            {
                return Ok(Some(data_url));
            }
        }
    }
    Ok(None)
}

#[tauri::command]
pub fn get_pack_icon(path: String) -> Result<Option<String>, String> {
    let p = std::path::Path::new(&path);
    Ok(crate::icons::get_pack_icon(p))
}
