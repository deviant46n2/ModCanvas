//! FTB Quests config parsing (SNBT chapters / tasks files), producing the
//! shared `ParsedQuestData` model.

use crate::imports::quest_config::{ParsedObjective, ParsedQuestData, ParsedQuestEdge, ParsedQuestNode, ParsedReward};
use crate::imports::{ConfigFile, snbt::{SnbtValue, CommentedSnbt, parse_snbt}};
use crate::quest::Position;
use anyhow::Result;
use std::collections::HashMap;
use uuid::Uuid;

use super::ftb_json::parse_ftb_quests_json;

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
