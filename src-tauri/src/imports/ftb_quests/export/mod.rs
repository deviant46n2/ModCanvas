use crate::imports::snbt::{SnbtValue, compound_to_snbt};
use super::snbt_sidecar;
use crate::quest::*;
use anyhow::Result;
use std::collections::HashMap;
use std::path::Path;

mod book;
mod chapter;
mod helpers;
mod quest;
mod reward;
mod task;

pub(crate) use helpers::ce;
use chapter::{build_flat_chapters_quests, build_subdirs_chapter_map};
use helpers::{chapter_images_to_snbt, sanitize_filename};
use quest::quest_to_snbt;
use book::{write_book_snbt, write_reward_tables_snbt};

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

    write_book_snbt(graph, &quests_dir, effective_sidecar)?;

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

    write_reward_tables_snbt(graph, &quests_dir, effective_sidecar)?;

    Ok(())
}
