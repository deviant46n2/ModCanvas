use tauri::State;
use uuid::Uuid;

use crate::behavior::store;
use crate::behavior::{Behavior, CompileOutput};
use crate::db::Database;

// ─── Behavior Commands (P2-BEHAVIOR) ────────────────────────────────────────

/// Resolve a project's workspace path from its id.
fn project_path_for(db: &Database, project_id: &str) -> Result<String, String> {
    let pid = Uuid::parse_str(project_id).map_err(|e| e.to_string())?;
    let project = db.get_project(&pid).map_err(|e| e.to_string())?
        .ok_or_else(|| "Project not found".to_string())?;
    Ok(project.path)
}

/// Load every behavior for a project. Missing file = empty list.
#[tauri::command]
pub fn list_behaviors(
    db: State<'_, Database>,
    project_id: String,
) -> Result<Vec<Behavior>, String> {
    let path = project_path_for(&db, &project_id)?;
    store::load_behaviors(&path)
}

/// Replace the entire behavior list for a project. Full-list semantics match
/// the quest-graph store: the frontend owns the working list and saves it
/// wholesale; partial authoring is always saveable (no validation on save —
/// that is the compiler's and Pack Index's job, surfaced, never a blocker).
#[tauri::command]
pub fn save_behaviors(
    db: State<'_, Database>,
    project_id: String,
    behaviors: Vec<Behavior>,
) -> Result<(), String> {
    let path = project_path_for(&db, &project_id)?;
    store::save_behaviors(&path, &behaviors)
}

/// Compile one behavior to KubeJS for preview — never saves. The UI calls
/// this on edit to show warnings/errors without writing; the disk file is
/// only touched by save_behaviors.
#[tauri::command]
pub fn compile_behavior(behavior: Behavior) -> CompileOutput {
    CompileOutput::from_behavior(&behavior)
}
