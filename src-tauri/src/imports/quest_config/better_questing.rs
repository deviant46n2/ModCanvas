//! Better Questing config parsing (JSON), producing the shared
//! `ParsedQuestData` model.

use crate::imports::quest_config::{ParsedObjective, ParsedQuestData, ParsedQuestEdge, ParsedQuestNode, ParsedReward};
use crate::imports::ConfigFile;
use anyhow::Result;
use uuid::Uuid;

/// Parse Better Questing config files
pub fn parse_better_questing(config_files: &[ConfigFile]) -> Result<Option<ParsedQuestData>> {
    let bq_files: Vec<&ConfigFile> = config_files.iter()
        .filter(|f| f.path.to_string_lossy().contains("betterquesting"))
        .collect();
    
    if bq_files.is_empty() {
        return Ok(None);
    }
    
    let mut nodes = Vec::new();
    let mut edges = Vec::new();
    
    for file in bq_files {
        if file.path.to_string_lossy().contains("quests") || file.path.to_string_lossy().contains("quest") {
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(&file.content) {
                let parsed = parse_bq_quests_json(&json)?;
                nodes.extend(parsed.nodes);
                edges.extend(parsed.edges);
            }
        }
    }
    
    if nodes.is_empty() {
        return Ok(None);
    }
    
    Ok(Some(ParsedQuestData { nodes, edges }))
}

fn parse_bq_quests_json(json: &serde_json::Value) -> Result<ParsedQuestData> {
    let mut nodes = Vec::new();
    let mut edges = Vec::new();
    
    // Better Questing format
    if let Some(quests) = json.get("quests").and_then(|v| v.as_object()) {
        for (id, quest) in quests {
            let title = quest.get("name").and_then(|v| v.as_str()).unwrap_or(id);
            let description = quest.get("description").and_then(|v| v.as_str()).unwrap_or("");
            
            let mut objectives = Vec::new();
            if let Some(tasks) = quest.get("tasks").and_then(|v| v.as_array()) {
                for (idx, task) in tasks.iter().enumerate() {
                    let task_type = task.get("task").and_then(|v| v.as_str()).unwrap_or("retrieval");
                    let target = task.get("item").and_then(|v| v.as_str()).unwrap_or("");
                    let count = task.get("count").and_then(|v| v.as_u64()).unwrap_or(1) as u32;
                    
                    objectives.push(ParsedObjective {
                        id: format!("{}_task_{}", id, idx),
                        title: format!("{}: {}", task_type, target),
                        objective_type: task_type.to_string(),
                        target: target.to_string(),
                        count,
                        required: true,
                    });
                }
            }
            
            let mut rewards = Vec::new();
            if let Some(reward_bags) = quest.get("rewards").and_then(|v| v.as_array()) {
                for bag in reward_bags {
                    if let Some(items) = bag.get("rewards").and_then(|v| v.as_array()) {
                        for item in items {
                            let item_id = item.get("id").and_then(|v| v.as_str()).unwrap_or("");
                            let count = item.get("count").and_then(|v| v.as_u64()).unwrap_or(1);
                            
                            rewards.push(ParsedReward {
                                id: Uuid::new_v4().to_string(),
                                title: format!("Reward: {}", item_id),
                                reward_type: "item".to_string(),
                                items: vec![format!("{}x{}", count, item_id)],
                                description: "Quest reward".to_string(),
                            });
                        }
                    }
                }
            }
            
            nodes.push(ParsedQuestNode {
                id: id.clone(),
                title: title.to_string(),
                description: description.to_string(),
                node_type: "quest".to_string(),
                objectives,
                rewards,
                position: None,
                parent_chapter: quest.get("parent").and_then(|v| v.as_str()).map(|s| s.to_string()),
            });
            
            // Parse dependencies
            if let Some(pre_reqs) = quest.get("preRequisites").and_then(|v| v.as_array()) {
                for pre in pre_reqs {
                    if let Some(pre_id) = pre.as_str() {
                        edges.push(ParsedQuestEdge {
                            from: pre_id.to_string(),
                            to: id.clone(),
                            edge_type: "prerequisite".to_string(),
                        });
                    }
                }
            }
        }
    }
    
    Ok(ParsedQuestData { nodes, edges })
}
