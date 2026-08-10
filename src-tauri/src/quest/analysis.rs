use crate::quest::types::*;

struct QuestChain {
    name: String,
    nodes: Vec<QuestChainNode>,
}

struct QuestChainNode {
    label: String,
    description: String,
    node_type: QuestNodeType,
    objectives: Vec<QuestObjective>,
    rewards: Vec<QuestReward>,
}

pub fn analyze_quest_graph(graph: &QuestGraph) -> QuestAnalysis {
    let mut orphaned_quests = Vec::new();
    let mut incomplete_quests = Vec::new();
    let mut chapters = Vec::new();
    let mut issues = Vec::new();

    let total_quests = graph
        .nodes
        .iter()
        .filter(|n| matches!(n.node_type, QuestNodeType::Quest | QuestNodeType::SideQuest))
        .count();
    let total_chapters = graph
        .nodes
        .iter()
        .filter(|n| matches!(n.node_type, QuestNodeType::Chapter))
        .count();
    let total_objectives: usize = graph
        .nodes
        .iter()
        .filter(|n| matches!(n.node_type, QuestNodeType::Quest | QuestNodeType::SideQuest))
        .map(|n| n.objectives.len())
        .sum();
    let total_rewards: usize = graph
        .nodes
        .iter()
        .filter(|n| matches!(n.node_type, QuestNodeType::Quest | QuestNodeType::SideQuest))
        .map(|n| n.rewards.len())
        .sum();

    for node in &graph.nodes {
        if matches!(node.node_type, QuestNodeType::Quest | QuestNodeType::SideQuest) {
            let has_connection = graph
                .edges
                .iter()
                .any(|e| e.source == node.id || e.target == node.id);
            if !has_connection {
                orphaned_quests.push(OrphanedQuest {
                    quest_id: node.id.clone(),
                    quest_label: node.label.clone(),
                });
            }
        }
    }

    for node in &graph.nodes {
        if matches!(node.node_type, QuestNodeType::Quest | QuestNodeType::SideQuest) {
            let missing_obj = node.objectives.is_empty();
            let missing_rew = node.rewards.is_empty();
            if missing_obj || missing_rew {
                incomplete_quests.push(IncompleteQuest {
                    quest_id: node.id.clone(),
                    quest_label: node.label.clone(),
                    missing_objectives: node.objectives.len(),
                    missing_rewards: missing_rew,
                });
            }
        }
    }

    for node in &graph.nodes {
        if matches!(node.node_type, QuestNodeType::Chapter) {
            let quest_count = graph
                .edges
                .iter()
                .filter(|e| e.target == node.id)
                .filter(|e| {
                    graph
                        .nodes
                        .iter()
                        .any(|n| n.id == e.source && matches!(n.node_type, QuestNodeType::Quest | QuestNodeType::SideQuest))
                })
                .count();
            chapters.push(ChapterSummary {
                chapter_id: node.id.clone(),
                chapter_label: node.label.clone(),
                quest_count,
            });
        }
    }

    if !orphaned_quests.is_empty() {
        issues.push(QuestIssue {
            severity: "warning".to_string(),
            message: format!("{} orphaned quest(s) with no connections", orphaned_quests.len()),
            node_id: None,
        });
    }
    if !incomplete_quests.is_empty() {
        issues.push(QuestIssue {
            severity: "info".to_string(),
            message: format!(
                "{} incomplete quest(s) missing objectives or rewards",
                incomplete_quests.len()
            ),
            node_id: None,
        });
    }
    if graph.nodes.len() > 200 {
        issues.push(QuestIssue {
            severity: "info".to_string(),
            message: "Large quest graph may impact performance".to_string(),
            node_id: None,
        });
    }

    QuestAnalysis {
        total_quests,
        total_chapters,
        total_objectives,
        total_rewards,
        orphaned_quests,
        incomplete_quests,
        chapters,
        issues,
    }
}
