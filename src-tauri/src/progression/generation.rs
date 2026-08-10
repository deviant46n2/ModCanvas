use std::collections::{HashMap, HashSet};

use super::{
    categorize_by_name, get_known_mod_category, get_mod_phase, EdgeType, ModCategory, ModPhase,
    Position, ProgressionEdge, ProgressionGraph, ProgressionNode, ProgressionNodeType,
};
use uuid::Uuid;

struct ProgressionChain {
    _name: String,
    nodes: Vec<ChainNode>,
}

struct ChainNode {
    label: String,
    description: String,
    node_type: ProgressionNodeType,
    mod_refs: Vec<String>,
}

/// Auto-generate a progression graph from a list of mods
pub fn auto_generate_progression(
    project_id: &str,
    mods: &[(String, String, String)], // (mod_id, slug, mod_name)
) -> ProgressionGraph {
    let mut graph = ProgressionGraph::new(project_id, "Auto-Generated Progression");

    // Build sets for quick lookup — slugs are used for matching, mod_ids for refs
    let slugs: HashSet<String> = mods.iter().map(|(_, slug, _)| slug.to_lowercase()).collect();

    // Categorize all mods using slugs (which match known names)
    let mut categorized: Vec<(String, String, String, ModCategory, ModPhase)> = mods
        .iter()
        .map(|(mod_id, slug, mod_name)| {
            let category = get_known_mod_category(slug)
                .unwrap_or_else(|| categorize_by_name(mod_name));
            let phase = get_mod_phase(&category, mod_name);
            (mod_id.clone(), slug.clone(), mod_name.clone(), category, phase)
        })
        .collect();

    // Sort by phase
    categorized.sort_by_key(|(_, _, _, _, phase)| phase.phase_index());

    // === Build actual mod chains based on known relationships ===
    let mut chains: Vec<ProgressionChain> = Vec::new();

    // Tech chain: Create -> Mechanical/Mekanism -> AE2/RS -> Endgame
    if slugs.contains("create") {
        let mut chain = ProgressionChain {
            _name: "Technology Path".to_string(),
            nodes: vec![],
        };
        chain.nodes.push(ChainNode {
            label: "Create".to_string(),
            description: "Mechanical power and automation".to_string(),
            node_type: ProgressionNodeType::ContentIntroduction,
            mod_refs: mods.iter().filter(|(_, slug, _)| slug == "create").map(|(id, _, _)| id.clone()).collect(),
        });
        if slugs.iter().any(|s| s.contains("mekanism")) {
            chain.nodes.push(ChainNode {
                label: "Mekanism".to_string(),
                description: "Advanced machines and ore processing".to_string(),
                node_type: ProgressionNodeType::ContentIntroduction,
                mod_refs: mods.iter().filter(|(_, slug, _)| slug.contains("mekanism")).map(|(id, _, _)| id.clone()).collect(),
            });
        }
        if slugs.iter().any(|s| s.contains("applied-energistics") || s.contains("ae2")) {
            chain.nodes.push(ChainNode {
                label: "AE2".to_string(),
                description: "Digital storage and autocrafting".to_string(),
                node_type: ProgressionNodeType::Milestone,
                mod_refs: mods.iter().filter(|(_, slug, _)| {
                    slug.contains("applied-energistics") || slug.contains("ae2")
                }).map(|(id, _, _)| id.clone()).collect(),
            });
        }
        if slugs.iter().any(|s| s.contains("refined-storage")) {
            chain.nodes.push(ChainNode {
                label: "Refined Storage".to_string(),
                description: "Simpler digital storage".to_string(),
                node_type: ProgressionNodeType::Milestone,
                mod_refs: mods.iter().filter(|(_, slug, _)| slug.contains("refined-storage")).map(|(id, _, _)| id.clone()).collect(),
            });
        }
        chains.push(chain);
    }

    // Magic chain: Botania -> Ars Nouveau -> Blood Magic
    if slugs.iter().any(|s| s.contains("botania") || s.contains("ars")) {
        let mut chain = ProgressionChain {
            _name: "Magic Path".to_string(),
            nodes: vec![],
        };
        if slugs.iter().any(|s| s.contains("botania")) {
            chain.nodes.push(ChainNode {
                label: "Botania".to_string(),
                description: "Nature magic and mana generation".to_string(),
                node_type: ProgressionNodeType::ContentIntroduction,
                mod_refs: mods.iter().filter(|(_, slug, _)| slug.contains("botania")).map(|(id, _, _)| id.clone()).collect(),
            });
        }
        if slugs.iter().any(|s| s.contains("ars")) {
            chain.nodes.push(ChainNode {
                label: "Ars Nouveau".to_string(),
                description: "Spell crafting and rituals".to_string(),
                node_type: ProgressionNodeType::ContentIntroduction,
                mod_refs: mods.iter().filter(|(_, slug, _)| slug.contains("ars")).map(|(id, _, _)| id.clone()).collect(),
            });
        }
        if slugs.iter().any(|s| s.contains("blood") || s.contains("occultism")) {
            chain.nodes.push(ChainNode {
                label: "Blood Magic / Occultism".to_string(),
                description: "Dark rituals and demonology".to_string(),
                node_type: ProgressionNodeType::Milestone,
                mod_refs: mods.iter().filter(|(_, slug, _)| {
                    slug.contains("blood") || slug.contains("occultism")
                }).map(|(id, _, _)| id.clone()).collect(),
            });
        }
        chains.push(chain);
    }

    // Exploration chain
    if slugs.iter().any(|s| s.contains("biomes") || s.contains("terralith") || s.contains("dungeon")) {
        let mut chain = ProgressionChain {
            _name: "Exploration Path".to_string(),
            nodes: vec![],
        };
        if slugs.iter().any(|s| s.contains("biomes") || s.contains("terralith")) {
            chain.nodes.push(ChainNode {
                label: "World Generation".to_string(),
                description: "New biomes and terrain".to_string(),
                node_type: ProgressionNodeType::ContentIntroduction,
                mod_refs: mods.iter().filter(|(_, slug, _)| {
                    slug.contains("biomes") || slug.contains("terralith")
                }).map(|(id, _, _)| id.clone()).collect(),
            });
        }
        if slugs.iter().any(|s| s.contains("dungeon") || s.contains("roguelike")) {
            chain.nodes.push(ChainNode {
                label: "Dungeons & Structures".to_string(),
                description: "Combat challenges and loot".to_string(),
                node_type: ProgressionNodeType::Milestone,
                mod_refs: mods.iter().filter(|(_, slug, _)| {
                    slug.contains("dungeon") || slug.contains("roguelike") || slug.contains("structure")
                }).map(|(id, _, _)| id.clone()).collect(),
            });
        }
        chains.push(chain);
    }

    // === Build the graph from chains ===

    // Create a "Start" node
    let start_node = ProgressionNode {
        id: Uuid::new_v4().to_string(),
        node_type: ProgressionNodeType::Phase,
        label: "Start Here".to_string(),
        description: "Basic resources and setup".to_string(),
        position: Position { x: 400.0, y: 0.0 },
        data: HashMap::new(),
        mod_refs: Vec::new(),
        item_refs: Vec::new(),
    };
    graph.nodes.push(start_node.clone());

    // Add QoL/Foundation mods to start node
    let foundation_mods: Vec<String> = categorized.iter()
        .filter(|(_, _, _, cat, phase)| matches!(cat, ModCategory::Library | ModCategory::Performance | ModCategory::QualityOfLife) && matches!(phase, ModPhase::Foundation | ModPhase::Early))
        .map(|(id, _, _, _, _)| id.clone())
        .collect();

    if !foundation_mods.is_empty() {
        let foundation_node = ProgressionNode {
            id: Uuid::new_v4().to_string(),
            node_type: ProgressionNodeType::Milestone,
            label: "Core Setup".to_string(),
            description: format!("{} mods", foundation_mods.len()),
            position: Position { x: 100.0, y: 100.0 },
            data: HashMap::new(),
            mod_refs: foundation_mods,
            item_refs: Vec::new(),
        };
        graph.edges.push(ProgressionEdge {
            id: Uuid::new_v4().to_string(),
            source: start_node.id.clone(),
            target: foundation_node.id.clone(),
            label: None,
            edge_type: EdgeType::Prerequisite,
        });
        graph.nodes.push(foundation_node);
    }

    // Create chain nodes
    let mut chain_x_offset = 0.0;
    let chain_start_y = 300.0;

    for chain in &chains {
        let mut prev_node_id = start_node.id.clone();
        let mut chain_y = chain_start_y;

        for chain_node in &chain.nodes {
            let node = ProgressionNode {
                id: Uuid::new_v4().to_string(),
                node_type: chain_node.node_type.clone(),
                label: chain_node.label.clone(),
                description: chain_node.description.clone(),
                position: Position {
                    x: 150.0 + chain_x_offset,
                    y: chain_y,
                },
                data: HashMap::new(),
                mod_refs: chain_node.mod_refs.clone(),
                item_refs: Vec::new(),
            };

            // Connect to previous node in chain
            graph.edges.push(ProgressionEdge {
                id: Uuid::new_v4().to_string(),
                source: prev_node_id.clone(),
                target: node.id.clone(),
                label: None,
                edge_type: EdgeType::Prerequisite,
            });

            prev_node_id = node.id.clone();
            graph.nodes.push(node);
            chain_y += 150.0;
        }

        chain_x_offset += 250.0;
    }

    // Add remaining mods as content nodes grouped by category
    let mut remaining: Vec<&(String, String, String, ModCategory, ModPhase)> = categorized.iter()
        .filter(|(_, _, _, cat, _)| !matches!(cat, ModCategory::Library | ModCategory::Performance | ModCategory::QualityOfLife))
        .collect();

    // Group remaining by category
    let mut cat_groups: HashMap<String, Vec<&(String, String, String, ModCategory, ModPhase)>> = HashMap::new();
    for item in remaining.drain(..) {
        let cat = format!("{:?}", item.3);
        cat_groups.entry(cat).or_default().push(item);
    }

    let mut cat_x = chain_x_offset + 100.0;
    for (cat_name, mods_in_cat) in &cat_groups {
        if mods_in_cat.is_empty() { continue; }

        // Create a category group node
        let group_node = ProgressionNode {
            id: Uuid::new_v4().to_string(),
            node_type: ProgressionNodeType::Milestone,
            label: format!("{} ({})", cat_name, mods_in_cat.len()),
            description: format!("{} mods", mods_in_cat.len()),
            position: Position {
                x: cat_x,
                y: 100.0,
            },
            data: HashMap::new(),
            mod_refs: mods_in_cat.iter().map(|(id, _, _, _, _)| id.clone()).collect(),
            item_refs: Vec::new(),
        };

        graph.edges.push(ProgressionEdge {
            id: Uuid::new_v4().to_string(),
            source: start_node.id.clone(),
            target: group_node.id.clone(),
            label: None,
            edge_type: EdgeType::Optional,
        });

        graph.nodes.push(group_node);
        cat_x += 200.0;
    }

        eprintln!(
            "[ModCanvas] Auto-generated progression: {} nodes, {} edges for {} mods",
            graph.nodes.len(),
            graph.edges.len(),
            mods.len()
        );

        // Populate mod_names map so frontend can resolve IDs to display names
        for (mod_id, _slug, mod_name) in mods {
graph.mod_names.insert(mod_id.clone(), mod_name.clone());
        }

        graph
}
