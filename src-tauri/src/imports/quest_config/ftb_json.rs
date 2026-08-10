//! FTB Quests JSON variant parser (used when a config file parses as JSON
//! rather than SNBT).

use crate::imports::quest_config::{ParsedObjective, ParsedQuestData, ParsedQuestEdge, ParsedQuestNode, ParsedReward};
use anyhow::Result;
use uuid::Uuid;

pub(super) fn parse_ftb_quests_json(json: &serde_json::Value) -> Result<ParsedQuestData> {
    let mut nodes = Vec::new();
    let mut edges = Vec::new();
    
    // Handle various JSON structures
    if let Some(tasks) = json.get("tasks").and_then(|v| v.as_object()) {
        for (id, task) in tasks {
            let title = task.get("title").and_then(|v| v.as_str()).unwrap_or(id);
            let description = task.get("description").and_then(|v| v.as_str()).unwrap_or("");
            
            let mut objectives = Vec::new();
            if let Some(objects) = task.get("objects").and_then(|v| v.as_array()) {
                for obj in objects {
                    if let Some(obj_type) = obj.get("type").and_then(|v| v.as_str()) {
                        let target = obj.get("id").and_then(|v| v.as_str()).unwrap_or("");
                        let count = obj.get("count").and_then(|v| v.as_u64()).unwrap_or(1) as u32;
                        
                        objectives.push(ParsedObjective {
                            id: Uuid::new_v4().to_string(),
                            title: format!("{}: {}", obj_type, target),
                            objective_type: obj_type.to_string(),
                            target: target.to_string(),
                            count,
                            required: obj.get("required").and_then(|v| v.as_bool()).unwrap_or(true),
                        });
                    }
                }
            }
            
            let mut rewards = Vec::new();
            if let Some(rewards_arr) = task.get("rewards").and_then(|v| v.as_array()) {
                for reward in rewards_arr {
                    if let Some(r_type) = reward.get("type").and_then(|v| v.as_str()) {
                        let items: Vec<String> = reward.get("items")
                            .and_then(|v| v.as_array())
                            .map(|arr| arr.iter().filter_map(|v| v.as_str()).map(|s| s.to_string()).collect())
                            .unwrap_or_default();
                        
                        rewards.push(ParsedReward {
                            id: Uuid::new_v4().to_string(),
                            title: r_type.to_string(),
                            reward_type: r_type.to_string(),
                            items,
                            description: reward.get("description").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                        });
                    }
                }
            }
            
            nodes.push(ParsedQuestNode {
                id: id.clone(),
                title: title.to_string(),
                description: description.to_string(),
                node_type: task.get("type").and_then(|v| v.as_str()).unwrap_or("quest").to_string(),
                objectives,
                rewards,
                position: None,
                parent_chapter: task.get("parent").and_then(|v| v.as_str()).map(|s| s.to_string()),
            });
        }
    }
    
    // Parse dependencies/edges
    if let Some(dependencies) = json.get("dependencies").and_then(|v| v.as_object()) {
        for (from, to_list) in dependencies {
            if let Some(to_arr) = to_list.as_array() {
                for to in to_arr {
                    if let Some(to_id) = to.as_str() {
                        edges.push(ParsedQuestEdge {
                            from: from.clone(),
                            to: to_id.to_string(),
                            edge_type: "prerequisite".to_string(),
                        });
                    }
                }
            }
        }
    }
    
    Ok(ParsedQuestData { nodes, edges })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_ftb_quests_json() {
        let json = serde_json::json!({
            "tasks": {
                "task1": {
                    "title": "Get Diamonds",
                    "description": "Mine some diamonds",
                    "objects": [
                        {"type": "item", "id": "minecraft:diamond", "count": 5}
                    ],
                    "rewards": [
                        {"type": "item", "items": [{"id": "minecraft:diamond_block", "count": 1}]}
                    ]
                }
            }
        });
        
        let result = parse_ftb_quests_json(&json).unwrap();
        assert_eq!(result.nodes.len(), 1);
        assert_eq!(result.nodes[0].title, "Get Diamonds");
        assert_eq!(result.nodes[0].objectives.len(), 1);
    }
}
