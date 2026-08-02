// Durable history journal IPC: read/write the app-wide undo/redo journal for a
// project. This is the I/O driver half of the pack history system; the pure
// ordering/coalescing logic lives in the frontend `core/history` module, which
// emits the JSON-lines content this command persists atomically.

use crate::path_safety;

/// Read the durable history journal for a project. Returns an empty string when
/// the project has no history yet (first run).
#[tauri::command]
pub fn read_history_journal(project_id: String) -> Result<String, String> {
    let path = path_safety::history_journal_path(&project_id)?;
    if !path.exists() {
        return Ok(String::new());
    }
    std::fs::read_to_string(&path).map_err(|e| e.to_string())
}

/// Persist the history journal for a project. Content is expected to be the
/// JSON-lines snapshot produced by the frontend history store; it is written
/// atomically so a crash mid-write can never corrupt the durable log.
#[tauri::command]
pub fn write_history_journal(project_id: String, content: String) -> Result<(), String> {
    let path = path_safety::history_journal_path(&project_id)?;
    path_safety::atomic_write_str(&path, &content).map_err(|e| e.to_string())
}
