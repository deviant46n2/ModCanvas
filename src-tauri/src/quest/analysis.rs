use uuid::Uuid;

use crate::progression::{categorize_by_name, get_known_mod_category, get_mod_phase, ModPhase};

use super::types::*;

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

pub fn auto_generate_quest(
    project_id: &str,
    mods: &[(String, String, String)],
) -> QuestGraph {
    let mut graph = QuestGraph::new(project_id, "Auto-Generated Questline");

    let slugs: std::collections::HashSet<String> =
        mods.iter().map(|(_, slug, _)| slug.to_lowercase()).collect();

    let mut categorized: Vec<(String, String, String, crate::progression::ModCategory, ModPhase)> =
        mods.iter()
            .map(|(mod_id, slug, mod_name)| {
                let category = get_known_mod_category(slug)
                    .unwrap_or_else(|| categorize_by_name(mod_name));
                let phase = get_mod_phase(&category, mod_name);
                (mod_id.clone(), slug.clone(), mod_name.clone(), category, phase)
            })
            .collect();

    categorized.sort_by_key(|(_, _, _, _, phase)| phase.phase_index());

    let mut chains: Vec<QuestChain> = Vec::new();

    // Tech chain
    if slugs.contains("create") {
        let mut chain = QuestChain {
            name: "Technology Path".to_string(),
            nodes: vec![],
        };
        chain.nodes.push(QuestChainNode {
            label: "Getting Started with Create".to_string(),
            description: "Learn the basics of mechanical power and automation".to_string(),
            node_type: QuestNodeType::Quest,
            objectives: vec![
                QuestObjective {
                    id: Uuid::new_v4().to_string(),
                    label: "Craft a Cogwheel".to_string(),
                    objective_type: ObjectiveType::ItemAcquisition,
                    target: "create:cogwheel".to_string(),
                    target_count: 1,
                    required: true,
                    ..Default::default()
                },
                QuestObjective {
                    id: Uuid::new_v4().to_string(),
                    label: "Build a Water Wheel".to_string(),
                    objective_type: ObjectiveType::ItemAcquisition,
                    target: "create:water_wheel".to_string(),
                    target_count: 1,
                    required: true,
                    ..Default::default()
                },
            ],
            rewards: vec![QuestReward {
                id: Uuid::new_v4().to_string(),
                label: "Copper Sheet".to_string(),
                reward_type: RewardType::Item,
                items: vec!["create:copper_sheet".to_string()],
                description: "For your first machines".to_string(),
                ..Default::default()
            }],
        });
        if slugs.iter().any(|s| s.contains("mekanism")) {
            chain.nodes.push(QuestChainNode {
                label: "Mekanism Basics".to_string(),
                description: "Set up basic ore processing".to_string(),
                node_type: QuestNodeType::Quest,
                objectives: vec![QuestObjective {
                    id: Uuid::new_v4().to_string(),
                    label: "Craft an Enrichment Chamber".to_string(),
                    objective_type: ObjectiveType::ItemAcquisition,
                    target: "mekanism:enrichment_chamber".to_string(),
                    target_count: 1,
                    required: true,
                    ..Default::default()
                }],
                rewards: vec![QuestReward {
                    id: Uuid::new_v4().to_string(),
                    label: "Ore Doubling".to_string(),
                    reward_type: RewardType::Unlock,
                    items: vec![],
                    description: "Unlock 2x ore processing".to_string(),
                    ..Default::default()
                }],
            });
        }
        if slugs.iter().any(|s| s.contains("applied-energistics") || s.contains("ae2")) {
            chain.nodes.push(QuestChainNode {
                label: "AE2 Storage".to_string(),
                description: "Set up digital storage and autocrafting".to_string(),
                node_type: QuestNodeType::Quest,
                objectives: vec![
                    QuestObjective {
                        id: Uuid::new_v4().to_string(),
                        label: "Craft a ME Controller".to_string(),
                        objective_type: ObjectiveType::ItemAcquisition,
                        target: "ae2:me_controller".to_string(),
                        target_count: 1,
                        required: true,
                        ..Default::default()
                    },
                    QuestObjective {
                        id: Uuid::new_v4().to_string(),
                        label: "Build a ME Drive".to_string(),
                        objective_type: ObjectiveType::ItemAcquisition,
                        target: "ae2:me_drive".to_string(),
                        target_count: 1,
                        required: true,
                        ..Default::default()
                    },
                ],
                rewards: vec![QuestReward {
                    id: Uuid::new_v4().to_string(),
                    label: "ME Storage Cell".to_string(),
                    reward_type: RewardType::Item,
                    items: vec!["ae2:me_storage_cell_1k".to_string()],
                    description: "Your first storage cell".to_string(),
                    ..Default::default()
                }],
            });
        }
        if slugs.iter().any(|s| s.contains("refined-storage")) {
            chain.nodes.push(QuestChainNode {
                label: "Refined Storage".to_string(),
                description: "Simpler digital storage alternative".to_string(),
                node_type: QuestNodeType::Quest,
                objectives: vec![QuestObjective {
                    id: Uuid::new_v4().to_string(),
                    label: "Craft a Controller".to_string(),
                    objective_type: ObjectiveType::ItemAcquisition,
                    target: "refinedstorage:controller".to_string(),
                    target_count: 1,
                    required: true,
                    ..Default::default()
                }],
                rewards: vec![QuestReward {
                    id: Uuid::new_v4().to_string(),
                    label: "1k Storage Disk".to_string(),
                    reward_type: RewardType::Item,
                    items: vec!["refinedstorage:1k_storage_disk".to_string()],
                    description: "For your items".to_string(),
                    ..Default::default()
                }],
            });
        }
        chains.push(chain);
    }

    // Magic chain
    if slugs.iter().any(|s| s.contains("botania") || s.contains("ars")) {
        let mut chain = QuestChain {
            name: "Magic Path".to_string(),
            nodes: vec![],
        };
        if slugs.iter().any(|s| s.contains("botania")) {
            chain.nodes.push(QuestChainNode {
                label: "Botania: Flowers of Power".to_string(),
                description: "Begin your journey into nature magic".to_string(),
                node_type: QuestNodeType::Quest,
                objectives: vec![
                    QuestObjective {
                        id: Uuid::new_v4().to_string(),
                        label: "Craft a Petal Apothecary".to_string(),
                        objective_type: ObjectiveType::ItemAcquisition,
                        target: "botania:petal_apothecary".to_string(),
                        target_count: 1,
                        required: true,
                        ..Default::default()
                    },
                    QuestObjective {
                        id: Uuid::new_v4().to_string(),
                        label: "Create Pure Daisy".to_string(),
                        objective_type: ObjectiveType::ItemAcquisition,
                        target: "botania:pure_daisy".to_string(),
                        target_count: 1,
                        required: true,
                        ..Default::default()
                    },
                ],
                rewards: vec![QuestReward {
                    id: Uuid::new_v4().to_string(),
                    label: "Mana Tablet".to_string(),
                    reward_type: RewardType::Item,
                    items: vec!["botania:mana_tablet".to_string()],
                    description: "Store your mana".to_string(),
                    ..Default::default()
                }],
            });
        }
        if slugs.iter().any(|s| s.contains("ars")) {
            chain.nodes.push(QuestChainNode {
                label: "Ars Nouveau: Spell Crafting".to_string(),
                description: "Learn to craft your own spells".to_string(),
                node_type: QuestNodeType::Quest,
                objectives: vec![
                    QuestObjective {
                        id: Uuid::new_v4().to_string(),
                        label: "Craft a Worn Notebook".to_string(),
                        objective_type: ObjectiveType::ItemAcquisition,
                        target: "ars_nouveau:worn_notebook".to_string(),
                        target_count: 1,
                        required: true,
                        ..Default::default()
                    },
                    QuestObjective {
                        id: Uuid::new_v4().to_string(),
                        label: "Build a Glyph Press".to_string(),
                        objective_type: ObjectiveType::ItemAcquisition,
                        target: "ars_nouveau:glyph_press".to_string(),
                        target_count: 1,
                        required: true,
                        ..Default::default()
                    },
                ],
                rewards: vec![QuestReward {
                    id: Uuid::new_v4().to_string(),
                    label: "Spell Book".to_string(),
                    reward_type: RewardType::Item,
                    items: vec!["ars_nouveau:spell_book".to_string()],
                    description: "Your first spell book".to_string(),
                    ..Default::default()
                }],
            });
        }
        if slugs.iter().any(|s| s.contains("blood") || s.contains("occultism")) {
            chain.nodes.push(QuestChainNode {
                label: "Blood Magic / Occultism".to_string(),
                description: "Delve into darker rituals".to_string(),
                node_type: QuestNodeType::Quest,
                objectives: vec![QuestObjective {
                    id: Uuid::new_v4().to_string(),
                    label: "Craft a Sacrificial Dagger".to_string(),
                    objective_type: ObjectiveType::ItemAcquisition,
                    target: "bloodmagic:sacrificial_dagger".to_string(),
                    target_count: 1,
                    required: true,
                    ..Default::default()
                }],
                rewards: vec![QuestReward {
                    id: Uuid::new_v4().to_string(),
                    label: "Weak Blood Orb".to_string(),
                    reward_type: RewardType::Item,
                    items: vec!["bloodmagic:weak_blood_orb".to_string()],
                    description: "Begin your blood magic journey".to_string(),
                    ..Default::default()
                }],
            });
        }
        chains.push(chain);
    }

    // Exploration chain
    if slugs.iter().any(|s| s.contains("biomes") || s.contains("terralith") || s.contains("dungeon"))
    {
        let mut chain = QuestChain {
            name: "Exploration Path".to_string(),
            nodes: vec![],
        };
        if slugs.iter().any(|s| s.contains("biomes") || s.contains("terralith")) {
            chain.nodes.push(QuestChainNode {
                label: "New Horizons".to_string(),
                description: "Explore the new biomes and terrain".to_string(),
                node_type: QuestNodeType::Quest,
                objectives: vec![QuestObjective {
                    id: Uuid::new_v4().to_string(),
                    label: "Visit 5 new biomes".to_string(),
                    objective_type: ObjectiveType::LocationVisit,
                    target: "".to_string(),
                    target_count: 5,
                    required: true,
                    ..Default::default()
                }],
                rewards: vec![QuestReward {
                    id: Uuid::new_v4().to_string(),
                    label: "Explorer's Compass".to_string(),
                    reward_type: RewardType::Item,
                    items: vec!["minecraft:compass".to_string()],
                    description: "Never get lost".to_string(),
                    ..Default::default()
                }],
            });
        }
        if slugs.iter().any(|s| s.contains("dungeon") || s.contains("roguelike")) {
            chain.nodes.push(QuestChainNode {
                label: "Dungeon Delver".to_string(),
                description: "Conquer dungeons and claim their loot".to_string(),
                node_type: QuestNodeType::Quest,
                objectives: vec![
                    QuestObjective {
                        id: Uuid::new_v4().to_string(),
                        label: "Complete a dungeon".to_string(),
                        objective_type: ObjectiveType::LocationVisit,
                        target: "".to_string(),
                        target_count: 1,
                        required: true,
                        ..Default::default()
                    },
                    QuestObjective {
                        id: Uuid::new_v4().to_string(),
                        label: "Defeat a boss".to_string(),
                        objective_type: ObjectiveType::EntityKill,
                        target: "".to_string(),
                        target_count: 1,
                        required: true,
                        ..Default::default()
                    },
                ],
                rewards: vec![QuestReward {
                    id: Uuid::new_v4().to_string(),
                    label: "Dungeon Loot".to_string(),
                    reward_type: RewardType::Item,
                    items: vec!["minecraft:diamond".to_string()],
                    description: "Riches from the depths".to_string(),
                    ..Default::default()
                }],
            });
        }
        chains.push(chain);
    }

    // Agriculture/Farming chain
    if slugs
        .iter()
        .any(|s| s.contains("crop") || s.contains("farm") || s.contains("pam") || s.contains("croptopia"))
    {
        let mut chain = QuestChain {
            name: "Farming & Cooking".to_string(),
            nodes: vec![],
        };
        chain.nodes.push(QuestChainNode {
            label: "Farmer's Life".to_string(),
            description: "Start your agricultural empire".to_string(),
            node_type: QuestNodeType::Quest,
            objectives: vec![
                QuestObjective {
                    id: Uuid::new_v4().to_string(),
                    label: "Plant 10 crops".to_string(),
                    objective_type: ObjectiveType::BlockPlace,
                    target: "minecraft:wheat".to_string(),
                    target_count: 10,
                    required: true,
                    ..Default::default()
                },
                QuestObjective {
                    id: Uuid::new_v4().to_string(),
                    label: "Harvest your first crop".to_string(),
                    objective_type: ObjectiveType::ItemAcquisition,
                    target: "minecraft:wheat".to_string(),
                    target_count: 10,
                    required: true,
                    ..Default::default()
                },
            ],
            rewards: vec![QuestReward {
                id: Uuid::new_v4().to_string(),
                label: "Watering Can".to_string(),
                reward_type: RewardType::Item,
                items: vec!["minecraft:water_bucket".to_string()],
                description: "Keep your crops hydrated".to_string(),
                ..Default::default()
            }],
        });
        if slugs.iter().any(|s| s.contains("pam") || s.contains("croptopia")) {
            chain.nodes.push(QuestChainNode {
                label: "Pam's HarvestCraft / Croptopia".to_string(),
                description: "Master the art of cooking".to_string(),
                node_type: QuestNodeType::Quest,
                objectives: vec![QuestObjective {
                    id: Uuid::new_v4().to_string(),
                    label: "Cook 5 different foods".to_string(),
                    objective_type: ObjectiveType::ItemAcquisition,
                    target: "".to_string(),
                    target_count: 5,
                    required: true,
                    ..Default::default()
                }],
                rewards: vec![QuestReward {
                    id: Uuid::new_v4().to_string(),
                    label: "Cooking Pot".to_string(),
                    reward_type: RewardType::Item,
                    items: vec!["minecraft:bowl".to_string()],
                    description: "For your soups and stews".to_string(),
                    ..Default::default()
                }],
            });
        }
        chains.push(chain);
    }

    // Build graph from chains
    let start_chapter = QuestNode {
        id: Uuid::new_v4().to_string(),
        node_type: QuestNodeType::Chapter,
        label: "Welcome to the Pack".to_string(),
        description: "Begin your adventure".to_string(),
        position: Position { x: 400.0, y: 0.0 },
        ..Default::default()
    };
    graph.nodes.push(start_chapter.clone());

    let mut chain_x_offset = 0.0;
    let chain_start_y = 250.0;

    for chain in &chains {
        let mut prev_node_id;
        let mut chain_y = chain_start_y;

        let chain_chapter = QuestNode {
            id: Uuid::new_v4().to_string(),
            node_type: QuestNodeType::Chapter,
            label: chain.name.clone(),
            description: format!("{} quests", chain.nodes.len()),
            position: Position {
                x: 150.0 + chain_x_offset,
                y: chain_y - 80.0,
            },
            ..Default::default()
        };

        graph.edges.push(QuestEdge {
            id: Uuid::new_v4().to_string(),
            source: start_chapter.id.clone(),
            target: chain_chapter.id.clone(),
            label: None,
            edge_type: EdgeType::Prerequisite,
            ..Default::default()
        });
        graph.nodes.push(chain_chapter.clone());
        prev_node_id = chain_chapter.id.clone();

        for chain_node in &chain.nodes {
            let node = QuestNode {
                id: Uuid::new_v4().to_string(),
                node_type: chain_node.node_type.clone(),
                label: chain_node.label.clone(),
                description: chain_node.description.clone(),
                position: Position {
                    x: 150.0 + chain_x_offset,
                    y: chain_y,
                },
                objectives: chain_node.objectives.clone(),
                rewards: chain_node.rewards.clone(),
                chapter_id: Some(chain_chapter.id.clone()),
                ..Default::default()
            };

            graph.edges.push(QuestEdge {
                id: Uuid::new_v4().to_string(),
                source: prev_node_id.clone(),
                target: node.id.clone(),
                label: None,
                edge_type: EdgeType::Prerequisite,
                ..Default::default()
            });

            prev_node_id = node.id.clone();
            graph.nodes.push(node);
            chain_y += 180.0;
        }

        chain_x_offset += 300.0;
    }

    let free_play_chapter = QuestNode {
        id: Uuid::new_v4().to_string(),
        node_type: QuestNodeType::Chapter,
        label: "Free Play".to_string(),
        description: "Set your own goals".to_string(),
        position: Position {
            x: 400.0,
            y: chain_start_y + 200.0,
        },
        ..Default::default()
    };
    graph.nodes.push(free_play_chapter);

    eprintln!(
        "[ModCanvas] Auto-generated quest: {} nodes, {} edges for {} mods",
        graph.nodes.len(),
        graph.edges.len(),
        mods.len()
    );

    graph
}
