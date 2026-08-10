//! Conversion from the shared `ParsedQuestData` model into the internal
//! `QuestGraph` (with a synthetic chapter node for imported quests).

use crate::imports::quest_config::ParsedQuestData;
use crate::imports::ConfigFile;
use crate::quest::{EdgeType, ObjectiveType, Position, QuestEdge, QuestGraph, QuestNode, QuestNodeType, QuestObjective, QuestReward, RewardType};
use anyhow::Result;
use std::collections::HashMap;
use uuid::Uuid;

/// Parse all known quest mod formats from config files
pub fn parse_all_quest_configs(config_files: &[ConfigFile]) -> Result<Option<QuestGraph>> {
    // Try FTB Quests first
    if let Some(ftb_data) = crate::imports::quest_config::parse_ftb_quests(config_files)? {
        if !ftb_data.nodes.is_empty() {
            return Ok(Some(convert_to_quest_graph("FTB Quests Import", ftb_data)));
        }
    }
    
    // Try Better Questing
    if let Some(bq_data) = crate::imports::quest_config::parse_better_questing(config_files)? {
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
