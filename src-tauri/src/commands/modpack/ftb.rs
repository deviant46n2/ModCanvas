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
    let graph = crate::commands::quest_graph::get_quest_graph(db.clone(), project_id.clone())?;

    // Version-aware layout (P2 s42): for 1.21.x the export MUST write
    // FlatChapters (quests/chapters/*.snbt) — the only layout FTB Quests
    // 1.21 reads (verified in the 2101.1.30 jar). A graph whose layout says
    // "Subdirs" records what the pack directory contained, not what the game
    // can load; forcing the version-correct layout migrates such packs to
    // something visible in-game.
    let layout_override = {
        let pid = uuid::Uuid::parse_str(&project_id).map_err(|e| e.to_string())?;
        let project = db
            .get_project(&pid)
            .map_err(|e| e.to_string())?
            .ok_or_else(|| "Project not found".to_string())?;
        crate::imports::ftb_quests::layout_for_version(&project.minecraft_version)
    };

    let path = std::path::Path::new(&output_dir);
    crate::imports::ftb_quests::export_ftb_quests_snbt_for_layout(
        &graph,
        path,
        &std::collections::HashMap::new(),
        layout_override,
    )
    .map_err(|e| format!("FTB Quests export failed: {}", e))
}
