use crate::imports::{ConfigFile, snbt::{SnbtValue, CommentedSnbt, parse_snbt}};
use crate::progression::{ProgressionGraph, ProgressionNode, ProgressionEdge, ProgressionNodeType, EdgeType, Position};
use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use uuid::Uuid;

/// Parsed progression data from various progression mod formats
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParsedProgressionData {
    pub nodes: Vec<ParsedProgressionNode>,
    pub edges: Vec<ParsedProgressionEdge>,
}

/// A progression node parsed from config
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParsedProgressionNode {
    pub id: String,
    pub title: String,
    pub description: String,
    pub node_type: String,
    pub stage: Option<String>,
    pub position: Option<Position>,
    pub parent_chapter: Option<String>,
    pub items: Vec<String>,
    pub mods: Vec<String>,
}

/// A progression edge parsed from config
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParsedProgressionEdge {
    pub from: String,
    pub to: String,
    pub edge_type: String,
}

/// Parse Game Stages config files
pub fn parse_game_stages(config_files: &[ConfigFile]) -> Result<Option<ParsedProgressionData>> {
    let gs_files: Vec<&ConfigFile> = config_files.iter()
        .filter(|f| f.path.to_string_lossy().contains("gamestages") || f.path.to_string_lossy().contains("game_stages"))
        .collect();
    
    if gs_files.is_empty() {
        return Ok(None);
    }
    
    let mut nodes = Vec::new();
    let mut edges = Vec::new();
    
    for file in gs_files {
        if let Ok(json) = serde_json::from_str::<serde_json::Value>(&file.content) {
            let parsed = parse_gs_json(&json)?;
            nodes.extend(parsed.nodes);
            edges.extend(parsed.edges);
        }
    }
    
    if nodes.is_empty() {
        return Ok(None);
    }
    
    Ok(Some(ParsedProgressionData { nodes, edges }))
}

fn parse_gs_json(json: &serde_json::Value) -> Result<ParsedProgressionData> {
    let mut nodes = Vec::new();
    let mut edges = Vec::new();
    
    // Game Stages format: stages { "stage_name": { description, parents: [] } }
    if let Some(stages) = json.get("stages").and_then(|v| v.as_object()) {
        for (id, stage) in stages {
            let title = stage.get("title").and_then(|v| v.as_str()).unwrap_or(id);
            let description = stage.get("description").and_then(|v| v.as_str()).unwrap_or("");
            
            nodes.push(ParsedProgressionNode {
                id: id.clone(),
                title: title.to_string(),
                description: description.to_string(),
                node_type: "stage".to_string(),
                stage: Some(id.clone()),
                position: None,
                parent_chapter: None,
                items: Vec::new(),
                mods: Vec::new(),
            });
            
            // Parse parent stages
            if let Some(parents) = stage.get("parents").and_then(|v| v.as_array()) {
                for parent in parents {
                    if let Some(parent_id) = parent.as_str() {
                        edges.push(ParsedProgressionEdge {
                            from: parent_id.to_string(),
                            to: id.clone(),
                            edge_type: "prerequisite".to_string(),
                        });
                    }
                }
            }
        }
    }
    
    Ok(ParsedProgressionData { nodes, edges })
}

/// Parse FTB Quests progression (chapters as progression stages)
pub fn parse_ftb_quests_progression(config_files: &[ConfigFile]) -> Result<Option<ParsedProgressionData>> {
    let ftb_files: Vec<&ConfigFile> = config_files.iter()
        .filter(|f| f.path.to_string_lossy().contains("ftbquests"))
        .collect();
    
    if ftb_files.is_empty() {
        return Ok(None);
    }
    
    let mut nodes = Vec::new();
    let mut edges = Vec::new();
    
    // Look for chapters file
    let chapters_file = ftb_files.iter().find(|f| 
        f.path.to_string_lossy().contains("chapter")
    );
    
    if let Some(chapters) = chapters_file {
        // Try JSON first
        if let Ok(json) = serde_json::from_str::<serde_json::Value>(&chapters.content) {
            let parsed = parse_ftb_chapters_json(&json)?;
            nodes.extend(parsed.nodes);
            edges.extend(parsed.edges);
        } else if let Ok(snbt) = parse_snbt(&chapters.content) {
            // Try SNBT parsing
            let parsed = parse_ftb_chapters_snbt(&snbt.value)?;
            nodes.extend(parsed.nodes);
            edges.extend(parsed.edges);
        }
    }
    
    if nodes.is_empty() {
        return Ok(None);
    }
    
    Ok(Some(ParsedProgressionData { nodes, edges }))
}

/// Parse FTB Quests chapters from SNBT format
fn parse_ftb_chapters_snbt(snbt: &SnbtValue) -> Result<ParsedProgressionData> {
    let mut nodes = Vec::new();
    let mut edges = Vec::new();
    
    let compound_maps: Vec<&HashMap<String, CommentedSnbt>> = match snbt {
        SnbtValue::Compound(m) => vec![m],
        SnbtValue::List(items) => {
            items.iter().filter_map(|v| v.as_compound()).collect()
        }
        _ => vec![],
    };
    
    for compound_map in compound_maps {
        for (key, value) in compound_map {
            let title = value.get_str("title").unwrap_or(key).to_string();
            let description = value.get_str("description").unwrap_or("").to_string();
            
            // Parse position
            let position = if let Some(x) = value.get_f64("x") {
                let y = value.get_f64("y").unwrap_or(0.0);
                Some(Position { x, y })
            } else {
                None
            };
            
            // Parse icon for mod references
            let mut mods = Vec::new();
            if let Some(icon) = value.get_str("icon") {
                // Icon often references a mod item like "modid:item"
                if let Some(mod_id) = icon.split(':').next() {
                    mods.push(mod_id.to_string());
                }
            }
            
            // Parse default_quest_area for stage info
            let stage = value.get_str("default_quest_area")
                .or_else(|| value.get_str("quest_area"))
                .map(|s| s.to_string());
            
            nodes.push(ParsedProgressionNode {
                id: format!("chapter_{}", key),
                title,
                description,
                node_type: "chapter".to_string(),
                stage,
                position,
                parent_chapter: None,
                items: Vec::new(),
                mods,
            });
            
            // Parse parent chapter
            if let Some(parent) = value.get_str("parent") {
                edges.push(ParsedProgressionEdge {
                    from: format!("chapter_{}", parent),
                    to: format!("chapter_{}", key),
                    edge_type: "prerequisite".to_string(),
                });
            }
        }
    }
    
    Ok(ParsedProgressionData { nodes, edges })
}

fn parse_ftb_chapters_json(json: &serde_json::Value) -> Result<ParsedProgressionData> {
    let mut nodes = Vec::new();
    let mut edges = Vec::new();
    
    if let Some(chapters) = json.get("chapters").and_then(|v| v.as_object()) {
        for (id, chapter) in chapters {
            let title = chapter.get("title").and_then(|v| v.as_str()).unwrap_or(id);
            let description = chapter.get("description").and_then(|v| v.as_str()).unwrap_or("");
            
            // Parse position
            let position = if let Some(x) = chapter.get("x").and_then(|v| v.as_f64()) {
                let y = chapter.get("y").and_then(|v| v.as_f64()).unwrap_or(0.0);
                Some(Position { x, y })
            } else {
                None
            };
            
            // Parse icon for mod references
            let mut mods = Vec::new();
            if let Some(icon) = chapter.get("icon").and_then(|v| v.as_str()) {
                if let Some(mod_id) = icon.split(':').next() {
                    mods.push(mod_id.to_string());
                }
            }
            
            // Parse default_quest_area for stage info
            let stage = chapter.get("default_quest_area")
                .or_else(|| chapter.get("quest_area"))
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());
            
            nodes.push(ParsedProgressionNode {
                id: format!("chapter_{}", id),
                title: title.to_string(),
                description: description.to_string(),
                node_type: "chapter".to_string(),
                stage,
                position,
                parent_chapter: None,
                items: Vec::new(),
                mods,
            });
            
            // Parse parent chapter
            if let Some(parent) = chapter.get("parent").and_then(|v| v.as_str()) {
                edges.push(ParsedProgressionEdge {
                    from: format!("chapter_{}", parent),
                    to: format!("chapter_{}", id),
                    edge_type: "prerequisite".to_string(),
                });
            }
        }
    }
    
    Ok(ParsedProgressionData { nodes, edges })
}

/// Parse Advancement/achievement progression
pub fn parse_advancement_progression(config_files: &[ConfigFile]) -> Result<Option<ParsedProgressionData>> {
    let adv_files: Vec<&ConfigFile> = config_files.iter()
        .filter(|f| f.path.to_string_lossy().contains("advancement") || f.path.to_string_lossy().contains("achievement"))
        .collect();
    
    if adv_files.is_empty() {
        return Ok(None);
    }
    
    let mut nodes = Vec::new();
    let mut edges = Vec::new();
    
    for file in adv_files {
        if let Ok(json) = serde_json::from_str::<serde_json::Value>(&file.content) {
            let parsed = parse_advancement_json(&json)?;
            nodes.extend(parsed.nodes);
            edges.extend(parsed.edges);
        }
    }
    
    if nodes.is_empty() {
        return Ok(None);
    }
    
    Ok(Some(ParsedProgressionData { nodes, edges }))
}

fn parse_advancement_json(json: &serde_json::Value) -> Result<ParsedProgressionData> {
    let mut nodes = Vec::new();
    let mut edges = Vec::new();
    
    // Minecraft advancement format
    if let Some(criteria) = json.get("criteria").and_then(|v| v.as_object()) {
        for (id, criterion) in criteria {
            let _trigger = criterion.get("trigger").and_then(|v| v.as_str()).unwrap_or("advancement");
            let description = criterion.get("conditions").and_then(|v| Some(v.to_string())).unwrap_or_default();
            
            nodes.push(ParsedProgressionNode {
                id: format!("adv_{}", id),
                title: id.clone(),
                description: description.chars().take(200).collect(),
                node_type: "advancement".to_string(),
                stage: None,
                position: None,
                parent_chapter: None,
                items: Vec::new(),
                mods: Vec::new(),
            });
            
            // Parse parent advancements
            if let Some(parent) = json.get("parent").and_then(|v| v.as_object()) {
                if let Some(parent_id) = parent.get("advancement").and_then(|v| v.as_str()) {
                    edges.push(ParsedProgressionEdge {
                        from: format!("adv_{}", parent_id),
                        to: format!("adv_{}", id),
                        edge_type: "prerequisite".to_string(),
                    });
                }
            }
        }
    }
    
    // Also handle advancement tree format (array of advancements)
    if let Some(advancements) = json.as_array() {
        for adv in advancements {
            if let Some(id) = adv.get("id").and_then(|v| v.as_str()) {
                let title = adv.get("title").and_then(|v| v.as_str()).unwrap_or(id);
                let description = adv.get("description").and_then(|v| v.as_str()).unwrap_or("");
                
                nodes.push(ParsedProgressionNode {
                    id: format!("adv_{}", id),
                    title: title.to_string(),
                    description: description.to_string(),
                    node_type: "advancement".to_string(),
                    stage: None,
                    position: None,
                    parent_chapter: None,
                    items: Vec::new(),
                    mods: Vec::new(),
                });
                
                if let Some(parents) = adv.get("parents").and_then(|v| v.as_array()) {
                    for parent in parents {
                        if let Some(parent_id) = parent.as_str() {
                            edges.push(ParsedProgressionEdge {
                                from: format!("adv_{}", parent_id),
                                to: format!("adv_{}", id),
                                edge_type: "prerequisite".to_string(),
                            });
                        }
                    }
                }
            }
        }
    }
    
    Ok(ParsedProgressionData { nodes, edges })
}

/// Parse custom progression data (mod-specific)
pub fn parse_custom_progression(config_files: &[ConfigFile]) -> Result<Option<ParsedProgressionData>> {
    // Look for common progression config files
    let custom_files: Vec<&ConfigFile> = config_files.iter()
        .filter(|f| {
            let path = f.path.to_string_lossy().to_lowercase();
            path.contains("progression") 
                || path.contains("roadmap")
                || path.contains("tech_tree")
                || path.contains("magic_tree")
        })
        .collect();
    
    if custom_files.is_empty() {
        return Ok(None);
    }
    
    // Try to parse as our own format first
    for file in custom_files {
        if let Ok(graph) = serde_json::from_str::<ProgressionGraph>(&file.content) {
            return Ok(Some(convert_progression_graph_to_parsed(&graph)));
        }
    }
    
    Ok(None)
}

fn convert_progression_graph_to_parsed(graph: &ProgressionGraph) -> ParsedProgressionData {
    let mut nodes = Vec::new();
    let mut edges = Vec::new();
    
    for node in &graph.nodes {
        nodes.push(ParsedProgressionNode {
            id: node.id.clone(),
            title: node.label.clone(),
            description: node.description.clone(),
            node_type: match node.node_type {
                ProgressionNodeType::Milestone => "milestone",
                ProgressionNodeType::Unlock => "unlock",
                ProgressionNodeType::Phase => "phase",
                ProgressionNodeType::Achievement => "achievement",
                ProgressionNodeType::ContentIntroduction => "content",
            }.to_string(),
            stage: None,
            position: Some(node.position.clone()),
            parent_chapter: node.data.get("chapter_id").cloned(),
            items: node.item_refs.clone(),
            mods: node.mod_refs.clone(),
        });
    }
    
    for edge in &graph.edges {
        edges.push(ParsedProgressionEdge {
            from: edge.source.clone(),
            to: edge.target.clone(),
            edge_type: match edge.edge_type {
                EdgeType::Prerequisite => "prerequisite",
                EdgeType::Optional => "optional",
                EdgeType::Alternative => "alternative",
                EdgeType::Inverted => "inverted",
            }.to_string(),
        });
    }
    
    ParsedProgressionData { nodes, edges }
}

/// Parse all known progression mod formats from config files
pub fn parse_all_progression_configs(config_files: &[ConfigFile]) -> Result<Option<ProgressionGraph>> {
    // Try Game Stages first
    if let Some(gs_data) = parse_game_stages(config_files)? {
        if !gs_data.nodes.is_empty() {
            return Ok(Some(convert_to_progression_graph("Game Stages Import", gs_data)));
        }
    }
    
    // Try FTB Quests chapters
    if let Some(ftb_data) = parse_ftb_quests_progression(config_files)? {
        if !ftb_data.nodes.is_empty() {
            return Ok(Some(convert_to_progression_graph("FTB Quests Import", ftb_data)));
        }
    }
    
    // Try Advancements
    if let Some(adv_data) = parse_advancement_progression(config_files)? {
        if !adv_data.nodes.is_empty() {
            return Ok(Some(convert_to_progression_graph("Advancements Import", adv_data)));
        }
    }
    
    // Try custom progression configs
    if let Some(custom_data) = parse_custom_progression(config_files)? {
        if !custom_data.nodes.is_empty() {
            return Ok(Some(convert_to_progression_graph("Custom Progression Import", custom_data)));
        }
    }
    
    Ok(None)
}

/// Convert parsed progression data to our internal ProgressionGraph format
fn convert_to_progression_graph(name: &str, data: ParsedProgressionData) -> ProgressionGraph {
    let mut graph = ProgressionGraph::new("", name);
    
    // Create chapter for imported progression
    let chapter_id = Uuid::new_v4().to_string();
    let chapter = ProgressionNode {
        id: chapter_id.clone(),
        node_type: ProgressionNodeType::Phase,
        label: name.to_string(),
        description: format!("Imported from {}", name).to_string(),
        position: Position { x: 400.0, y: 0.0 },
        data: {
            let mut map = HashMap::new();
            map.insert("imported_from".to_string(), name.to_string());
            map
        },
        mod_refs: Vec::new(),
        item_refs: Vec::new(),
    };
    graph.nodes.push(chapter);
    
    // Convert nodes
    let mut node_map: HashMap<String, String> = HashMap::new();
    let mut y_pos = 200.0;
    let mut x_pos = 100.0;
    
    for parsed_node in &data.nodes {
        let node_id = Uuid::new_v4().to_string();
        node_map.insert(parsed_node.id.clone(), node_id.clone());
        
        let node_type = match parsed_node.node_type.as_str() {
            "stage" => ProgressionNodeType::Phase,
            "chapter" => ProgressionNodeType::Phase,
            "milestone" => ProgressionNodeType::Milestone,
            "advancement" => ProgressionNodeType::Achievement,
            "unlock" => ProgressionNodeType::Unlock,
            "content" => ProgressionNodeType::ContentIntroduction,
            _ => ProgressionNodeType::Milestone,
        };
        
        let mut node_data = HashMap::new();
        if let Some(stage) = &parsed_node.stage {
            node_data.insert("original_stage".to_string(), stage.clone());
        }
        if !parsed_node.items.is_empty() {
            node_data.insert("items".to_string(), parsed_node.items.join(","));
        }
        if !parsed_node.mods.is_empty() {
            node_data.insert("mods".to_string(), parsed_node.mods.join(","));
        }
        if let Some(chapter) = &parsed_node.parent_chapter {
            node_data.insert("chapter_id".to_string(), chapter.clone());
        }
        
        let node = ProgressionNode {
            id: node_id.clone(),
            node_type,
            label: parsed_node.title.clone(),
            description: parsed_node.description.clone(),
            position: parsed_node.position.as_ref().cloned().unwrap_or(Position { x: x_pos, y: y_pos }),
            data: node_data,
            mod_refs: parsed_node.mods.clone(),
            item_refs: parsed_node.items.clone(),
        };
        
        graph.nodes.push(node);
        
        // Alternate x positions for better layout
        x_pos += 300.0;
        if x_pos > 1000.0 {
            x_pos = 100.0;
            y_pos += 180.0;
        }
    }
    
    // Convert edges
    for parsed_edge in &data.edges {
        if let (Some(from), Some(to)) = (node_map.get(&parsed_edge.from), node_map.get(&parsed_edge.to)) {
            let edge_type = match parsed_edge.edge_type.as_str() {
                "optional" => EdgeType::Optional,
                "alternative" => EdgeType::Alternative,
                _ => EdgeType::Prerequisite,
            };
            
            graph.edges.push(ProgressionEdge {
                id: Uuid::new_v4().to_string(),
                source: from.clone(),
                target: to.clone(),
                label: None,
                edge_type,
            });
        }
    }
    
    // Connect chapter to root nodes (nodes with no incoming edges)
    let nodes_with_parents: std::collections::HashSet<String> = data.edges.iter()
        .map(|e| e.to.clone())
        .collect();
    
    for parsed_node in &data.nodes {
        if !nodes_with_parents.contains(&parsed_node.id) {
            if let Some(node_id) = node_map.get(&parsed_node.id) {
                graph.edges.push(ProgressionEdge {
                    id: Uuid::new_v4().to_string(),
                    source: chapter_id.clone(),
                    target: node_id.clone(),
                    label: None,
                    edge_type: EdgeType::Prerequisite,
                });
            }
        }
    }
    
    graph
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_parse_game_stages_json() {
        let json = serde_json::json!({
            "stages": {
                "early_game": {
                    "title": "Early Game",
                    "description": "Basic survival",
                    "parents": []
                },
                "mid_game": {
                    "title": "Mid Game",
                    "description": "Tech and magic",
                    "parents": ["early_game"]
                }
            }
        });
        
        let result = parse_gs_json(&json).unwrap();
        assert_eq!(result.nodes.len(), 2);
        assert_eq!(result.nodes[0].title, "Early Game");
        assert_eq!(result.edges.len(), 1);
        assert_eq!(result.edges[0].from, "early_game");
        assert_eq!(result.edges[0].to, "mid_game");
    }
}