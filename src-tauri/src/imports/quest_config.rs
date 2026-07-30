use crate::imports::{ConfigFile, snbt::{SnbtValue, CommentedSnbt, parse_snbt}};
use crate::quest::{QuestGraph, QuestNode, QuestEdge, QuestObjective, QuestReward, QuestNodeType, ObjectiveType, RewardType, EdgeType, Position};
use crate::progression::ProgressionGraph;
use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use uuid::Uuid;

/// Parsed quest data from various quest mod formats
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParsedQuestData {
    pub nodes: Vec<ParsedQuestNode>,
    pub edges: Vec<ParsedQuestEdge>,
}

/// A quest node parsed from config
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParsedQuestNode {
    pub id: String,
    pub title: String,
    pub description: String,
    pub node_type: String,
    pub objectives: Vec<ParsedObjective>,
    pub rewards: Vec<ParsedReward>,
    pub position: Option<Position>,
    pub parent_chapter: Option<String>,
}

/// A quest edge parsed from config
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParsedQuestEdge {
    pub from: String,
    pub to: String,
    pub edge_type: String,
}

/// Parsed objective
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParsedObjective {
    pub id: String,
    pub title: String,
    pub objective_type: String,
    pub target: String,
    pub count: u32,
    pub required: bool,
}

/// Parsed reward
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParsedReward {
    pub id: String,
    pub title: String,
    pub reward_type: String,
    pub items: Vec<String>,
    pub description: String,
}

/// Parse FTB Quests config files
pub fn parse_ftb_quests(config_files: &[ConfigFile]) -> Result<Option<ParsedQuestData>> {
    let quest_files: Vec<&ConfigFile> = config_files.iter()
        .filter(|f| f.path.to_string_lossy().contains("ftbquests"))
        .collect();
    
    if quest_files.is_empty() {
        return Ok(None);
    }
    
    // FTB Quests uses SNBT format - parse the main chapters file
    let chapters_file = quest_files.iter().find(|f| 
        f.path.to_string_lossy().contains("chapters") || f.path.to_string_lossy().contains("chapter")
    );
    
    let tasks_files: Vec<&ConfigFile> = quest_files.iter()
        .filter(|f| f.path.to_string_lossy().contains("tasks") || f.path.to_string_lossy().contains("quest"))
        .cloned()
        .collect();
    
    let mut nodes = Vec::new();
    let mut edges = Vec::new();
    
    // Parse chapters
    if let Some(chapters) = chapters_file {
        let parsed = parse_ftb_quests_snbt(&chapters.content)?;
        nodes.extend(parsed.nodes);
        edges.extend(parsed.edges);
    }
    
    // Parse tasks/quests
    for task_file in tasks_files {
        let parsed = parse_ftb_quests_snbt(&task_file.content)?;
        nodes.extend(parsed.nodes);
        edges.extend(parsed.edges);
    }
    
    Ok(Some(ParsedQuestData { nodes, edges }))
}

/// Parse SNBT format (FTB Quotes, FTB Quests, etc.)
fn parse_ftb_quests_snbt(content: &str) -> Result<ParsedQuestData> {
    let mut nodes = Vec::new();
    let mut edges = Vec::new();
    
    // Try to parse as JSON first (some configs are JSON)
    if let Ok(json) = serde_json::from_str::<serde_json::Value>(content) {
        return parse_ftb_quests_json(&json);
    }
    
    // Parse as SNBT using proper parser
    let snbt = match parse_snbt(content) {
        Ok(v) => v,
        Err(e) => {
            eprintln!("[ModCanvas] Failed to parse SNBT: {}", e);
            return Ok(ParsedQuestData { nodes, edges });
        }
    };
    
    // FTB Quests SNBT has quests as top-level keys like "quest:id" { ... }
    // or nested under chapters/ directory structure
    let compound_maps: Vec<&HashMap<String, CommentedSnbt>> = match &snbt.value {
        SnbtValue::Compound(m) => vec![m],
        SnbtValue::List(items) => {
            items.iter().filter_map(|v| v.as_compound()).collect()
        }
        _ => vec![],
    };
    
    for compound_map in compound_maps {
        for (key, value) in compound_map {
            let q = value;
            
            let title = q.get_str("title").unwrap_or(key).to_string();
            let description = q.get_str("description").unwrap_or("").to_string();
            
            // Parse position
            let position = if let Some(x) = q.get_f64("x") {
                let y = q.get_f64("y").unwrap_or(0.0);
                Some(Position { x, y })
            } else if let Some(pos_list) = q.get_list("pos") {
                if pos_list.len() >= 2 {
                    let x = pos_list[0].as_f64().unwrap_or(0.0);
                    let y = pos_list[1].as_f64().unwrap_or(0.0);
                    Some(Position { x, y })
                } else {
                    None
                }
            } else {
                None
            };
            
            // Parse dependencies
            let mut quest_edges = Vec::new();
            if let Some(deps) = q.get_list("dependencies") {
                for dep in deps {
                    if let Some(dep_str) = dep.as_str() {
                        quest_edges.push(ParsedQuestEdge {
                            from: dep_str.to_string(),
                            to: key.clone(),
                            edge_type: "prerequisite".to_string(),
                        });
                    }
                }
            }
            if let Some(dep) = q.get_str("parent") {
                quest_edges.push(ParsedQuestEdge {
                    from: dep.to_string(),
                    to: key.clone(),
                    edge_type: "prerequisite".to_string(),
                });
            }
            
            // Parse tasks/objectives
            let mut objectives = Vec::new();
            if let Some(tasks_val) = q.get("tasks") {
                if let Some(tasks) = tasks_val.as_compound() {
                    for (task_id, task_value) in tasks {
                        let task_title = task_value.get_str("title").unwrap_or(task_id).to_string();
                        let task_type = task_value.get_str("type").unwrap_or("minecraft:item").to_string();
                        
                        let mut target = String::new();
                        let mut count = 1u32;
                        
                        // Parse item-based tasks
                        if let Some(item_val) = task_value.get("item") {
                            if let Some(item_str) = item_val.as_str() {
                                target = item_str.to_string();
                            } else if let Some(item_comp) = item_val.as_compound() {
                                target = item_comp.get("id").and_then(|v| v.as_str()).unwrap_or("").to_string();
                                count = item_comp.get("count").and_then(|v| v.as_i64()).unwrap_or(1) as u32;
                            }
                        }
                        
                        // Parse entity kill tasks
                        if let Some(entity_val) = task_value.get("entity") {
                            if let Some(entity_str) = entity_val.as_str() {
                                target = entity_str.to_string();
                            } else if let Some(entity_comp) = entity_val.as_compound() {
                                target = entity_comp.get("id").and_then(|v| v.as_str()).unwrap_or("").to_string();
                            }
                            count = task_value.get_i64("count").unwrap_or(1) as u32;
                        }
                        
                        // Parse count from task level
                        if count == 1 {
                            count = task_value.get_i64("count").unwrap_or(1) as u32;
                        }
                        
                        objectives.push(ParsedObjective {
                            id: Uuid::new_v4().to_string(),
                            title: task_title,
                            objective_type: task_type,
                            target,
                            count,
                            required: true,
                        });
                    }
                }
            }
            
            // Also check for "objects" array format
            if let Some(objects_val) = q.get("objects") {
                if let Some(objects) = objects_val.as_list() {
                    for obj in objects {
                        let obj_type = obj.get_str("type").unwrap_or("item").to_string();
                        let target = obj.get_str("id").unwrap_or("").to_string();
                        let count = obj.get_i64("count").unwrap_or(1) as u32;
                        
                        objectives.push(ParsedObjective {
                            id: Uuid::new_v4().to_string(),
                            title: format!("{}: {}", obj_type, target),
                            objective_type: obj_type,
                            target,
                            count,
                            required: true,
                        });
                    }
                }
            }
            
            // Parse rewards
            let mut rewards = Vec::new();
            if let Some(rewards_val) = q.get("rewards") {
                if let Some(rewards_comp) = rewards_val.as_compound() {
                    for (_reward_id, reward_value) in rewards_comp {
                        let reward_type = reward_value.get_str("type").unwrap_or("item").to_string();
                        let mut items = Vec::new();
                        
                        if let Some(item_list_val) = reward_value.get("items") {
                            if let Some(item_list) = item_list_val.as_list() {
                                for item in item_list {
                                    if let Some(item_str) = item.as_str() {
                                        items.push(item_str.to_string());
                                    } else if let Some(item_comp) = item.as_compound() {
                                        if let Some(id) = item_comp.get("id").and_then(|v| v.as_str()) {
                                            items.push(id.to_string());
                                        }
                                    }
                                }
                            }
                        }
                        
                        rewards.push(ParsedReward {
                            id: Uuid::new_v4().to_string(),
                            title: reward_type.clone(),
                            reward_type,
                            items,
                            description: reward_value.get_str("description").unwrap_or("").to_string(),
                        });
                    }
                }
                
                // Also check for "rewards" array format
                if let Some(rewards_arr_val) = q.get("rewards") {
                    if let Some(rewards_arr) = rewards_arr_val.as_list() {
                        for reward in rewards_arr {
                            let reward_type = reward.get_str("type").unwrap_or("item").to_string();
                            let mut items = Vec::new();
                            
                            if let Some(item_list_val) = reward.get("items") {
                                if let Some(item_list) = item_list_val.as_list() {
                                    for item in item_list {
                                        if let Some(item_str) = item.as_str() {
                                            items.push(item_str.to_string());
                                        } else if let Some(id) = item.get("id").and_then(|v| v.as_str()) {
                                            items.push(id.to_string());
                                        }
                                    }
                                }
                            }
                            
                            rewards.push(ParsedReward {
                                id: Uuid::new_v4().to_string(),
                                title: reward_type.clone(),
                                reward_type,
                                items,
                                description: reward.get_str("description").unwrap_or("").to_string(),
                            });
                        }
                    }
                }
            }
            
            // Determine node type
            let node_type = if let Some(is_chapter) = q.get_bool("is_chapter") {
                if is_chapter { "chapter" } else { "quest" }
            } else if let Some(nt) = q.get_str("type") {
                nt
            } else {
                "quest"
            }.to_string();
            
            // Parse parent chapter
            let parent_chapter = q.get_str("chapter").map(|s| s.to_string());
            
            nodes.push(ParsedQuestNode {
                id: key.clone(),
                title,
                description,
                node_type,
                objectives,
                rewards,
                position,
                parent_chapter,
            });
            
            edges.extend(quest_edges);
        }
    }
    
    Ok(ParsedQuestData { nodes, edges })
}

fn parse_ftb_quests_json(json: &serde_json::Value) -> Result<ParsedQuestData> {
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

/// Parse all known quest mod formats from config files
pub fn parse_all_quest_configs(config_files: &[ConfigFile]) -> Result<Option<QuestGraph>> {
    // Try FTB Quests first
    if let Some(ftb_data) = parse_ftb_quests(config_files)? {
        if !ftb_data.nodes.is_empty() {
            return Ok(Some(convert_to_quest_graph("FTB Quests Import", ftb_data)));
        }
    }
    
    // Try Better Questing
    if let Some(bq_data) = parse_better_questing(config_files)? {
        if !bq_data.nodes.is_empty() {
            return Ok(Some(convert_to_quest_graph("Better Questing Import", bq_data)));
        }
    }
    
    // Could add more parsers here (Quests, JourneyMap, etc.)
    
    Ok(None)
}

/// Convert parsed quest data to our internal QuestGraph format
fn convert_to_quest_graph(name: &str, data: ParsedQuestData) -> QuestGraph {
    let mut graph = QuestGraph::new("", name);
    
    // Create chapter for imported quests
    let chapter_id = Uuid::new_v4().to_string();
    let chapter = QuestNode {
        id: chapter_id.clone(),
        node_type: QuestNodeType::Chapter,
        label: name.to_string(),
        description: format!("Imported from {}", name).to_string(),
        position: Position { x: 400.0, y: 0.0 },
        ..Default::default()
    };
    graph.nodes.push(chapter);
    
    // Convert nodes
    let mut node_map: HashMap<String, String> = HashMap::new();
    let mut y_pos = 200.0;
    
    for parsed_node in &data.nodes {
        let node_id = Uuid::new_v4().to_string();
        node_map.insert(parsed_node.id.clone(), node_id.clone());
        
        let objectives = parsed_node.objectives.clone().into_iter().map(|o| QuestObjective {
            id: o.id,
            label: o.title,
            objective_type: match o.objective_type.as_str() {
                "item" | "retrieval" => ObjectiveType::ItemAcquisition,
                "craft" => ObjectiveType::ItemAcquisition,
                "kill" | "entity" => ObjectiveType::EntityKill,
                "location" | "visit" => ObjectiveType::LocationVisit,
                "advancement" => ObjectiveType::Custom,
                _ => ObjectiveType::Custom,
            },
            target: o.target,
            target_count: o.count as i32,
            required: o.required,
            ..Default::default()
        }).collect();
        
        let rewards = parsed_node.rewards.clone().into_iter().map(|r| QuestReward {
            id: r.id,
            label: r.title,
            reward_type: match r.reward_type.as_str() {
                "item" => RewardType::Item,
                "command" => RewardType::Command,
                "xp" | "experience" => RewardType::Experience,
                "unlock" => RewardType::Unlock,
                _ => RewardType::Custom,
            },
            items: r.items,
            description: r.description,
            ..Default::default()
        }).collect();
        
        let node = QuestNode {
            id: node_id.clone(),
            node_type: match parsed_node.node_type.as_str() {
                "chapter" => QuestNodeType::Chapter,
                "side" | "side_quest" => QuestNodeType::SideQuest,
                _ => QuestNodeType::Quest,
            },
            label: parsed_node.title.clone(),
            description: parsed_node.description.clone(),
            position: parsed_node.position.as_ref().cloned().unwrap_or(Position { x: 100.0, y: y_pos }),
            objectives,
            rewards,
            chapter_id: Some(chapter_id.clone()),
            ..Default::default()
        };
        
        graph.nodes.push(node);
        y_pos += 180.0;
    }
    
    // Convert edges
    for parsed_edge in &data.edges {
        if let (Some(from), Some(to)) = (node_map.get(&parsed_edge.from), node_map.get(&parsed_edge.to)) {
            graph.edges.push(QuestEdge {
                id: Uuid::new_v4().to_string(),
                source: from.clone(),
                target: to.clone(),
                label: None,
                edge_type: match parsed_edge.edge_type.as_str() {
                    "optional" => EdgeType::Optional,
                    _ => EdgeType::Prerequisite,
                },
                ..Default::default()
            });
        }
    }
    
    // Connect chapter to first nodes
    let first_nodes: Vec<String> = data.nodes.iter()
        .filter(|n| n.parent_chapter.is_none() || n.parent_chapter.as_deref() == Some(&chapter_id))
        .map(|n| node_map.get(&n.id).cloned())
        .flatten()
        .collect();
    
    for node_id in first_nodes {
        graph.edges.push(QuestEdge {
            id: Uuid::new_v4().to_string(),
            source: chapter_id.clone(),
            target: node_id,
            label: None,
            edge_type: EdgeType::Prerequisite,
            ..Default::default()
        });
    }
    
    graph
}

/// Parse progression configs (similar approach for progression mods)
pub fn parse_progression_configs(_config_files: &[ConfigFile]) -> Result<Option<ProgressionGraph>> {
    // Could parse mods like:
    // - Game Stages (config/gamestages/)
    // - Achievement mods
    // - Custom progression data
    
    // For now, return None - implement if needed
    Ok(None)
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