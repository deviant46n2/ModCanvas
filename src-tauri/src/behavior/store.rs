//! Behavior persistence: `.modcanvas/behaviors.json` (P2-BEHAVIOR, roadmap
//! §14.4 — new working states follow the `.modcanvas/` private-state pattern).
//!
//! Dumb persistence by design: full-list read/write, no validation on save.
//! A partially-authored behavior (empty actions, a mid-edit trigger) MUST be
//! saveable — validation is the compiler's job (`compile.rs`) and the Pack
//! Index's job (later), surfaced to the user, never a save blocker. The file
//! is ModCanvas private state: the compiled KubeJS is the ecosystem artifact;
//! this JSON is the authoring source, never shipped into the pack.

use crate::path_safety::atomic_write_str;

use super::Behavior;

/// Resolve the behaviors file for a project workspace.
pub fn behaviors_path(project_path: &str) -> Result<std::path::PathBuf, String> {
    crate::path_safety::state_file_path(project_path, "behaviors.json")
}

/// Load all behaviors for a project. A missing file is an empty list (never
/// an error) — the file appears on the first save.
pub fn load_behaviors(project_path: &str) -> Result<Vec<Behavior>, String> {
    let path = behaviors_path(project_path)?;
    if !path.exists() {
        return Ok(Vec::new());
    }
    let raw = std::fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read {}: {e}", path.display()))?;
    serde_json::from_str(&raw)
        .map_err(|e| format!("Failed to parse {}: {e}", path.display()))
}

/// Replace the entire behavior list for a project. Atomic write (tmp + rename,
/// EBUSY retry on Windows) — a crash never leaves a zero-byte file.
pub fn save_behaviors(project_path: &str, behaviors: &[Behavior]) -> Result<(), String> {
    let path = behaviors_path(project_path)?;
    let content = serde_json::to_string_pretty(behaviors)
        .map_err(|e| format!("Failed to serialize behaviors: {e}"))?;
    atomic_write_str(&path, &content)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::behavior::{Action, Backend, Trigger};

    fn kit() -> Behavior {
        Behavior {
            id: "starter:kit".to_string(),
            name: "Starter Kit".to_string(),
            backend: Backend::Kubejs,
            trigger: Trigger::PlayerJoinsGame,
            conditions: vec![],
            actions: vec![Action::GiveItem {
                item: "minecraft:diamond".to_string(),
                count: 1,
            }],
        }
    }

    #[test]
    fn missing_file_loads_empty() {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path().to_string_lossy().to_string();
        let loaded = load_behaviors(&root).unwrap();
        assert!(loaded.is_empty());
    }

    #[test]
    fn save_then_load_round_trips() {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path().to_string_lossy().to_string();

        let behaviors = vec![kit()];
        save_behaviors(&root, &behaviors).unwrap();

        let loaded = load_behaviors(&root).unwrap();
        assert_eq!(loaded, behaviors);
        assert_eq!(loaded[0].name, "Starter Kit");
    }

    #[test]
    fn save_is_atomic_no_tmp_left() {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path().to_string_lossy().to_string();

        save_behaviors(&root, &[kit()]).unwrap();
        let path = behaviors_path(&root).unwrap();
        assert!(path.exists());
        assert!(
            !std::fs::read_dir(path.parent().unwrap())
                .unwrap()
                .any(|e| e.unwrap().file_name().to_string_lossy().ends_with(".tmp")),
            "no tmp file may remain after an atomic write"
        );
    }

    #[test]
    fn save_overwrites_previous_list() {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path().to_string_lossy().to_string();

        save_behaviors(&root, &[kit()]).unwrap();
        save_behaviors(&root, &[]).unwrap();

        let loaded = load_behaviors(&root).unwrap();
        assert!(loaded.is_empty(), "a full-list save replaces the previous list");
    }

    #[test]
    fn nonexistent_project_root_is_an_error() {
        let tmp = tempfile::tempdir().unwrap();
        let missing = tmp.path().join("nope").to_string_lossy().to_string();
        assert!(load_behaviors(&missing).is_err());
        assert!(save_behaviors(&missing, &[]).is_err());
    }
}
