use tauri::State;

use crate::db::Database;
// ─── FTB Quests Import/Export ───────────────────────────────────────────────

#[tauri::command]
pub async fn import_ftb_quests_from_dir(pack_dir: String) -> Result<crate::imports::ftb_quests::FtBQuestsImportResult, String> {
    // SNBT parse of a large pack can take a moment; keep it off the main thread.
    tauri::async_runtime::spawn_blocking(move || {
        let path = std::path::Path::new(&pack_dir);
        crate::imports::ftb_quests::import_ftb_quests(path)
            .map_err(|e| format!("FTB Quests import failed: {}", e))
    })
    .await
    .map_err(|e| format!("FTB Quests import task failed: {e}"))?
}

#[tauri::command]
pub fn export_ftb_quests_to_dir(
    db: State<'_, Database>,
    project_id: String,
    output_dir: String,
) -> Result<(), String> {
    let graph = crate::commands::quest_graph::get_quest_graph(db, project_id)?;
    let path = std::path::Path::new(&output_dir);
    crate::imports::ftb_quests::export_ftb_quests_snbt(&graph, path, &std::collections::HashMap::new())
        .map_err(|e| format!("FTB Quests export failed: {}", e))
}
