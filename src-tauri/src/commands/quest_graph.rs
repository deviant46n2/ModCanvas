use tauri::State;
use uuid::Uuid;

use crate::db::Database;
use crate::quest::{QuestGraph, QuestAnalysis, QuestNode, QuestEdge};

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
pub fn add_quest_node(
    db: State<'_, Database>,
    project_id: String,
    node_type: String,
    label: String,
    x: f64,
    y: f64,
) -> Result<QuestNode, String> {
    let mut graph = get_quest_graph(db.clone(), project_id.clone())?;

    let node = QuestNode {
        id: uuid::Uuid::new_v4().to_string(),
        node_type: crate::quest::QuestNodeType::from_string(&node_type),
        label,
        position: crate::quest::Position { x, y },
        ..Default::default()
    };

    graph.nodes.push(node.clone());
    save_quest_graph(db, project_id, graph)?;
    Ok(node)
}

#[tauri::command]
pub fn update_quest_node(
    db: State<'_, Database>,
    project_id: String,
    node: QuestNode,
) -> Result<(), String> {
    let mut graph = get_quest_graph(db.clone(), project_id.clone())?;

    if let Some(existing) = graph.nodes.iter_mut().find(|n| n.id == node.id) {
        *existing = node;
    } else {
        graph.nodes.push(node);
    }

    save_quest_graph(db, project_id, graph)
}

#[tauri::command]
pub fn delete_quest_node(
    db: State<'_, Database>,
    project_id: String,
    node_id: String,
) -> Result<(), String> {
    let mut graph = get_quest_graph(db.clone(), project_id.clone())?;
    graph.nodes.retain(|n| n.id != node_id);
    graph.edges.retain(|e| e.source != node_id && e.target != node_id);
    save_quest_graph(db, project_id, graph)
}

#[tauri::command]
pub fn add_quest_edge(
    db: State<'_, Database>,
    project_id: String,
    source: String,
    target: String,
    edge_type: String,
) -> Result<QuestEdge, String> {
    let mut graph = get_quest_graph(db.clone(), project_id.clone())?;

    let edge = QuestEdge {
        id: uuid::Uuid::new_v4().to_string(),
        source,
        target,
        label: None,
        edge_type: crate::quest::EdgeType::from_string(&edge_type),
        ..Default::default()
    };

    graph.edges.push(edge.clone());
    save_quest_graph(db, project_id, graph)?;
    Ok(edge)
}

#[tauri::command]
pub fn delete_quest_edge(
    db: State<'_, Database>,
    project_id: String,
    edge_id: String,
) -> Result<(), String> {
    let mut graph = get_quest_graph(db.clone(), project_id.clone())?;
    graph.edges.retain(|e| e.id != edge_id);
    save_quest_graph(db, project_id, graph)
}

#[tauri::command]
pub fn analyze_quest_graph(
    db: State<'_, Database>,
    project_id: String,
) -> Result<QuestAnalysis, String> {
    let graph = get_quest_graph(db, project_id)?;
    Ok(crate::quest::analyze_quest_graph(&graph))
}

#[tauri::command]
pub fn auto_generate_quest(
    project_id: String,
    db: State<'_, Database>,
) -> Result<QuestGraph, String> {
    let pid = Uuid::parse_str(&project_id).map_err(|e| e.to_string())?;

    // Get all mods from the project
    let mods = db.get_project_mods(&pid).map_err(|e| e.to_string())?;

    // Convert to (mod_id, slug, mod_name) tuples
    let mod_list: Vec<(String, String, String)> = mods
        .iter()
        .map(|m| (m.mod_id.clone(), m.slug.clone(), m.name.clone()))
        .collect();

    eprintln!(
        "[ModCanvas] Loading questline from pack for {} mods",
        mod_list.len()
    );

    // Generate the quest graph
    let graph = crate::quest::auto_generate_quest(&project_id, &mod_list);

    // Save it
    save_quest_graph(db, project_id, graph.clone())?;

    Ok(graph)
}

#[tauri::command]
pub fn write_quest_graph_to_instance(
    project_id: String,
    db: State<'_, Database>,
) -> Result<(), String> {
    let pid = Uuid::parse_str(&project_id).map_err(|e| e.to_string())?;

    // Get the project to find the instance path
    let project = db.get_project(&pid).map_err(|e| e.to_string())?
        .ok_or_else(|| "Project not found".to_string())?;

    let instance_path = std::path::PathBuf::from(&project.path);
    let quests_dir = instance_path.join("config").join("ftbquests").join("quests");

    // Get the quest graph from database
    let graph = get_quest_graph(db.clone(), project_id.clone())?;

    // Export to SNBT files in the instance. Pass the instance root (not the
    // quests dir) — the exporter appends config/ftbquests/quests itself.
    crate::imports::ftb_quests::export::export_ftb_quests_snbt(&graph, &instance_path, &std::collections::HashMap::new())
        .map_err(|e| format!("Failed to export quest SNBT: {}", e))?;

    eprintln!("[ModCanvas] Wrote quest graph to SNBT files at {:?}", quests_dir);
    Ok(())
}
