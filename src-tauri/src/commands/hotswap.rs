//! Hotswap reload evidence (P2-HOTSWAP, roadmap): the app pins the game log
//! position BEFORE broadcasting a reload, then verifies the reload's own
//! evidence line(s) landed AFTER the pin. Never whole-log grep — the lines
//! fire on every world load too, so an unpinned grep false-passes (s42
//! probe). A reload without evidence is reported FAIL, never claimed.
//!
//! Evidence shapes are PER-TYPE (s44 — verified against the shipped KubeJS
//! jar, 2101.7.2-build.368, and the instance's own latest.log):
//! - Quests: FTB's "Loading quests from" line (single line, s42).
//! - KubeJS: TWO lines must land after the pin — the script reload
//!   ("Loaded N/N KubeJS server scripts in ...") AND the datapack apply
//!   ("Server resource reload complete!"). The two-command sequence
//!   (kubejs reload server-scripts + vanilla /reload) emits both; one
//!   without the other means the reload did not fully apply.

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

/// Which reload's evidence shape to check.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ReloadKind {
    Quests,
    KubeJs,
}

impl ReloadKind {
    pub fn parse(s: &str) -> Option<Self> {
        match s {
            "quests" => Some(Self::Quests),
            "kubejs" => Some(Self::KubeJs),
            _ => None,
        }
    }
}

/// Pure: does the log tail contain the reload kind's evidence line(s)?
/// Quests needs one line; KubeJS needs BOTH (script reload + datapack apply).
pub fn contains_reload_evidence(tail: &str, kind: ReloadKind) -> bool {
    match kind {
        ReloadKind::Quests => tail.contains("Loading quests from"),
        ReloadKind::KubeJs => {
            tail.contains("KubeJS server scripts in") && tail.contains("Server resource reload complete!")
        }
    }
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
/// (and after a short settle window). `kind` selects the evidence shape:
/// "quests" or "kubejs".
#[tauri::command]
pub fn verify_reload_log(
    db: State<'_, Database>,
    manager: State<'_, InstanceManager>,
    project_id: String,
    offset: u64,
    kind: String,
) -> Result<ReloadEvidence, String> {
    let kind = ReloadKind::parse(&kind).ok_or_else(|| {
        format!("Unknown reload kind '{kind}' (expected 'quests' or 'kubejs')")
    })?;
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
    let passed = contains_reload_evidence(&tail, kind);
    // Evidence capture: a representative matching line for the report. Per-line
    // for Quests (single line). For KubeJS the PASS is a whole-tail property
    // (both lines); capture the script-reload line as the representative
    // evidence, since the datapack-apply line is shared with world load.
    let evidence = tail.lines().find(|l| match kind {
        ReloadKind::Quests => l.contains("Loading quests from"),
        ReloadKind::KubeJs => l.contains("KubeJS server scripts in"),
    });
    Ok(ReloadEvidence {
        passed,
        evidence: evidence.map(|s| s.to_string()),
        rotated: false,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn evidence_detected_in_real_log_line() {
        let line = "[11Aug2026 12:14:44.590] [Server thread/INFO] [FTB Quests/]: Loading quests from /home/deviant/.local/share/PrismLauncher/instances/Monster/minecraft/config/ftbquests/quests";
        assert!(contains_reload_evidence(line, ReloadKind::Quests));
    }

    #[test]
    fn no_evidence_in_unrelated_tail() {
        assert!(!contains_reload_evidence(
            "[11Aug2026 11:31:39.024] [Render thread/INFO] [KubeJS Client/]: Client resource reload complete!",
            ReloadKind::Quests,
        ));
        assert!(!contains_reload_evidence("", ReloadKind::Quests));
        assert!(!contains_reload_evidence("", ReloadKind::KubeJs));
    }

    #[test]
    fn kubejs_evidence_requires_both_lines() {
        let script_only = "[11Aug2026 16:15:37.539] [Render thread/INFO] [KubeJS Server/]: Loaded 1/1 KubeJS server scripts in 0.008 s with 0 errors and 0 warnings";
        assert!(!contains_reload_evidence(script_only, ReloadKind::KubeJs));
        let apply_only = "[11Aug2026 16:15:38.828] [Server thread/INFO] [KubeJS Server/]: Server resource reload complete!";
        assert!(!contains_reload_evidence(apply_only, ReloadKind::KubeJs));
        let both = format!("{script_only}\n{apply_only}");
        assert!(contains_reload_evidence(&both, ReloadKind::KubeJs));
    }

    #[test]
    fn kubejs_lines_do_not_false_pass_quest_kind() {
        let kubejs_tail = "[11Aug2026 16:15:37.539] [Render thread/INFO] [KubeJS Server/]: Loaded 1/1 KubeJS server scripts in 0.008 s with 0 errors and 0 warnings\n[11Aug2026 16:15:38.828] [Server thread/INFO] [KubeJS Server/]: Server resource reload complete!";
        assert!(!contains_reload_evidence(kubejs_tail, ReloadKind::Quests));
    }

    #[test]
    fn kind_parsing() {
        assert_eq!(ReloadKind::parse("quests"), Some(ReloadKind::Quests));
        assert_eq!(ReloadKind::parse("kubejs"), Some(ReloadKind::KubeJs));
        assert_eq!(ReloadKind::parse("config"), None);
    }
}
