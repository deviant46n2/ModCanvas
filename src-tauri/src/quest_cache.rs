use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};

use crate::quest::QuestGraph;

const CACHE_CAP: usize = 16;

static CACHE: OnceLock<Mutex<HashMap<String, QuestGraph>>> = OnceLock::new();

fn cache() -> &'static Mutex<HashMap<String, QuestGraph>> {
    CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

/// Legacy temp-mirror path (pre-`.modcanvas` layout). Used only to migrate an
/// existing working graph when a project has no workspace-state copy yet.
fn legacy_quests_path(project_id: &str) -> PathBuf {
    std::env::temp_dir()
        .join("modcanvas_configs")
        .join(project_id)
        .join("quests.json")
}

/// Migrate a legacy temp-mirror `quests.json` into the project workspace the
/// first time a project is opened after the layout change, so history and
/// working-graph state are not lost.
fn migrate_legacy(project_id: &str, graph_path: &Path) -> Result<(), String> {
    if graph_path.exists() {
        return Ok(());
    }
    let legacy = legacy_quests_path(project_id);
    if !legacy.exists() {
        return Ok(());
    }
    let content = std::fs::read_to_string(&legacy).map_err(|e| e.to_string())?;
    crate::path_safety::atomic_write_str(graph_path, &content)
}

/// Load a project's quest graph from the in-memory cache or disk.
///
/// `quests.json` can be tens of megabytes for large quest books, so re-reading
/// and re-parsing it on every command (tab open, node edits, analysis) is
/// wasteful. Writes must keep the cache in sync via [`put`] / [`invalidate`].
pub fn load(project_id: &str, graph_path: &Path) -> Result<QuestGraph, String> {
    {
        let guard = cache().lock().map_err(|e| e.to_string())?;
        if let Some(graph) = guard.get(project_id) {
            return Ok(graph.clone());
        }
    }

    migrate_legacy(project_id, graph_path)?;

    let graph = if graph_path.exists() {
        let content = std::fs::read_to_string(graph_path).map_err(|e| e.to_string())?;
        serde_json::from_str(&content).map_err(|e| e.to_string())?
    } else {
        QuestGraph::new(project_id, "New Questline")
    };

    if let Ok(mut guard) = cache().lock() {
        if guard.len() >= CACHE_CAP {
            guard.clear();
        }
        guard.insert(project_id.to_string(), graph.clone());
    }
    Ok(graph)
}

/// Refresh the cached copy after the graph has been written to disk.
pub fn put(project_id: &str, graph: &QuestGraph) {
    if let Ok(mut guard) = cache().lock() {
        guard.insert(project_id.to_string(), graph.clone());
    }
}

/// Drop the cached copy so the next read re-parses from disk.
pub fn invalidate(project_id: &str) {
    if let Ok(mut guard) = cache().lock() {
        guard.remove(project_id);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_path(pid: &str) -> PathBuf {
        std::env::temp_dir()
            .join("modcanvas_cache_test")
            .join(pid)
            .join("quests.json")
    }

    #[test]
    fn load_returns_fresh_graph_when_missing() {
        let pid = "quest-cache-test-missing";
        invalidate(pid);
        let path = test_path(pid);
        let _ = std::fs::remove_file(&path);
        let graph = load(pid, &path).expect("load should succeed for missing file");
        assert!(graph.nodes.is_empty());
        invalidate(pid);
    }

    #[test]
    fn put_then_load_is_a_cache_hit() {
        let pid = "quest-cache-test-roundtrip";
        invalidate(pid);

        let mut graph = QuestGraph::new(pid, "Cached Book");
        graph.nodes.push(crate::quest::QuestNode::default());
        put(pid, &graph);

        let cached = load(pid, &test_path(pid)).expect("load should hit the cache");
        assert_eq!(cached.nodes.len(), 1);
        assert_eq!(cached.name, "Cached Book");
    }

    #[test]
    fn invalidate_drops_cached_copy() {
        let pid = "quest-cache-test-invalidate";
        invalidate(pid);

        let graph = QuestGraph::new(pid, "Book");
        put(pid, &graph);
        invalidate(pid);

        let reloaded = load(pid, &test_path(pid)).expect("load should fall back to disk after invalidate");
        assert_ne!(reloaded.name, "Book");
        invalidate(pid);
    }

    #[test]
    fn load_reads_from_disk_after_invalidate() {
        let pid = "quest-cache-test-disk";
        invalidate(pid);
        let path = test_path(pid);
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).unwrap();
        }
        crate::path_safety::atomic_write_str(
            &path,
            r#"{"id":"g","project_id":"p","name":"Disk Book","description":"","nodes":[],"edges":[],"reward_tables":[],"chapters":[],"chapter_groups":[],"book_progression_mode":"default","book_icon":"","book_background_image":"","quest_color":"","default_quest_shape":"default","grid_scale":0.5,"default_reward_team":false,"default_consume_items":false,"default_autoclaim_rewards":"disabled","detection_delay":20}"#,
        )
        .unwrap();

        let graph = load(pid, &path).expect("load should read from disk");
        assert_eq!(graph.name, "Disk Book");

        let _ = std::fs::remove_file(&path);
        invalidate(pid);
    }

    #[test]
    fn load_migrates_legacy_temp_mirror() {
        let pid = "quest-cache-test-migrate";
        invalidate(pid);
        let path = test_path(pid);
        let _ = std::fs::remove_file(&path);

        let legacy = legacy_quests_path(pid);
        if let Some(parent) = legacy.parent() {
            std::fs::create_dir_all(parent).unwrap();
        }
        crate::path_safety::atomic_write_str(
            &legacy,
            r#"{"id":"g","project_id":"p","name":"Legacy Book","description":"","nodes":[],"edges":[],"reward_tables":[],"chapters":[],"chapter_groups":[],"book_progression_mode":"default","book_icon":"","book_background_image":"","quest_color":"","default_quest_shape":"default","grid_scale":0.5,"default_reward_team":false,"default_consume_items":false,"default_autoclaim_rewards":"disabled","detection_delay":20}"#,
        )
        .unwrap();

        let graph = load(pid, &path).expect("load should migrate legacy file");
        assert_eq!(graph.name, "Legacy Book");
        assert!(path.exists(), "legacy content should be copied to workspace state");

        let _ = std::fs::remove_file(&path);
        let _ = std::fs::remove_file(&legacy);
        invalidate(pid);
    }
}
