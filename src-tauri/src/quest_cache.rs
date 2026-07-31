use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};

use crate::quest::QuestGraph;

const CACHE_CAP: usize = 16;

static CACHE: OnceLock<Mutex<HashMap<String, QuestGraph>>> = OnceLock::new();

fn cache() -> &'static Mutex<HashMap<String, QuestGraph>> {
    CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

fn quests_path(project_id: &str) -> PathBuf {
    std::env::temp_dir()
        .join("modcanvas_configs")
        .join(project_id)
        .join("quests.json")
}

/// Load a project's quest graph from the in-memory cache or disk.
///
/// `quests.json` can be tens of megabytes for large quest books, so re-reading
/// and re-parsing it on every command (tab open, node edits, analysis) is
/// wasteful. Writes must keep the cache in sync via [`put`] / [`invalidate`].
pub fn load(project_id: &str) -> Result<QuestGraph, String> {
    {
        let guard = cache().lock().map_err(|e| e.to_string())?;
        if let Some(graph) = guard.get(project_id) {
            return Ok(graph.clone());
        }
    }

    let graph_path = quests_path(project_id);
    let graph = if graph_path.exists() {
        let content = std::fs::read_to_string(&graph_path).map_err(|e| e.to_string())?;
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

    #[test]
    fn load_returns_fresh_graph_when_missing() {
        let pid = "quest-cache-test-missing";
        invalidate(pid);
        let graph = load(pid).expect("load should succeed for missing file");
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

        let cached = load(pid).expect("load should hit the cache");
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

        let reloaded = load(pid).expect("load should fall back to disk after invalidate");
        assert_ne!(reloaded.name, "Book");
        invalidate(pid);
    }
}
