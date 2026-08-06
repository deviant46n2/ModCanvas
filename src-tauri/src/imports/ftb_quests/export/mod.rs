use crate::imports::snbt::{SnbtValue, CommentedSnbt, compound_to_snbt};
use super::snbt_sidecar;
use crate::quest::*;
use anyhow::Result;
use std::collections::HashMap;
use std::path::Path;

mod chapter;
mod helpers;
mod quest;
mod reward;
mod task;

pub(crate) use helpers::ce;
use chapter::{build_flat_chapters_quests, build_subdirs_chapter_map};
use helpers::{chapter_images_to_snbt, sanitize_filename};
use quest::quest_to_snbt;
use reward::reward_to_snbt;

/// Export a QuestGraph as FTB Quests SNBT files to a directory (both Subdirs and FlatChapters formats)
///
/// `sidecar` is the raw-SNBT map returned from `import_ftb_quests`.  When
/// non-empty, the exporter re-parses the original SNBT to recover user comments
/// and merges them into the output for unchanged fields.
pub fn export_ftb_quests_snbt(graph: &QuestGraph, output_dir: &Path, sidecar: &snbt_sidecar::SnbtSidecar) -> Result<()> {
    let quests_dir = output_dir.join("config").join("ftbquests").join("quests");

    // Live export paths (export_ftb_quests_to_dir, write_quest_graph_to_instance)
    // have no import-produced sidecar. Recover comments from whatever already
    // exists on disk so a re-export of an existing pack preserves user comments.
    let recovered: snbt_sidecar::SnbtSidecar;
    let effective_sidecar: &snbt_sidecar::SnbtSidecar = if sidecar.is_empty() && quests_dir.is_dir() {
        recovered = snbt_sidecar::build_sidecar_from_quests_dir(&quests_dir);
        &recovered
    } else {
        sidecar
    };

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
    crate::path_safety::atomic_write_str(
        &quests_dir.join("data.snbt"),
        &compound_to_snbt(&snbt_sidecar::merge_book_comments(effective_sidecar, "book:data", &data_map).unwrap_or(data_map)),
    )
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

        if let Some(merged) = snbt_sidecar::merge_quests_in_chapter(effective_sidecar, &chapter_node.id, &chapter_map, &quests_for_chapter) {
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
    // Build a map of chapter id → existing flat file stem so we write to the
    // pack's own filenames instead of creating title-sanitized duplicates
    // that lack the `group` key.
    let mut existing_flat_names: HashMap<String, String> = HashMap::new();
    if let Ok(entries) = std::fs::read_dir(&chapters_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) != Some("snbt") {
                continue;
            }
            let content = std::fs::read_to_string(&path).unwrap_or_default();
            if let Ok(map) = crate::imports::snbt::parse_snbt_compound(&content) {
                if let Some(id) = map.get("id").and_then(|v| v.as_str()) {
                    if let Some(stem) = path.file_stem().and_then(|s| s.to_str()) {
                        existing_flat_names.insert(id.to_string(), stem.to_string());
                    }
                }
            }
        }
    }
    for chapter_node in graph.nodes.iter().filter(|n| matches!(n.node_type, QuestNodeType::Chapter)) {
        let chapter_meta = graph.chapters.iter().find(|c| c.id == chapter_node.id);
        let filename = existing_flat_names.get(&chapter_node.id).cloned()
            .or_else(|| chapter_meta.map(|c| sanitize_filename(&c.title)))
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
        if let Some(merged) = snbt_sidecar::merge_quests_in_chapter(effective_sidecar, &chapter_node.id, &chapter_compound, &new_quests) {
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
        let groups_out = snbt_sidecar::merge_book_comments(effective_sidecar, "book:chapter_groups", &groups_compound)
            .unwrap_or(groups_compound);
        crate::path_safety::atomic_write_str(
            &quests_dir.join("chapter_groups.snbt"),
            &compound_to_snbt(&groups_out),
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

            let sidecar_key = format!("book:reward_table:{hex_id}");
            let table_out = snbt_sidecar::merge_book_comments(effective_sidecar, &sidecar_key, &m).unwrap_or(m);

            crate::path_safety::atomic_write_str(
                &reward_tables_dir.join(format!("{hex_id}.snbt")),
                &compound_to_snbt(&table_out),
            )
            .map_err(|e| anyhow::anyhow!("{e}"))?;
        }
    }

    Ok(())
}
