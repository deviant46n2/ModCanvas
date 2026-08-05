use tauri::State;
use uuid::Uuid;
use std::path::PathBuf;

use crate::db::Database;
use crate::imports::{ImportResult, packwiz, resolution};
use crate::mod_intelligence::ModIntelligence;
use crate::models::*;

use super::{load_progression_from_pack, load_quest_from_pack, resolve_curseforge_api_key, try_deploy_companion};
#[tauri::command]
pub async fn import_packwiz(
    path: String,
    db: State<'_, Database>,
    intelligence: State<'_, ModIntelligence>,
) -> Result<ImportResult, String> {
    let path = PathBuf::from(path);
    let result = packwiz::PackwizImporter::import(&path).map_err(|e| e.to_string())?;
    
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
        };
        db.add_mod(&entry).map_err(|e| e.to_string())?;
    }
    
    // Load progression graph from pack if exists
    if let Some(ref graph) = final_result.progression_graph {
        load_progression_from_pack(&final_result.project.id.to_string(), &PathBuf::from(&final_result.project.path))?;
        eprintln!("[ModCanvas] Loaded progression graph from pack: {} nodes", graph.nodes.len());
    }
    
    // Load quest graph from pack if exists
    if let Some(ref graph) = final_result.quest_graph {
        load_quest_from_pack(&final_result.project.id.to_string(), &PathBuf::from(&final_result.project.path))?;
        eprintln!("[ModCanvas] Loaded quest graph from pack: {} nodes", graph.nodes.len());
    }
    
    Ok(final_result)
}
