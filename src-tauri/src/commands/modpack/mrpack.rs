use tauri::State;
use uuid::Uuid;
use std::path::PathBuf;

use crate::db::Database;
use crate::imports::{ImportResult, mrpack, quest_config, resolution};
use crate::mod_intelligence::ModIntelligence;
use crate::models::*;

use super::{load_quest_from_pack, resolve_curseforge_api_key};

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
