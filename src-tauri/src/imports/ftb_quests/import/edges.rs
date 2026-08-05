use super::super::types::{FtBQuestsImportResult, ImportIssue, IssueSeverity, IssueCategory};
use crate::quest::*;
use uuid::Uuid;

// ─── Dependency Edge Building ──────────────────────────────────────────────

/// Build dependency edges from the _dependencies data field stored on each node
pub(super) fn build_dependency_edges(graph: &mut QuestGraph, result: &mut FtBQuestsImportResult) -> usize {
    let node_ids: Vec<String> = graph.nodes.iter().map(|n| n.id.clone()).collect();
    let mut resolved = 0;

    for node in &graph.nodes {
        if let Some(deps_str) = node.data.get("_dependencies") {
            for dep_id in deps_str.split(',') {
                let dep_id = dep_id.trim().to_string();
                if dep_id.is_empty() { continue; }
                // The dep_id might be the SNBT key or the actual quest ID
                // Try to find a matching node
                let target_id = if node_ids.contains(&dep_id) {
                    dep_id
                } else {
                    // Try to find by partial match
                    match graph.nodes.iter().find(|n| n.id.contains(&dep_id) || dep_id.contains(&n.id)) {
                        Some(found) => found.id.clone(),
                        None => {
                            result.issues.push(ImportIssue {
                                severity: IssueSeverity::Warning,
                                category: IssueCategory::MissingDependency,
                                message: format!("Quest '{}' depends on missing quest '{}'", node.label, dep_id),
                                file: None,
                                node_id: Some(node.id.clone()),
                            });
                            continue;
                        }
                    }
                };

                graph.edges.push(QuestEdge {
                    id: Uuid::new_v4().to_string(),
                    source: target_id,
                    target: node.id.clone(),
                    label: None,
                    edge_type: EdgeType::Prerequisite,
                    inverted: false,
                    ..Default::default()
                });
                resolved += 1;
            }
        }
    }

    // Remove the temporary _dependencies data from nodes
    for node in &mut graph.nodes {
        node.data.remove("_dependencies");
    }

    resolved
}
