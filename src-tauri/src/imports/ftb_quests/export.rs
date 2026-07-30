use crate::imports::snbt::{SnbtValue, CommentedSnbt, compound_to_snbt};
use crate::quest::*;
use anyhow::Result;
use std::collections::HashMap;
use std::path::Path;

pub(crate) fn ce(v: SnbtValue) -> CommentedSnbt { CommentedSnbt::new(v) }

fn icon_to_snbt(icon: &str) -> SnbtValue {
    if icon.is_empty() {
        return SnbtValue::Compound(HashMap::new());
    }
    let mut icon_map = HashMap::new();
    icon_map.insert("id".to_string(), ce(SnbtValue::String(icon.to_string())));
    SnbtValue::Compound(icon_map)
}

fn item_compound(item_id: &str, count: i32) -> SnbtValue {
    let mut m: HashMap<String, CommentedSnbt> = HashMap::new();
    m.insert("id".to_string(), ce(SnbtValue::String(item_id.to_string())));
    if count > 1 {
        m.insert("count".to_string(), ce(SnbtValue::Int(count)));
    }
    SnbtValue::Compound(m)
}

/// Export a QuestGraph as FTB Quests SNBT files to a directory (both Subdirs and FlatChapters formats)
pub fn export_ftb_quests_snbt(graph: &QuestGraph, output_dir: &Path) -> Result<()> {
    let quests_dir = output_dir.join("config").join("ftbquests").join("quests");
    std::fs::create_dir_all(&quests_dir)?;

    // Write data.snbt
    let mut data_map = HashMap::new();
    data_map.insert("version".to_string(), ce(SnbtValue::Int(13)));
    data_map.insert("default_reward_team".to_string(), ce(SnbtValue::Byte(0)));
    data_map.insert("default_consume_items".to_string(), ce(SnbtValue::Byte(0)));
    data_map.insert("default_autoclaim_rewards".to_string(), ce(SnbtValue::String("disabled".to_string())));
    data_map.insert("default_quest_shape".to_string(), ce(SnbtValue::String(graph.default_quest_shape.to_string())));
    data_map.insert("progression_mode".to_string(), ce(SnbtValue::String(graph.book_progression_mode.to_string())));
    data_map.insert("detection_delay".to_string(), ce(SnbtValue::Int(20)));
    crate::path_safety::atomic_write_str(&quests_dir.join("data.snbt"), &compound_to_snbt(&data_map))
        .map_err(|e| anyhow::anyhow!("{e}"))?;

    // Group quests by chapter
    let mut chapter_quests: HashMap<String, Vec<&QuestNode>> = HashMap::new();
    for node in &graph.nodes {
        if matches!(node.node_type, QuestNodeType::Quest | QuestNodeType::SideQuest | QuestNodeType::Reward | QuestNodeType::Gate) {
            if let Some(ch_id) = &node.chapter_id {
                chapter_quests.entry(ch_id.clone()).or_default().push(node);
            }
        }
    }

    // Build deps map once
    let mut deps_map: HashMap<String, Vec<String>> = HashMap::new();
    for edge in &graph.edges {
        if edge.edge_type == EdgeType::Prerequisite {
            deps_map.entry(edge.target.clone()).or_default().push(edge.source.clone());
        }
    }

    // Export chapters in Subdirs format (quests_dir/{filename}/chapter.snbt)
    for chapter_node in graph.nodes.iter().filter(|n| matches!(n.node_type, QuestNodeType::Chapter)) {
        let chapter_meta = graph.chapters.iter().find(|c| c.id == chapter_node.id);
        let filename = chapter_meta
            .map(|c| sanitize_filename(&c.title))
            .unwrap_or_else(|| sanitize_filename(&chapter_node.label));

        let chapter_dir = quests_dir.join(&filename);
        std::fs::create_dir_all(&chapter_dir)?;

        let chapter_snbt = build_subdirs_chapter(chapter_node, chapter_meta, &filename, &chapter_quests, &deps_map);
        crate::path_safety::atomic_write_str(&chapter_dir.join("chapter.snbt"), &chapter_snbt.to_snbt_string())
            .map_err(|e| anyhow::anyhow!("{e}"))?;
    }

    // Export chapters in FlatChapters format (quests_dir/chapters/{filename}.snbt)
    // We read the existing file, replace the quests array, and preserve all other chapter metadata.
    let chapters_dir = quests_dir.join("chapters");
    std::fs::create_dir_all(&chapters_dir)?;
    for chapter_node in graph.nodes.iter().filter(|n| matches!(n.node_type, QuestNodeType::Chapter)) {
        let chapter_meta = graph.chapters.iter().find(|c| c.id == chapter_node.id);
        let filename = chapter_meta
            .map(|c| sanitize_filename(&c.title))
            .unwrap_or_else(|| sanitize_filename(&chapter_node.label));

        let chapter_path = chapters_dir.join(format!("{filename}.snbt"));

        // Build new quests array from graph data
        let new_quests = build_flat_chapters_quests(chapter_node, &chapter_quests, &deps_map);

        // Try to parse existing chapter file to preserve metadata (images, icon, group, etc.)
        let mut chapter_compound = if chapter_path.exists() {
            match crate::imports::snbt::parse_snbt_compound(
                &std::fs::read_to_string(&chapter_path).unwrap_or_default()
            ) {
                Ok(map) => map,
                Err(_) => HashMap::new(),
            }
        } else {
            HashMap::new()
        };

        // Always set/update id, filename, quests
        chapter_compound.insert("id".to_string(), ce(SnbtValue::String(chapter_node.id.clone())));
        chapter_compound.insert("filename".to_string(), ce(SnbtValue::String(filename.to_string())));
        chapter_compound.insert("quests".to_string(), ce(SnbtValue::List(new_quests)));

        // Set chapter title if non-empty, preserve existing otherwise
        if !chapter_node.label.is_empty() {
            chapter_compound.insert("title".to_string(), ce(SnbtValue::String(chapter_node.label.clone())));
        }

        // Ensure order_index and default_enabled are set
        if let Some(meta) = chapter_meta {
            chapter_compound.insert("order_index".to_string(), ce(SnbtValue::Int(meta.order_index)));
            if !meta.default_enabled {
                chapter_compound.insert("default_enabled".to_string(), ce(SnbtValue::Byte(0)));
            }
        }

        crate::path_safety::atomic_write_str(&chapter_path, &compound_to_snbt(&chapter_compound))
            .map_err(|e| anyhow::anyhow!("{e}"))?;
    }

    Ok(())
}

fn build_subdirs_chapter<'a>(
    chapter_node: &QuestNode,
    chapter_meta: Option<&QuestChapter>,
    filename: &str,
    chapter_quests: &HashMap<String, Vec<&'a QuestNode>>,
    deps_map: &HashMap<String, Vec<String>>,
) -> SnbtValue {
    let mut chapter_map: HashMap<String, CommentedSnbt> = HashMap::new();
    chapter_map.insert("id".to_string(), ce(SnbtValue::String(chapter_node.id.clone())));
    chapter_map.insert("filename".to_string(), ce(SnbtValue::String(filename.to_string())));
    chapter_map.insert("title".to_string(), ce(SnbtValue::String(chapter_node.label.clone())));

    if let Some(meta) = chapter_meta {
        if !meta.default_quest_shape.to_string().is_empty() && meta.default_quest_shape.to_string() != "default" {
            chapter_map.insert("default_quest_shape".to_string(), ce(SnbtValue::String(meta.default_quest_shape.to_string())));
        }
        if !meta.group_id.is_none() {
            chapter_map.insert("group".to_string(), ce(SnbtValue::String(meta.group_id.clone().unwrap_or_default())));
        }
        chapter_map.insert("order_index".to_string(), ce(SnbtValue::Int(meta.order_index)));
        if !meta.default_enabled {
            chapter_map.insert("default_enabled".to_string(), ce(SnbtValue::Byte(0)));
        }
    }

    if let Some(quests) = chapter_quests.get(&chapter_node.id) {
        let quest_snbt_values: Vec<SnbtValue> = quests.iter()
            .filter_map(|q| quest_to_snbt(q, deps_map.get(&q.id), false).ok())
            .collect();
        chapter_map.insert("quests".to_string(), ce(SnbtValue::List(quest_snbt_values)));
    }

    SnbtValue::Compound(chapter_map)
}

fn build_flat_chapters_quests<'a>(
    chapter_node: &QuestNode,
    chapter_quests: &HashMap<String, Vec<&'a QuestNode>>,
    deps_map: &HashMap<String, Vec<String>>,
) -> Vec<SnbtValue> {
    if let Some(quests) = chapter_quests.get(&chapter_node.id) {
        quests.iter()
            .filter_map(|q| quest_to_snbt(q, deps_map.get(&q.id), true).ok())
            .collect()
    } else {
        vec![]
    }
}

/// Convert a QuestNode to an SNBT compound value
fn quest_to_snbt(node: &QuestNode, deps: Option<&Vec<String>>, flat_chapters: bool) -> Result<SnbtValue> {
    let mut m: HashMap<String, CommentedSnbt> = HashMap::new();

    m.insert("id".to_string(), ce(SnbtValue::String(node.id.clone())));
    m.insert("x".to_string(), ce(SnbtValue::Double(node.position.x)));
    m.insert("y".to_string(), ce(SnbtValue::Double(node.position.y)));

    // default_enabled: SideQuests have 0, regular Quests have 1 (explicit to override chapter default)
    if matches!(node.node_type, QuestNodeType::SideQuest) {
        m.insert("default_enabled".to_string(), ce(SnbtValue::Byte(0)));
    } else {
        m.insert("default_enabled".to_string(), ce(SnbtValue::Byte(1)));
    }

    if flat_chapters {
        if !node.label.is_empty() {
            m.insert("title".to_string(), ce(SnbtValue::String(node.label.clone())));
        }
    } else {
        m.insert("title".to_string(), ce(SnbtValue::String(node.label.clone())));
    }

    if !node.description.is_empty() {
        let desc_lines: Vec<SnbtValue> = node.description.lines()
            .map(|l| SnbtValue::String(l.to_string()))
            .collect();
        m.insert("description".to_string(), ce(SnbtValue::List(desc_lines)));
    }

    if !node.icon.is_empty() {
        if flat_chapters {
            m.insert("icon".to_string(), ce(icon_to_snbt(&node.icon)));
        } else {
            m.insert("icon".to_string(), ce(SnbtValue::String(node.icon.clone())));
        }
    }

    if !node.color.is_empty() {
        if let Some(c) = parse_hex_color(&node.color) {
            m.insert("color".to_string(), ce(SnbtValue::Int(c)));
        }
    }

    if !node.subtitle.is_empty() {
        m.insert("subtitle".to_string(), ce(SnbtValue::String(node.subtitle.clone())));
    }

    if node.shape.to_string() != "default" {
        m.insert("shape".to_string(), ce(SnbtValue::String(node.shape.to_string())));
    }

    match &node.visibility {
        QuestVisibility::AlwaysVisible => { m.insert("visibility".to_string(), ce(SnbtValue::String("always".to_string()))); }
        QuestVisibility::NeverVisible => { m.insert("visibility".to_string(), ce(SnbtValue::String("never".to_string()))); }
        QuestVisibility::WhenDependenciesComplete => { m.insert("visibility".to_string(), ce(SnbtValue::String("when_dependencies_complete".to_string()))); }
        QuestVisibility::WhenQuestComplete => { m.insert("visibility".to_string(), ce(SnbtValue::String("when_quest_complete".to_string()))); }
        QuestVisibility::WhenAllComplete => { m.insert("visibility".to_string(), ce(SnbtValue::String("when_all_complete".to_string()))); }
        _ => {}
    }

    if node.optional {
        m.insert("optional".to_string(), ce(SnbtValue::Byte(1)));
    }

    if node.silently_complete {
        m.insert("silently_complete".to_string(), ce(SnbtValue::Byte(1)));
    }

    if node.hide_quest_until_deps_complete {
        m.insert("hide_quest_until_deps_complete".to_string(), ce(SnbtValue::Byte(1)));
    }

    if node.hide_quest_until_quest_complete {
        m.insert("hide_quest_until_quest_complete".to_string(), ce(SnbtValue::Byte(1)));
    }

    if node.hide_quest_until_all_complete {
        m.insert("hide_quest_until_all_complete".to_string(), ce(SnbtValue::Byte(1)));
    }

    if node.sequential_tasks {
        m.insert("sequential_tasks".to_string(), ce(SnbtValue::Byte(1)));
    }

    if node.disable_completion_toast {
        m.insert("disable_completion_toast".to_string(), ce(SnbtValue::Byte(1)));
    }

    if node.ignore_reward_blocking {
        m.insert("ignore_reward_blocking".to_string(), ce(SnbtValue::Byte(1)));
    }

    if node.disable_jei_recipe {
        m.insert("default_quest_disable_jei".to_string(), ce(SnbtValue::Byte(1)));
    }

    if node.hide_dependency_lines {
        m.insert("hide_dependency_lines".to_string(), ce(SnbtValue::Byte(1)));
    }

    if node.hide_dependent_lines {
        m.insert("hide_dependent_lines".to_string(), ce(SnbtValue::Byte(1)));
    }

    if (node.icon_scaling - 1.0).abs() > f64::EPSILON {
        if flat_chapters {
            m.insert("icon_scale".to_string(), ce(SnbtValue::Double(node.icon_scaling)));
        } else {
            m.insert("icon_scaling".to_string(), ce(SnbtValue::Double(node.icon_scaling)));
        }
    }

    if node.min_window_width > 0 {
        m.insert("min_width".to_string(), ce(SnbtValue::Int(node.min_window_width)));
    }

    if node.invisible_until_completed {
        if flat_chapters {
            m.insert("invisible".to_string(), ce(SnbtValue::Byte(1)));
        } else {
            m.insert("invisible_until_completed".to_string(), ce(SnbtValue::Byte(1)));
        }
    }

    // Add dependencies from edges
    if let Some(dep_ids) = deps {
        if !dep_ids.is_empty() {
            let dep_values: Vec<SnbtValue> = dep_ids.iter()
                .map(|id| SnbtValue::String(id.clone()))
                .collect();
            m.insert("dependencies".to_string(), ce(SnbtValue::List(dep_values)));
        }
    }

    if node.invisible_until_x_tasks > 0 {
        m.insert("invisible_until_x_tasks".to_string(), ce(SnbtValue::Int(node.invisible_until_x_tasks)));
    }

    if node.hide_text_until_completed {
        m.insert("hide_text_until_completed".to_string(), ce(SnbtValue::Byte(1)));
    }

    if node.hide_details_until_startable {
        m.insert("hide_details_until_startable".to_string(), ce(SnbtValue::Byte(1)));
    }

    if node.min_required_dependencies > 0 {
        m.insert("min_required_dependencies".to_string(), ce(SnbtValue::Int(node.min_required_dependencies)));
    }

    if node.dependency_requirement.to_string() != "all_completed" {
        m.insert("dependency_requirement".to_string(), ce(SnbtValue::String(node.dependency_requirement.to_string())));
    }

    // Add dependencies from edges
    if let Some(deps) = deps {
        if !deps.is_empty() {
            let dep_values: Vec<SnbtValue> = deps.iter()
                .map(|d| SnbtValue::String(d.clone()))
                .collect();
            m.insert("dependencies".to_string(), ce(SnbtValue::List(dep_values)));
        }
    }

    if node.can_be_repeatable {
        m.insert("repeatability".to_string(), ce(SnbtValue::Int(1)));
        if node.repeat_time > 0 {
            m.insert("repeat_time".to_string(), ce(SnbtValue::Long(node.repeat_time)));
        }
        if node.repeat_min_delay > 0 {
            m.insert("repeat_min_delay".to_string(), ce(SnbtValue::Long(node.repeat_min_delay)));
        }
        if node.repeat_max_delay > 0 {
            m.insert("repeat_max_delay".to_string(), ce(SnbtValue::Long(node.repeat_max_delay)));
        }
    }

    if node.disable_reward {
        m.insert("disable_reward".to_string(), ce(SnbtValue::Byte(1)));
    }

    if node.pause_reward {
        m.insert("pause_reward".to_string(), ce(SnbtValue::Byte(1)));
    }

    if !node.lock_icon.is_empty() {
        if flat_chapters {
            m.insert("lock_icon".to_string(), ce(icon_to_snbt(&node.lock_icon)));
        } else {
            m.insert("lock_icon".to_string(), ce(SnbtValue::String(node.lock_icon.clone())));
        }
    }

    if !node.quest_background.is_empty() {
        m.insert("quest_background".to_string(), ce(SnbtValue::String(node.quest_background.clone())));
    }

    if node.progression_mode.to_string() != "default" {
        m.insert("progression_mode".to_string(), ce(SnbtValue::String(node.progression_mode.to_string())));
    }

    // Size: FlatChapters uses single double, Subdirs uses list
    if node.size.width != 24.0 || node.size.height != 24.0 {
        if flat_chapters {
            m.insert("size".to_string(), ce(SnbtValue::Double((node.size.width / 24.0).max(node.size.height / 24.0))));
        } else {
            m.insert("size".to_string(), ce(SnbtValue::List(vec![
                SnbtValue::Double(node.size.width),
                SnbtValue::Double(node.size.height),
            ])));
        }
    }

    // Tasks
    if !node.objectives.is_empty() {
        let task_values: Vec<SnbtValue> = node.objectives.iter()
            .filter_map(|o| objective_to_snbt_task(o, flat_chapters).ok())
            .collect();
        m.insert("tasks".to_string(), ce(SnbtValue::List(task_values)));
    }

    // Rewards
    if !node.rewards.is_empty() {
        let reward_values: Vec<SnbtValue> = node.rewards.iter()
            .filter_map(|r| reward_to_snbt(r, flat_chapters).ok())
            .collect();
        m.insert("rewards".to_string(), ce(SnbtValue::List(reward_values)));
    }

    Ok(SnbtValue::Compound(m))
}

/// Convert a QuestObjective to an SNBT task compound
fn objective_to_snbt_task(obj: &QuestObjective, flat_chapters: bool) -> Result<SnbtValue> {
    let mut m: HashMap<String, CommentedSnbt> = HashMap::new();

    m.insert("id".to_string(), ce(SnbtValue::String(obj.id.clone())));
    if !obj.label.is_empty() {
        m.insert("title".to_string(), ce(SnbtValue::String(obj.label.clone())));
    }

    let (ftb_type, extra_fields) = match &obj.objective_type {
        ObjectiveType::ItemAcquisition => ("item", vec![
            ("item".to_string(), if flat_chapters {
                ce(item_compound(&obj.target, obj.target_count))
            } else {
                ce(SnbtValue::String(obj.target.clone()))
            }),
        ]),
        ObjectiveType::ItemRetrieval => ("item", vec![
            ("item".to_string(), if flat_chapters {
                ce(item_compound(&obj.target, obj.target_count))
            } else {
                ce(SnbtValue::String(obj.target.clone()))
            }),
        ]),
        ObjectiveType::ItemCrafting => ("item", vec![
            ("item".to_string(), if flat_chapters {
                ce(item_compound(&obj.target, obj.target_count))
            } else {
                ce(SnbtValue::String(obj.target.clone()))
            }),
        ]),
        ObjectiveType::EntityKill => ("kill", vec![
            ("entity".to_string(), ce(SnbtValue::String(obj.target.clone()))),
        ]),
        ObjectiveType::LocationVisit => if flat_chapters {
            // FlatChapters uses 'dimension' type for dimension-only checks
            if obj.x == 0.0 && obj.y == 0.0 && obj.z == 0.0 && !obj.dimension.is_empty() {
                ("dimension", vec![
                    ("dimension".to_string(), ce(SnbtValue::String(obj.dimension.clone()))),
                ])
            } else {
                ("location", vec![
                    ("dimension".to_string(), ce(SnbtValue::String(obj.dimension.clone()))),
                    ("x".to_string(), ce(SnbtValue::Double(obj.x))),
                    ("y".to_string(), ce(SnbtValue::Double(obj.y))),
                    ("z".to_string(), ce(SnbtValue::Double(obj.z))),
                    ("radius".to_string(), ce(SnbtValue::Double(obj.radius))),
                ])
            }
        } else {
            ("location", vec![
                ("dimension".to_string(), ce(SnbtValue::String(obj.dimension.clone()))),
                ("x".to_string(), ce(SnbtValue::Double(obj.x))),
                ("y".to_string(), ce(SnbtValue::Double(obj.y))),
                ("z".to_string(), ce(SnbtValue::Double(obj.z))),
                ("radius".to_string(), ce(SnbtValue::Double(obj.radius))),
            ])
        },
        ObjectiveType::Advancement => ("advancement", vec![
            ("advancement".to_string(), ce(SnbtValue::String(obj.advancement_id.clone()))),
        ]),
        ObjectiveType::Checkmark => ("checkmark", vec![]),
        ObjectiveType::Xp => ("xp", vec![
            ("xp".to_string(), ce(SnbtValue::Int(obj.xp_points))),
            ("levels".to_string(), ce(SnbtValue::Int(obj.xp_levels))),
        ]),
        ObjectiveType::Fluid => ("fluid", vec![
            ("fluid".to_string(), ce(SnbtValue::String(obj.fluid_id.clone()))),
            ("amount".to_string(), ce(SnbtValue::Double(obj.fluid_amount))),
        ]),
        ObjectiveType::Energy => ("energy", vec![
            ("amount".to_string(), ce(SnbtValue::Double(obj.energy_amount))),
            ("unit".to_string(), ce(SnbtValue::String(obj.energy_unit.clone()))),
        ]),
        ObjectiveType::Stat => ("stat", vec![
            ("stat".to_string(), ce(SnbtValue::String(obj.stat_name.clone()))),
            ("count".to_string(), ce(SnbtValue::Int(obj.stat_value))),
        ]),
        ObjectiveType::Observation => ("observation", vec![
            ("range".to_string(), ce(SnbtValue::Double(obj.observation_range))),
        ]),
        ObjectiveType::VisitBiome => ("biome", vec![
            ("biome".to_string(), ce(SnbtValue::String(obj.biome_id.clone()))),
        ]),
        ObjectiveType::FindStructure => ("structure", vec![
            ("structure".to_string(), ce(SnbtValue::String(obj.structure_id.clone()))),
        ]),
        ObjectiveType::GameStage => ("stage", vec![
            ("stage".to_string(), ce(SnbtValue::String(obj.advancement_id.clone()))),
        ]),
        ObjectiveType::BlockBreak => ("block_break", vec![
            ("item".to_string(), if flat_chapters {
                ce(item_compound(&obj.target, 1))
            } else {
                ce(SnbtValue::String(obj.target.clone()))
            }),
        ]),
        ObjectiveType::BlockPlace => ("block_place", vec![
            ("item".to_string(), if flat_chapters {
                ce(item_compound(&obj.target, 1))
            } else {
                ce(SnbtValue::String(obj.target.clone()))
            }),
        ]),
        ObjectiveType::Command => ("custom", vec![
            ("command".to_string(), ce(SnbtValue::String(obj.command.clone()))),
        ]),
        ObjectiveType::Image => ("custom", vec![]),
        ObjectiveType::Custom => ("custom", vec![
            ("custom".to_string(), ce(SnbtValue::String(obj.custom_json.clone()))),
            ("max_progress".to_string(), ce(SnbtValue::Int(obj.target_count))),
        ]),
    };

    m.insert("type".to_string(), ce(SnbtValue::String(ftb_type.to_string())));

    if obj.target_count > 1 && !matches!(obj.objective_type, ObjectiveType::Xp | ObjectiveType::Fluid | ObjectiveType::Energy | ObjectiveType::Stat | ObjectiveType::Observation | ObjectiveType::ItemAcquisition | ObjectiveType::ItemRetrieval | ObjectiveType::ItemCrafting) {
        m.insert("count".to_string(), ce(SnbtValue::Long(obj.target_count as i64)));
    }

    for (key, val) in extra_fields {
        m.insert(key, val);
    }

    if !obj.required {
        m.insert("optional".to_string(), ce(SnbtValue::Byte(1)));
    }

    if !obj.nbt_data.is_empty() {
        if let Ok(comp) = crate::imports::snbt::parse_snbt(&obj.nbt_data) {
            if let Some(cm) = comp.as_compound() {
                m.insert("components".to_string(), ce(SnbtValue::Compound(cm.clone())));
            } else {
                m.insert("nbt".to_string(), ce(SnbtValue::String(obj.nbt_data.clone())));
            }
        } else {
            m.insert("nbt".to_string(), ce(SnbtValue::String(obj.nbt_data.clone())));
        }
    }

    if !obj.item_tag.is_empty() {
        m.insert("tag".to_string(), ce(SnbtValue::String(obj.item_tag.clone())));
    }

    if obj.consume_items {
        m.insert("consume_items".to_string(), ce(SnbtValue::Byte(1)));
    }

    if obj.match_nbt {
        m.insert("match_nbt".to_string(), ce(SnbtValue::Byte(1)));
    }

    if obj.ignore_nbt {
        m.insert("ignore_nbt".to_string(), ce(SnbtValue::Byte(1)));
    }

    Ok(SnbtValue::Compound(m))
}

/// Convert a QuestReward to an SNBT reward compound
fn reward_to_snbt(reward: &QuestReward, flat_chapters: bool) -> Result<SnbtValue> {
    let mut m: HashMap<String, CommentedSnbt> = HashMap::new();

    m.insert("id".to_string(), ce(SnbtValue::String(reward.id.clone())));
    if !reward.label.is_empty() {
        m.insert("title".to_string(), ce(SnbtValue::String(reward.label.clone())));
    }

    let (ftb_type, extra_fields) = match &reward.reward_type {
        RewardType::Item => ("item", vec![
            ("item".to_string(), if flat_chapters {
                ce(item_compound(&reward.item_id, reward.item_count))
            } else {
                ce(SnbtValue::String(reward.item_id.clone()))
            }),
        ]),
        RewardType::ItemWithWeight => ("item", vec![
            ("item".to_string(), if flat_chapters {
                ce(item_compound(&reward.item_id, reward.item_count))
            } else {
                ce(SnbtValue::String(reward.item_id.clone()))
            }),
            ("weight".to_string(), ce(SnbtValue::Double(reward.weight))),
        ]),
        RewardType::Experience => ("xp", vec![
            ("xp".to_string(), ce(SnbtValue::Int(reward.xp_amount))),
        ]),
        RewardType::XpLevels => ("levels", vec![
            ("levels".to_string(), ce(SnbtValue::Int(reward.xp_levels))),
        ]),
        RewardType::Command => ("command", vec![
            ("command".to_string(), ce(SnbtValue::String(reward.command.clone()))),
        ]),
        RewardType::LootTable => ("loot", vec![
            ("loot_table".to_string(), ce(SnbtValue::String(reward.loot_table.clone()))),
        ]),
        RewardType::Choice => ("choice", vec![]),
        RewardType::Random => ("random", vec![]),
        RewardType::AllTable => ("all", vec![]),
        RewardType::Advancement => ("advancement", vec![
            ("advancement".to_string(), ce(SnbtValue::String(reward.item_id.clone()))),
        ]),
        RewardType::Toast => ("toast", vec![
            ("message".to_string(), ce(SnbtValue::String(reward.toast_message.clone()))),
        ]),
        RewardType::Unlock => ("unlock", vec![
            ("stage".to_string(), ce(SnbtValue::String(reward.game_stage.clone()))),
        ]),
        RewardType::GameStage => ("stage", vec![
            ("stage".to_string(), ce(SnbtValue::String(reward.game_stage.clone()))),
        ]),
        RewardType::Custom => ("item", vec![]),
    };

    m.insert("type".to_string(), ce(SnbtValue::String(ftb_type.to_string())));

    for (key, val) in extra_fields {
        m.insert(key, val);
    }

    // Items list for choice/random/all rewards
    if !reward.items.is_empty() {
        let items_map: HashMap<String, CommentedSnbt> = reward.items.iter().enumerate()
            .map(|(i, item)| {
                let mut item_m: HashMap<String, CommentedSnbt> = HashMap::new();
                item_m.insert("item".to_string(), if flat_chapters {
                    ce(item_compound(item, 1))
                } else {
                    ce(SnbtValue::String(item.clone()))
                });
                (i.to_string(), ce(SnbtValue::Compound(item_m)))
            })
            .collect();
        m.insert("items".to_string(), ce(SnbtValue::Compound(items_map)));
    }

    if reward.item_count > 1 {
        if let Some(item_val) = m.get("item").cloned() {
            match &item_val.value {
                SnbtValue::String(item_str) => {
                    let mut item_m: HashMap<String, CommentedSnbt> = HashMap::new();
                    item_m.insert("id".to_string(), ce(SnbtValue::String(item_str.clone())));
                    item_m.insert("count".to_string(), ce(SnbtValue::Int(reward.item_count)));
                    m.insert("item".to_string(), ce(SnbtValue::Compound(item_m)));
                }
                SnbtValue::Compound(comp) => {
                    let mut extended = comp.clone();
                    extended.insert("count".to_string(), ce(SnbtValue::Int(reward.item_count)));
                    m.insert("item".to_string(), ce(SnbtValue::Compound(extended)));
                }
                _ => {}
            }
        }
    }

    // 1.20.5+ Data Components
    if !reward.nbt_data.is_empty() {
        if let Ok(comp) = crate::imports::snbt::parse_snbt(&reward.nbt_data) {
            if let Some(cm) = comp.as_compound() {
                m.insert("components".to_string(), ce(SnbtValue::Compound(cm.clone())));
            } else {
                m.insert("nbt".to_string(), ce(SnbtValue::String(reward.nbt_data.clone())));
            }
        } else {
            m.insert("nbt".to_string(), ce(SnbtValue::String(reward.nbt_data.clone())));
        }
    }

    if !reward.item_tag.is_empty() {
        m.insert("tag".to_string(), ce(SnbtValue::String(reward.item_tag.clone())));
    }

    if reward.consume_items {
        m.insert("consume_items".to_string(), ce(SnbtValue::Byte(1)));
    }

    if reward.match_nbt {
        m.insert("match_nbt".to_string(), ce(SnbtValue::Byte(1)));
    }

    if reward.ignore_nbt {
        m.insert("ignore_nbt".to_string(), ce(SnbtValue::Byte(1)));
    }

    Ok(SnbtValue::Compound(m))
}

// ─── Helpers ───────────────────────────────────────────────────────────────

fn sanitize_filename(s: &str) -> String {
    s.chars().map(|c| {
        if c.is_alphanumeric() || c == '_' || c == '-' { c } else { '_' }
    }).collect::<String>().trim_matches('_').to_string()
}

fn parse_hex_color(s: &str) -> Option<i32> {
    let s = s.trim_start_matches('#');
    if s.len() == 6 {
        u32::from_str_radix(s, 16).ok().map(|v| v as i32)
    } else {
        None
    }
}


