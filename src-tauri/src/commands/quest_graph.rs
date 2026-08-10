use tauri::State;
use uuid::Uuid;

use crate::db::Database;
use crate::quest::{QuestGraph, QuestAnalysis};

// ─── Quest Graph Commands ───────────────────────────────────────────────────

/// Resolve the project workspace working-graph path for a project id.
fn quest_graph_path_for(db: &Database, project_id: &str) -> Result<std::path::PathBuf, String> {
    let pid = Uuid::parse_str(project_id).map_err(|e| e.to_string())?;
    let project = db.get_project(&pid).map_err(|e| e.to_string())?
        .ok_or_else(|| "Project not found".to_string())?;
    crate::path_safety::quest_graph_path(&project.path)
}

#[tauri::command]
pub fn get_quest_graph(
    db: State<'_, Database>,
    project_id: String,
) -> Result<QuestGraph, String> {
    let path = quest_graph_path_for(&db, &project_id)?;
    crate::quest_cache::load(&project_id, &path)
}

#[tauri::command]
pub fn save_quest_graph(
    db: State<'_, Database>,
    project_id: String,
    graph: QuestGraph,
) -> Result<(), String> {
    let graph_path = quest_graph_path_for(&db, &project_id)?;
    let content = serde_json::to_string_pretty(&graph).map_err(|e| e.to_string())?;
    crate::path_safety::atomic_write_str(&graph_path, &content).map_err(|e| e.to_string())?;
    crate::quest_cache::put(&project_id, &graph);
    Ok(())
}

#[tauri::command]
pub fn analyze_quest_graph(
    db: State<'_, Database>,
    project_id: String,
) -> Result<QuestAnalysis, String> {
    let graph = get_quest_graph(db, project_id)?;
    Ok(crate::quest::analyze_quest_graph(&graph))
}
