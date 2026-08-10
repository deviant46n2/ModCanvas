// Durable history journal path resolution under a cache base. Split from
// path_safety.rs so the module stays within the 300-line ceiling.

use std::path::{Path, PathBuf};
use uuid::Uuid;

/// Resolve the durable history journal for a project, scoped under a given
/// cache base (`<base>/history/<project-id>/journal.jsonl`). Rejects anything
/// that is not a valid project id (defense against traversal via the id), and
/// creates the journal directory if missing. Exposed with an injectable base so
/// tests can target a tempdir without touching the real cache.
pub fn history_journal_path_in(base: &Path, project_id: &str) -> Result<PathBuf, String> {
    let pid = Uuid::parse_str(project_id)
        .map_err(|_| "History journal requires a valid project id".to_string())?;
    let dir = base.join("history").join(pid.to_string());
    std::fs::create_dir_all(&dir)
        .map_err(|e| format!("Failed to create history directory: {e}"))?;
    Ok(dir.join("journal.jsonl"))
}

/// Resolve the durable history journal path under the app cache dir.
pub fn history_journal_path(project_id: &str) -> Result<PathBuf, String> {
    let base = crate::instance_textures::dirs_cache_dir()
        .unwrap_or_else(|| std::env::temp_dir().join("modcanvas_cache"));
    history_journal_path_in(&base, project_id)
}

#[cfg(test)]
mod tests {
    use super::super::atomic_write_str;
    use super::*;
    #[test]
    fn test_history_journal_path_is_scoped_and_created() {
        let tmp = tempfile::tempdir().unwrap();
        let pid = uuid::Uuid::new_v4().to_string();

        let path = history_journal_path_in(tmp.path(), &pid).unwrap();
        assert!(path.ends_with("journal.jsonl"));
        let dir = path.parent().unwrap();
        assert_eq!(dir.file_name().unwrap(), pid.as_str());
        assert!(dir.starts_with(tmp.path().join("history")));
        assert!(dir.exists(), "history dir should be created");
    }

    #[test]
    fn test_history_journal_rejects_invalid_project_id() {
        let tmp = tempfile::tempdir().unwrap();
        assert!(history_journal_path_in(tmp.path(), "../escape").is_err());
        assert!(history_journal_path_in(tmp.path(), "not-a-uuid").is_err());
        assert!(history_journal_path_in(tmp.path(), "").is_err());
    }

    #[test]
    fn test_history_journal_round_trip_via_atomic_write() {
        let tmp = tempfile::tempdir().unwrap();
        let pid = uuid::Uuid::new_v4().to_string();
        let path = history_journal_path_in(tmp.path(), &pid).unwrap();

        atomic_write_str(&path, "{\"id\":1}\n{\"id\":2}\n").unwrap();
        let content = std::fs::read_to_string(&path).unwrap();
        assert_eq!(content, "{\"id\":1}\n{\"id\":2}\n");
    }
}
