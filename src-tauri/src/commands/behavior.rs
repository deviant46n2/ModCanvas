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

/// What a behavior save produced: the IR was persisted, and the emission
/// step either shipped every behavior or reports which ones did not compile
/// (with reasons). The UI must surface `emit_failures` honestly — a saved
/// behavior that never reached the game is a silent failure otherwise.
#[derive(serde::Serialize)]
pub struct SaveBehaviorsOutcome {
    /// Behaviors that did NOT emit (`id: reason`). Empty = all shipped.
    pub emit_failures: Vec<String>,
}

/// Replace the entire behavior list for a project, then compile + write the
/// emitted script into the instance's KubeJS scripts dir. Full-list
/// semantics match the quest-graph store: the frontend owns the working list
/// and saves it wholesale; partial authoring is always saveable (the IR save
/// never blocks on validation), but the emission result tells the user
/// exactly which behaviors did not ship and why.
#[tauri::command]
pub fn save_behaviors(
    db: State<'_, Database>,
    project_id: String,
    behaviors: Vec<Behavior>,
) -> Result<SaveBehaviorsOutcome, String> {
    let path = project_path_for(&db, &project_id)?;
    store::save_behaviors(&path, &behaviors)?;
    let emit_failures = crate::behavior::emit::emit_behavior_scripts(&path, &behaviors)?;
    Ok(SaveBehaviorsOutcome { emit_failures })
}

/// Compile one behavior to KubeJS for preview — never saves. The UI calls
/// this on edit to show warnings/errors without writing; the disk file is
/// only touched by save_behaviors.
#[tauri::command]
pub fn compile_behavior(behavior: Behavior) -> CompileOutput {
    CompileOutput::from_behavior(&behavior)
}
