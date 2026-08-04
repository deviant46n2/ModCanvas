use crate::imports::snbt::{SnbtValue, CommentedSnbt, compound_to_snbt};
use super::snbt_sidecar;
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

fn item_compound(item_id: &str, count: i32, smart_filter: &str) -> SnbtValue {
    // FTB Filter System smart filter: emit nested item Data Components form
    if !smart_filter.is_empty() {
        let mut components: HashMap<String, CommentedSnbt> = HashMap::new();
        components.insert("ftbfiltersystem:filter".to_string(), ce(SnbtValue::String(smart_filter.to_string())));
        let mut m: HashMap<String, CommentedSnbt> = HashMap::new();
        m.insert("components".to_string(), ce(SnbtValue::Compound(components)));
        m.insert("count".to_string(), ce(SnbtValue::Int(count)));
        m.insert("id".to_string(), ce(SnbtValue::String("ftbfiltersystem:smart_filter".to_string())));
        return SnbtValue::Compound(m);
    }
    let mut m: HashMap<String, CommentedSnbt> = HashMap::new();
    m.insert("id".to_string(), ce(SnbtValue::String(item_id.to_string())));
    if count > 1 {
        m.insert("count".to_string(), ce(SnbtValue::Int(count)));
    }
    SnbtValue::Compound(m)
}

/// Item value for a task/reward `item` field. Flat-chapter layouts use the
/// compound form; subdirs layouts use a plain string — except smart filters,
/// which must always keep the nested Data Components form.
fn item_value(item_id: &str, count: i32, smart_filter: &str, flat_chapters: bool) -> SnbtValue {
    if !smart_filter.is_empty() {
        return item_compound(item_id, count, smart_filter);
    }
    if flat_chapters {
        item_compound(item_id, count, "")
    } else {
        SnbtValue::String(item_id.to_string())
    }
}

fn chapter_image_to_snbt(img: &ChapterImage) -> SnbtValue {
    let mut m: HashMap<String, CommentedSnbt> = HashMap::new();
    m.insert("image".to_string(), ce(SnbtValue::String(img.image.clone())));
    m.insert("x".to_string(), ce(SnbtValue::Double(img.x)));
    m.insert("y".to_string(), ce(SnbtValue::Double(img.y)));
    m.insert("width".to_string(), ce(SnbtValue::Double(img.width)));
    m.insert("height".to_string(), ce(SnbtValue::Double(img.height)));
    if img.rotation != 0.0 {
        m.insert("rotation".to_string(), ce(SnbtValue::Double(img.rotation)));
    }
    if img.scale != 1.0 {
        m.insert("scale".to_string(), ce(SnbtValue::Double(img.scale)));
    }
    if img.order != 0 {
        m.insert("order".to_string(), ce(SnbtValue::Int(img.order)));
    }
    if img.alpha != 255 {
        m.insert("alpha".to_string(), ce(SnbtValue::Int(img.alpha as i32)));
    }
    if img.color != 0 {
        m.insert("color".to_string(), ce(SnbtValue::Int(img.color)));
    }
    if !img.click.is_empty() {
        m.insert("click".to_string(), ce(SnbtValue::String(img.click.clone())));
    }
    if !img.hover.is_empty() {
        let hover: Vec<SnbtValue> = img.hover.iter().map(|h| SnbtValue::String(h.clone())).collect();
        m.insert("hover".to_string(), ce(SnbtValue::List(hover)));
    }
    SnbtValue::Compound(m)
}

fn chapter_images_to_snbt(images: &[ChapterImage]) -> SnbtValue {
    SnbtValue::List(images.iter().map(chapter_image_to_snbt).collect())
}

/// Export a QuestGraph as FTB Quests SNBT files to a directory (both Subdirs and FlatChapters formats)
///
/// `sidecar` is the raw-SNBT map returned from `import_ftb_quests`.  When
/// non-empty, the exporter re-parses the original SNBT to recover user comments
/// and merges them into the output for unchanged fields.
pub fn export_ftb_quests_snbt(graph: &QuestGraph, output_dir: &Path, sidecar: &snbt_sidecar::SnbtSidecar) -> Result<()> {
    let quests_dir = output_dir.join("config").join("ftbquests").join("quests");
    std::fs::create_dir_all(&quests_dir)?;

    // Write data.snbt
    let mut data_map = HashMap::new();
    data_map.insert("version".to_string(), ce(SnbtValue::Int(13)));
    if graph.default_reward_team {
        data_map.insert("default_reward_team".to_string(), ce(SnbtValue::Byte(1)));
    } else {
        data_map.insert("default_reward_team".to_string(), ce(SnbtValue::Byte(0)));
    }
    if graph.default_consume_items {
        data_map.insert("default_consume_items".to_string(), ce(SnbtValue::Byte(1)));
    } else {
        data_map.insert("default_consume_items".to_string(), ce(SnbtValue::Byte(0)));
    }
    let autoclaim = if graph.default_autoclaim_rewards.is_empty() {
        "disabled".to_string()
    } else {
        graph.default_autoclaim_rewards.clone()
    };
    data_map.insert("default_autoclaim_rewards".to_string(), ce(SnbtValue::String(autoclaim)));
    data_map.insert("default_quest_shape".to_string(), ce(SnbtValue::String(graph.default_quest_shape.to_string())));
    data_map.insert("progression_mode".to_string(), ce(SnbtValue::String(graph.book_progression_mode.to_string())));
    data_map.insert("grid_scale".to_string(), ce(SnbtValue::Double(graph.grid_scale)));
    data_map.insert("detection_delay".to_string(), ce(SnbtValue::Int(graph.detection_delay)));
    data_map.insert("emergency_items_cooldown".to_string(), ce(SnbtValue::Int(graph.emergency_items_cooldown)));
    data_map.insert("lock_message".to_string(), ce(SnbtValue::String(graph.lock_message.clone())));
    data_map.insert("show_lock_icons".to_string(), ce(SnbtValue::Byte(if graph.show_lock_icons { 1 } else { 0 })));
    data_map.insert("fallback_locale".to_string(), ce(SnbtValue::String(graph.fallback_locale.clone())));
    data_map.insert("disable_gui".to_string(), ce(SnbtValue::Byte(if graph.disable_gui { 1 } else { 0 })));
    data_map.insert("pause_game".to_string(), ce(SnbtValue::Byte(if graph.pause_game { 1 } else { 0 })));
    data_map.insert("drop_book_on_death".to_string(), ce(SnbtValue::Byte(if graph.drop_book_on_death { 1 } else { 0 })));
    data_map.insert("drop_loot_crates".to_string(), ce(SnbtValue::Byte(if graph.drop_loot_crates { 1 } else { 0 })));
    data_map.insert("hide_excluded_quests".to_string(), ce(SnbtValue::Byte(if graph.hide_excluded_quests { 1 } else { 0 })));
    data_map.insert("verify_on_load".to_string(), ce(SnbtValue::Byte(if graph.verify_on_load { 1 } else { 0 })));
    data_map.insert("default_quest_disable_jei".to_string(), ce(SnbtValue::Byte(if graph.default_quest_disable_jei { 1 } else { 0 })));
    let loot_crate_map = HashMap::from([
        ("boss".to_string(), ce(SnbtValue::Int(graph.loot_crate_no_drop.boss))),
        ("monster".to_string(), ce(SnbtValue::Int(graph.loot_crate_no_drop.monster))),
        ("passive".to_string(), ce(SnbtValue::Int(graph.loot_crate_no_drop.passive))),
    ]);
    data_map.insert("loot_crate_no_drop".to_string(), ce(SnbtValue::Compound(loot_crate_map)));
    if !graph.emergency_items.is_empty() {
        let items: Vec<SnbtValue> = graph.emergency_items.iter().map(|item| {
            let mut m = HashMap::new();
            m.insert("id".to_string(), ce(SnbtValue::String(item.id.clone())));
            m.insert("count".to_string(), ce(SnbtValue::Int(item.count)));
            SnbtValue::Compound(m)
        }).collect();
        data_map.insert("emergency_items".to_string(), ce(SnbtValue::List(items)));
    }
    crate::path_safety::atomic_write_str(&quests_dir.join("data.snbt"), &compound_to_snbt(&data_map))
        .map_err(|e| anyhow::anyhow!("{e}"))?;

    // Group quests by chapter
    let mut chapter_quests: HashMap<String, Vec<&QuestNode>> = HashMap::new();
    for node in &graph.nodes {
        if matches!(node.node_type, QuestNodeType::Quest | QuestNodeType::SideQuest | QuestNodeType::Reward | QuestNodeType::Gate | QuestNodeType::QuestLink) {
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

        let mut chapter_map = build_subdirs_chapter_map(chapter_node, chapter_meta, &filename);

        // Try sidecar merge: preserve comments on unchanged chapter/quest fields
        let quests_for_chapter: Vec<SnbtValue> = chapter_quests.get(&chapter_node.id)
            .map(|quests| quests.iter()
                .filter_map(|q| quest_to_snbt(q, deps_map.get(&q.id), false).ok())
                .collect())
            .unwrap_or_default();

        if let Some(merged) = snbt_sidecar::merge_quests_in_chapter(sidecar, &chapter_node.id, &chapter_map, &quests_for_chapter) {
            chapter_map = merged;
        } else {
            chapter_map.insert("quests".to_string(), ce(SnbtValue::List(quests_for_chapter)));
        }

        let chapter_snbt = SnbtValue::Compound(chapter_map);
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

        // Always set/update id, filename
        chapter_compound.insert("id".to_string(), ce(SnbtValue::String(chapter_node.id.clone())));
        chapter_compound.insert("filename".to_string(), ce(SnbtValue::String(filename.to_string())));

        // Try sidecar merge: preserve comments on unchanged quest fields
        if let Some(merged) = snbt_sidecar::merge_quests_in_chapter(sidecar, &chapter_node.id, &chapter_compound, &new_quests) {
            chapter_compound = merged;
        } else {
            // Fallback: no sidecar data, just insert quests directly
            let quests = build_flat_chapters_quests(chapter_node, &chapter_quests, &deps_map);
            chapter_compound.insert("quests".to_string(), ce(SnbtValue::List(quests)));
        }

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
            // Write the decorations array from the graph, overriding whatever was
            // preserved from the existing file so placement edits persist.
            if !meta.images.is_empty() || chapter_compound.contains_key("images") {
                chapter_compound.insert("images".to_string(), ce(chapter_images_to_snbt(&meta.images)));
            }
        }

        crate::path_safety::atomic_write_str(&chapter_path, &compound_to_snbt(&chapter_compound))
            .map_err(|e| anyhow::anyhow!("{e}"))?;
    }

    // Export chapter groups (quests_dir/chapter_groups.snbt). FTB reads group
    // membership either from this file or from the per-chapter `group` key; we
    // write both so the ordering and titles round-trip cleanly.
    if !graph.chapter_groups.is_empty() {
        let mut groups = graph.chapter_groups.clone();
        groups.sort_by_key(|g| g.order_index);
        let group_values: Vec<SnbtValue> = groups
            .iter()
            .map(|g| {
                let mut m: HashMap<String, CommentedSnbt> = HashMap::new();
                m.insert("id".to_string(), ce(SnbtValue::String(g.id.clone())));
                if !g.title.is_empty() {
                    m.insert("title".to_string(), ce(SnbtValue::String(g.title.clone())));
                }
                SnbtValue::Compound(m)
            })
            .collect();
        let mut groups_compound: HashMap<String, CommentedSnbt> = HashMap::new();
        groups_compound.insert("chapter_groups".to_string(), ce(SnbtValue::List(group_values)));
        crate::path_safety::atomic_write_str(
            &quests_dir.join("chapter_groups.snbt"),
            &compound_to_snbt(&groups_compound),
        )
        .map_err(|e| anyhow::anyhow!("{e}"))?;
    }

    // Export reward tables (quests_dir/reward_tables/<hex_id>.snbt). Random/choice
    // rewards reference these by `table_id`; FTB keys the file by the 16-digit
    // uppercase hex form of the id.
    if !graph.reward_tables.is_empty() {
        let reward_tables_dir = quests_dir.join("reward_tables");
        std::fs::create_dir_all(&reward_tables_dir)?;
        let mut tables = graph.reward_tables.clone();
        tables.sort_by_key(|t| t.order_index);
        for (order_index, table) in tables.iter().enumerate() {
            let hex_id = if table.id.len() == 16 {
                table.id.clone()
            } else {
                RewardTable::to_hex_id(RewardTable::to_long_id(&table.id))
            };
            let mut m: HashMap<String, CommentedSnbt> = HashMap::new();
            m.insert("id".to_string(), ce(SnbtValue::String(hex_id.clone())));
            m.insert("order_index".to_string(), ce(SnbtValue::Int(order_index as i32)));
            if !table.title.is_empty() {
                m.insert("title".to_string(), ce(SnbtValue::String(table.title.clone())));
            }
            if table.loot_size > 0 {
                m.insert("loot_size".to_string(), ce(SnbtValue::Int(table.loot_size)));
            }
            if table.empty_weight > 0.0 {
                m.insert("empty_weight".to_string(), ce(SnbtValue::Float(table.empty_weight as f32)));
            }
            if table.hide_tooltip {
                m.insert("hide_tooltip".to_string(), ce(SnbtValue::Byte(1)));
            }
            if table.use_title {
                m.insert("use_title".to_string(), ce(SnbtValue::Byte(1)));
            }
            let reward_list: Vec<SnbtValue> = table.rewards.iter()
                .filter_map(|r| reward_to_snbt(r, true).ok())
                .collect();
            m.insert("rewards".to_string(), ce(SnbtValue::List(reward_list)));

            crate::path_safety::atomic_write_str(
                &reward_tables_dir.join(format!("{hex_id}.snbt")),
                &compound_to_snbt(&m),
            )
            .map_err(|e| anyhow::anyhow!("{e}"))?;
        }
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
    let mut chapter_map = build_subdirs_chapter_map(chapter_node, chapter_meta, filename);

    if let Some(quests) = chapter_quests.get(&chapter_node.id) {
        let quest_snbt_values: Vec<SnbtValue> = quests.iter()
            .filter_map(|q| quest_to_snbt(q, deps_map.get(&q.id), false).ok())
            .collect();
        chapter_map.insert("quests".to_string(), ce(SnbtValue::List(quest_snbt_values)));
    }

    SnbtValue::Compound(chapter_map)
}

/// Build a chapter SNBT map without the quests list. Used by the sidecar merge
/// path where quests are inserted separately.
fn build_subdirs_chapter_map(
    chapter_node: &QuestNode,
    chapter_meta: Option<&QuestChapter>,
    filename: &str,
) -> HashMap<String, CommentedSnbt> {
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
        if !meta.images.is_empty() {
            chapter_map.insert("images".to_string(), ce(chapter_images_to_snbt(&meta.images)));
        }
        // Visibility & layout defaults (mirrors Chapter.java:178-196)
        if !meta.subtitle.is_empty() {
            chapter_map.insert("subtitle".to_string(), ce(SnbtValue::String(meta.subtitle.clone())));
        }
        if meta.always_invisible {
            chapter_map.insert("always_invisible".to_string(), ce(SnbtValue::Byte(1)));
        }
        if meta.default_min_width > 0 {
            chapter_map.insert("default_min_width".to_string(), ce(SnbtValue::Int(meta.default_min_width)));
        }
        let default_size_scalar = meta.default_quest_size.width / 24.0;
        if (default_size_scalar - 1.0).abs() > f64::EPSILON {
            chapter_map.insert("default_quest_size".to_string(), ce(SnbtValue::Double(default_size_scalar)));
        }
        if meta.default_hide_dependency_lines {
            chapter_map.insert("default_hide_dependency_lines".to_string(), ce(SnbtValue::Byte(1)));
        }
        if meta.hide_quest_details_until_startable {
            chapter_map.insert("hide_quest_details_until_startable".to_string(), ce(SnbtValue::Byte(1)));
        }
        if meta.hide_quest_until_deps_visible {
            chapter_map.insert("hide_quest_until_deps_visible".to_string(), ce(SnbtValue::Byte(1)));
        }
        if meta.hide_quest_until_deps_complete {
            chapter_map.insert("hide_quest_until_deps_complete".to_string(), ce(SnbtValue::Byte(1)));
        }
        if meta.hide_text_until_complete {
            chapter_map.insert("hide_text_until_complete".to_string(), ce(SnbtValue::Byte(1)));
        }
        if !meta.autofocus_id.is_empty() {
            chapter_map.insert("autofocus_id".to_string(), ce(SnbtValue::String(meta.autofocus_id.clone())));
        }
        if meta.default_repeatable {
            chapter_map.insert("default_repeatable_quest".to_string(), ce(SnbtValue::Byte(1)));
        }
        if meta.require_sequential_tasks {
            chapter_map.insert("require_sequential_tasks".to_string(), ce(SnbtValue::Byte(1)));
        }
        if meta.progression_mode.to_string() != "default" {
            chapter_map.insert("progression_mode".to_string(), ce(SnbtValue::String(meta.progression_mode.to_string())));
        }
    }

    chapter_map
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

    // QuestLink nodes serialize as a reference to another quest — no tasks,
    // no rewards, no dependency/default_enabled fields.
    if matches!(node.node_type, QuestNodeType::QuestLink) {
        if !node.link_target.is_empty() {
            m.insert("linked_quest".to_string(), ce(SnbtValue::String(node.link_target.clone())));
        }
        if !node.label.is_empty() {
            m.insert("title".to_string(), ce(SnbtValue::String(node.label.clone())));
        }
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
        return Ok(SnbtValue::Compound(m));
    }

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
        // `icon_scale` is read by the game in both flat and subdirs layouts.
        m.insert("icon_scale".to_string(), ce(SnbtValue::Double(node.icon_scaling)));
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
        m.insert("can_repeat".to_string(), ce(SnbtValue::Byte(1)));
        let cooldown = if node.repeat_cooldown > 0 {
            node.repeat_cooldown
        } else if node.repeat_time > 0 {
            node.repeat_time
        } else {
            0
        };
        if cooldown > 0 {
            m.insert("repeat_cooldown".to_string(), ce(SnbtValue::Int(cooldown as i32)));
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

    if node.hide_lock_icon {
        m.insert("hide_lock_icon".to_string(), ce(SnbtValue::Byte(1)));
    }

    if !node.guide_page.is_empty() {
        m.insert("guide_page".to_string(), ce(SnbtValue::String(node.guide_page.clone())));
    }

    if node.max_completable_dependents > 0 {
        m.insert("max_completable_dependents".to_string(), ce(SnbtValue::Int(node.max_completable_dependents)));
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
            ("item".to_string(), ce(item_value(&obj.target, obj.target_count, &obj.smart_filter, flat_chapters))),
        ]),
        ObjectiveType::ItemRetrieval => ("item", vec![
            ("item".to_string(), ce(item_value(&obj.target, obj.target_count, &obj.smart_filter, flat_chapters))),
        ]),
        ObjectiveType::ItemCrafting => ("item", vec![
            ("item".to_string(), ce(item_value(&obj.target, obj.target_count, &obj.smart_filter, flat_chapters))),
        ]),
        ObjectiveType::EntityKill => {
            let mut fields = vec![
                ("entity".to_string(), ce(SnbtValue::String(obj.target.clone()))),
            ];
            if !obj.entity_type_tag.is_empty() {
                fields.push(("entityTypeTag".to_string(), ce(SnbtValue::String(obj.entity_type_tag.clone()))));
            }
            if obj.target_count > 1 {
                fields.push(("value".to_string(), ce(SnbtValue::Long(obj.target_count as i64))));
            }
            if !obj.custom_name.is_empty() {
                fields.push(("custom_name".to_string(), ce(SnbtValue::String(obj.custom_name.clone()))));
            }
            if !obj.nbt_filter.is_empty() {
                fields.push(("nbt_filter".to_string(), ce(SnbtValue::String(obj.nbt_filter.clone()))));
            }
            ("kill", fields)
        }
        ObjectiveType::LocationVisit => {
            let (w, h, d) = if obj.box_w > 0.0 || obj.box_h > 0.0 || obj.box_d > 0.0 {
                (obj.box_w.max(1.0), obj.box_h.max(1.0), obj.box_d.max(1.0))
            } else {
                (1.0, 1.0, 1.0)
            };
            let is_dimension_only = obj.x == 0.0 && obj.y == 0.0 && obj.z == 0.0 && w == 1.0 && h == 1.0 && d == 1.0;
            if flat_chapters && is_dimension_only && !obj.dimension.is_empty() {
                // FlatChapters uses the 'dimension' type for dimension-only checks
                ("dimension", vec![
                    ("dimension".to_string(), ce(SnbtValue::String(obj.dimension.clone()))),
                ])
            } else {
                ("location", vec![
                    ("dimension".to_string(), ce(SnbtValue::String(obj.dimension.clone()))),
                    ("ignore_dimension".to_string(), ce(SnbtValue::Byte(obj.ignore_dim as i8))),
                    ("position".to_string(), ce(SnbtValue::IntArray(vec![obj.x as i32, obj.y as i32, obj.z as i32]))),
                    ("size".to_string(), ce(SnbtValue::IntArray(vec![w as i32, h as i32, d as i32]))),
                ])
            }
        }
        ObjectiveType::Advancement => {
            let mut fields = vec![
                ("advancement".to_string(), ce(SnbtValue::String(obj.advancement_id.clone()))),
            ];
            if !obj.criterion.is_empty() {
                fields.push(("criterion".to_string(), ce(SnbtValue::String(obj.criterion.clone()))));
            }
            ("advancement", fields)
        }
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
        ObjectiveType::GameStage => {
            let mut fields = vec![
                ("stage".to_string(), ce(SnbtValue::String(obj.advancement_id.clone()))),
            ];
            if obj.team_stage {
                fields.push(("team_stage".to_string(), ce(SnbtValue::Byte(1))));
            }
            ("stage", fields)
        }
        ObjectiveType::BlockBreak => ("block_break", vec![
            ("item".to_string(), ce(item_value(&obj.target, 1, &obj.smart_filter, flat_chapters))),
        ]),
        ObjectiveType::BlockPlace => ("block_place", vec![
            ("item".to_string(), ce(item_value(&obj.target, 1, &obj.smart_filter, flat_chapters))),
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

    if obj.target_count > 1 && !matches!(obj.objective_type, ObjectiveType::Xp | ObjectiveType::Fluid | ObjectiveType::Energy | ObjectiveType::Stat | ObjectiveType::Observation | ObjectiveType::EntityKill) {
        m.insert("count".to_string(), ce(SnbtValue::Long(obj.target_count as i64)));
    }

    for (key, val) in extra_fields {
        m.insert(key, val);
    }

    if !obj.required {
        // FTB tasks serialize the optional flag under `optional_task` (quests use `optional`).
        m.insert("optional_task".to_string(), ce(SnbtValue::Byte(1)));
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

    if obj.task_screen_only {
        m.insert("task_screen_only".to_string(), ce(SnbtValue::Byte(1)));
    }

    if obj.only_from_crafting {
        m.insert("only_from_crafting".to_string(), ce(SnbtValue::Byte(1)));
    }

    if obj.match_components {
        m.insert("match_components".to_string(), ce(SnbtValue::Byte(1)));
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
        RewardType::Item => {
            let mut fields = vec![
                ("item".to_string(), ce(item_value(&reward.item_id, reward.item_count, &reward.smart_filter, flat_chapters))),
            ];
            if reward.random_bonus != 0.0 {
                fields.push(("random_bonus".to_string(), ce(SnbtValue::Double(reward.random_bonus))));
            }
            if reward.only_one {
                fields.push(("only_one".to_string(), ce(SnbtValue::Byte(1))));
            }
            ("item", fields)
        }
        RewardType::ItemWithWeight => ("item", vec![
            ("item".to_string(), ce(item_value(&reward.item_id, reward.item_count, &reward.smart_filter, flat_chapters))),
            ("weight".to_string(), ce(SnbtValue::Double(reward.weight))),
        ]),
        RewardType::Experience => ("xp", vec![
            ("xp".to_string(), ce(SnbtValue::Int(reward.xp_amount))),
        ]),
        RewardType::XpLevels => ("levels", vec![
            ("levels".to_string(), ce(SnbtValue::Int(reward.xp_levels))),
        ]),
        RewardType::Command => {
            let mut fields = vec![
                ("command".to_string(), ce(SnbtValue::String(reward.command.clone()))),
            ];
            if reward.permission_level > 0 {
                fields.push(("permission_level".to_string(), ce(SnbtValue::Int(reward.permission_level))));
            }
            if reward.silent {
                fields.push(("silent".to_string(), ce(SnbtValue::Byte(1))));
            }
            if !reward.feedback_message.is_empty() {
                fields.push(("feedback_message".to_string(), ce(SnbtValue::String(reward.feedback_message.clone()))));
            }
            ("command", fields)
        }
        RewardType::LootTable => ("loot", vec![
            ("loot_table".to_string(), ce(SnbtValue::String(reward.loot_table.clone()))),
        ]),
        RewardType::Choice | RewardType::Random | RewardType::AllTable => {
            let ftb_type = match reward.reward_type {
                RewardType::Choice => "choice",
                RewardType::Random => "random",
                _ => "all",
            };
            let mut fields = Vec::new();
            if !reward.table_id.is_empty() {
                // FTB writes the raw long; reward-table files are keyed by hex.
                fields.push(("table_id".to_string(), ce(SnbtValue::Long(RewardTable::to_long_id(&reward.table_id)))));
            }
            (ftb_type, fields)
        }
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

    // Choice/random/all rewards reference a reward table by id. When the reward
    // carries inline items but no resolved table, embed the pool as an internal
    // table (`table_data`), which the game treats as an embedded pool.
    if matches!(reward.reward_type, RewardType::Choice | RewardType::Random | RewardType::AllTable)
        && reward.table_id.is_empty()
        && !reward.items.is_empty() {
        let reward_list: Vec<SnbtValue> = reward.items.iter()
            .map(|item| {
                let mut item_m: HashMap<String, CommentedSnbt> = HashMap::new();
                item_m.insert("id".to_string(), ce(SnbtValue::String(format!("{:016X}", item.len() as i64 + 1))));
                item_m.insert("item".to_string(), ce(item_compound(item, 1, "")));
                item_m.insert("weight".to_string(), ce(SnbtValue::Float(1.0)));
                SnbtValue::Compound(item_m)
            })
            .collect();
        let mut table_data: HashMap<String, CommentedSnbt> = HashMap::new();
        table_data.insert("rewards".to_string(), ce(SnbtValue::List(reward_list)));
        m.insert("table_data".to_string(), ce(SnbtValue::Compound(table_data)));
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

    // `team_reward` is a tristate in the format: TRUE writes 1b, FALSE writes
    // 0b, and the default omits the key. We omit when false to match that.
    if reward.team_reward {
        m.insert("team_reward".to_string(), ce(SnbtValue::Byte(1)));
    }

    if !reward.autoclaim.is_empty() {
        m.insert("auto".to_string(), ce(SnbtValue::String(reward.autoclaim.clone())));
    }

    if reward.exclude_from_claim_all {
        m.insert("exclude_from_claim_all".to_string(), ce(SnbtValue::Byte(1)));
    }

    if reward.ignore_reward_blocking {
        m.insert("ignore_reward_blocking".to_string(), ce(SnbtValue::Byte(1)));
    }

    if reward.disable_reward_screen_blur {
        m.insert("disable_reward_screen_blur".to_string(), ce(SnbtValue::Byte(1)));
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


