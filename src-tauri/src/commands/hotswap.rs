//! Hotswap reload evidence (P2-HOTSWAP, roadmap): the app pins the game log
//! position BEFORE broadcasting a reload, then verifies FTB's own reload
//! evidence line landed AFTER the pin. Never whole-log grep — the line fires
//! on every world load too, so an unpinned grep false-passes (s42 probe).
//! A reload without evidence is reported FAIL, never claimed.

use tauri::State;
use uuid::Uuid;

use crate::db::Database;
use crate::minecraft::InstanceManager;

#[derive(Debug, Clone, serde::Serialize)]
pub struct ReloadEvidence {
    pub passed: bool,
    /// The evidence line verbatim, when found.
    pub evidence: Option<String>,
    /// True when the log rotated/truncated between pin and verify — the
    /// check is inconclusive, retry instead of reporting PASS or FAIL.
    pub rotated: bool,
}

/// Pure: does the log tail contain FTB's reload evidence line?
pub fn contains_reload_evidence(tail: &str) -> bool {
    tail.contains("Loading quests from")
}

fn project_path(db: &Database, project_id: &str) -> Result<String, String> {
    let pid = Uuid::parse_str(project_id).map_err(|e| e.to_string())?;
    let project = db
        .get_project(&pid)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Project not found".to_string())?;
    Ok(project.path)
}

fn instance_id_for_project(manager: &InstanceManager, path: &str) -> Result<String, String> {
    manager
        .list_instances()
        .into_iter()
        .find(|i| i.game_dir == path)
        .map(|i| i.id)
        .ok_or_else(|| "No Prism instance found for this project".to_string())
}

/// Pin the game log position: call BEFORE broadcasting a reload.
#[tauri::command]
pub fn pin_reload_log(
    db: State<'_, Database>,
    manager: State<'_, InstanceManager>,
    project_id: String,
) -> Result<u64, String> {
    let path = project_path(&db, &project_id)?;
    let instance_id = instance_id_for_project(&manager, &path)?;
    manager.log_pin(&instance_id)
}

/// Verify the reload evidence landed after the pin. Call AFTER the broadcast
/// (and after a short settle window).
#[tauri::command]
pub fn verify_reload_log(
    db: State<'_, Database>,
    manager: State<'_, InstanceManager>,
    project_id: String,
    offset: u64,
) -> Result<ReloadEvidence, String> {
    let path = project_path(&db, &project_id)?;
    let instance_id = instance_id_for_project(&manager, &path)?;
    let (tail, rotated) = manager.read_log_since(&instance_id, offset)?;
    if rotated {
        return Ok(ReloadEvidence {
            passed: false,
            evidence: None,
            rotated: true,
        });
    }
    let evidence = tail
        .lines()
        .find(|l| contains_reload_evidence(l))
        .map(|s| s.to_string());
    Ok(ReloadEvidence {
        passed: evidence.is_some(),
        evidence,
        rotated: false,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn evidence_detected_in_real_log_line() {
        let line = "[11Aug2026 12:14:44.590] [Server thread/INFO] [FTB Quests/]: Loading quests from /home/deviant/.local/share/PrismLauncher/instances/Monster/minecraft/config/ftbquests/quests";
        assert!(contains_reload_evidence(line));
    }

    #[test]
    fn no_evidence_in_unrelated_tail() {
        assert!(!contains_reload_evidence("[11Aug2026 11:31:39.024] [Render thread/INFO] [KubeJS Client/]: Client resource reload complete!"));
        assert!(!contains_reload_evidence(""));
    }
}
