use tauri::State;
use uuid::Uuid;
use std::path::PathBuf;

use crate::db::Database;
use crate::imports::{ImportResult, mrpack, quest_config, resolution};
use crate::mod_intelligence::ModIntelligence;
use crate::models::*;
use crate::path_safety::atomic_write_str;

use super::{load_quest_from_pack, resolve_curseforge_api_key, try_deploy_companion};
#[tauri::command]
pub async fn download_modpack_modrinth(
    slug: String,
    mc_version: String,
    loader: String,
    db: State<'_, Database>,
    intelligence: State<'_, ModIntelligence>,
) -> Result<ImportResult, String> {
    let client = reqwest::Client::new();
    
    // Get the latest version file for the modpack
    let url = format!("https://api.modrinth.com/v2/project/{}/version", slug);
    let resp = client.get(&url)
        .header("User-Agent", "MMM/0.1.0")
        .send()
        .await
        .map_err(|e| e.to_string())?;
    
    #[derive(serde::Deserialize)]
    struct ModrinthVersion {
        files: Vec<ModrinthFile>,
        game_versions: Vec<String>,
        loaders: Vec<String>,
    }
    
    #[derive(serde::Deserialize)]
    struct ModrinthFile {
        url: String,
        filename: String,
        primary: bool,
    }
    
    let versions: Vec<ModrinthVersion> = resp.json().await.map_err(|e| e.to_string())?;
    
    // Find matching version - try exact match first, then fallback strategies
    let loader_lower = loader.to_lowercase();
    
    // Strategy 1: Exact match (MC version + loader)
    let mut matching_version = versions.iter().find(|v| {
        v.game_versions.contains(&mc_version) && 
        v.loaders.iter().any(|l| l.to_lowercase() == loader_lower)
    });
    
    // Strategy 2: Match MC version, any loader
    if matching_version.is_none() {
        matching_version = versions.iter().find(|v| {
            v.game_versions.contains(&mc_version)
        });
    }
    
    // Strategy 3: Match loader, latest MC version
    if matching_version.is_none() {
        matching_version = versions.iter().find(|v| {
            v.loaders.iter().any(|l| l.to_lowercase() == loader_lower)
        });
    }
    
    // Strategy 4: Just take the latest version
    if matching_version.is_none() {
        matching_version = versions.last();
    }
    
    let matching_version = matching_version.ok_or_else(|| "No versions found for this modpack".to_string())?;
    
    let file = matching_version.files.iter().find(|f| f.primary)
        .or_else(|| matching_version.files.iter().find(|f| f.filename.ends_with(".mrpack")))
        .ok_or_else(|| "No .mrpack file found".to_string())?;
    
    let file_url = file.url.clone();
    let file_filename = file.filename.clone();
    
    // Download the mrpack
    let resp = client.get(&file_url).send().await.map_err(|e| e.to_string())?;
    let bytes = resp.bytes().await.map_err(|e| e.to_string())?;
    
    // Save to temp file
    let temp_dir = std::env::temp_dir();
    let mrpack_path = temp_dir.join(&file_filename);
    atomic_write_str(&mrpack_path, &String::from_utf8_lossy(&bytes)).map_err(|e| e.to_string())?;
    
    // Import using existing mrpack importer
    let result = mrpack::MrPackImporter::import(&mrpack_path).map_err(|e| e.to_string())?;
    
    // Resolve mods
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
    
    // Save project
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
    
    // Clean up temp file
    let _ = std::fs::remove_file(&mrpack_path);
    
    Ok(final_result)
}
#[tauri::command]
pub async fn import_modrinth_mrpack(
    path: String,
    db: State<'_, Database>,
    intelligence: State<'_, ModIntelligence>,
) -> Result<ImportResult, String> {
    let path = PathBuf::from(path);
    let result = mrpack::MrPackImporter::import(&path).map_err(|e| e.to_string())?;
    
    // Get CurseForge API key from settings
    let curseforge_api_key = resolve_curseforge_api_key(&db)?;
    
    // Resolve mods
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
    
    // Save project
    db.create_project(&final_result.project).map_err(|e| e.to_string())?;
    
    // Save resolved mods
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
    
    // Try to parse quest configs from config files (FTB Quests, Better Questing, etc.)
    if final_result.quest_graph.is_none() && !final_result.config_files.is_empty() {
        eprintln!("[ModCanvas] Attempting to parse quest configs from {} config files", final_result.config_files.len());
        if let Ok(Some(quest_graph)) = quest_config::parse_all_quest_configs(&final_result.config_files) {
            // Save the parsed quest graph into the project workspace state dir
            let graph_path = crate::path_safety::quest_graph_path(&final_result.project.path)?;
            crate::path_safety::atomic_write_str(&graph_path, &serde_json::to_string_pretty(&quest_graph).map_err(|e| e.to_string())?)?;
            crate::quest_cache::put(&final_result.project.id.to_string(), &quest_graph);
            eprintln!("[ModCanvas] Parsed and saved quest graph from configs: {} nodes, {} edges", 
                quest_graph.nodes.len(), quest_graph.edges.len());
        }
    }
    
    Ok(final_result)
}
