use crate::imports::snbt::{SnbtValue, compound_to_snbt};
use crate::imports::ftb_quests::FtBQuestsLayout;
use super::snbt_sidecar;
use crate::quest::*;
use anyhow::Result;
use std::collections::HashMap;
use std::path::Path;

mod book;
mod chapter;
mod helpers;
mod ids;
mod quest;
mod reward;
mod task;

pub(crate) use helpers::ce;
use chapter::{build_flat_chapters_quests, build_subdirs_chapter_map};
use helpers::{chapter_images_to_snbt, sanitize_filename};
use ids::rebase_invalid_ids;
use quest::quest_to_snbt;
use book::{write_book_snbt, write_reward_tables_snbt};

/// The chapter layout a given Minecraft version's FTB Quests actually READS.
/// Returns `None` when the version is unverified and the pre-existing
/// (graph/detected) behavior should stand.
///
/// Verified for 1.21.x against the shipped jar (ftb-quests-neoforge
/// 2101.1.30, BaseQuestFile bytecode): `readDataFull` resolves `chapters`
/// and `Files.list`s it, and the chapter path template is the constant
/// `"chapters/%s.snbt"` — chapters live at `quests/chapters/*.snbt` ONLY.
/// The Subdirs layout (`quests/<name>/chapter.snbt`) is invisible to 1.21.x:
/// a pack exported in it loads 0 chapters in-game (s42: Monster never
/// showed quests; ATM10SKY, a working 1.21.1 pack, uses `chapters/`).
pub fn layout_for_version(mc_version: &str) -> Option<FtBQuestsLayout> {
    if mc_version.starts_with("1.21") {
        Some(FtBQuestsLayout::FlatChapters)
    } else {
        None
    }
}

/// Export in the layout the graph came from (or the target dir's detected
/// layout for a fresh graph). See [`export_ftb_quests_snbt_for_layout`] for
/// the version-aware override used by production paths.
pub fn export_ftb_quests_snbt(graph: &QuestGraph, output_dir: &Path, sidecar: &snbt_sidecar::SnbtSidecar) -> Result<()> {
    export_ftb_quests_snbt_for_layout(graph, output_dir, sidecar, None)
}

/// Export with an explicit layout override. Production paths resolve the
/// override from the project's Minecraft version (see `layout_for_version`):
/// for 1.21.x a graph whose layout says "Subdirs" must STILL export
/// FlatChapters — the graph's layout records what the pack's directory
/// contained, not what the target FTB version can load.
pub fn export_ftb_quests_snbt_for_layout(
    graph: &QuestGraph,
    output_dir: &Path,
    sidecar: &snbt_sidecar::SnbtSidecar,
    layout_override: Option<FtBQuestsLayout>,
) -> Result<()> {
    let quests_dir = output_dir.join("config").join("ftbquests").join("quests");

    // FTB's Long.parseLong(s, 16) throws for ids > Long.MAX_VALUE (s42):
    // quests then register under random ids and dependencies silently drop —
    // the "no dependency lines" bug. Re-base invalid ids deterministically so
    // the output is always loadable; the app's internal graph ids stay as-is.
    let graph = rebase_invalid_ids(graph);

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

    write_book_snbt(&graph, &quests_dir, effective_sidecar)?;

    // Group quests by chapter
    let mut chapter_quests: HashMap<String, Vec<&QuestNode>> = HashMap::new();
    for node in &graph.nodes {
        if matches!(node.node_type, QuestNodeType::Quest | QuestNodeType::SideQuest | QuestNodeType::Reward | QuestNodeType::Gate | QuestNodeType::QuestLink) {
            if let Some(ch_id) = &node.chapter_id {
                chapter_quests.entry(ch_id.clone()).or_default().push(node);
            }
        }
    }

    // Build deps map once. Dedupe per target: a graph that inherited doubled
    // edges (duplicate chapter dirs imported before the import-side guard)
    // must not emit `dependencies: [id, id]`.
    let mut deps_map: HashMap<String, Vec<String>> = HashMap::new();
    for edge in &graph.edges {
        if edge.edge_type == EdgeType::Prerequisite {
            let deps = deps_map.entry(edge.target.clone()).or_default();
            if !deps.contains(&edge.source) {
                deps.push(edge.source.clone());
            }
        }
    }

    // Write ONE layout — the one the pack already uses (or the version-aware
    // override). Writing both used to create a second, stale copy of the book
    // on every save; the game can load both, and re-importing the doubled
    // dirs doubled dependency edges (retitled chapter folders + the other
    // layout's files accumulated until the pack had two copies of the same
    // quests).
    // The layout travels with the graph (set by the import); a fresh graph
    // falls back to what the target dir already has. The override (1.21.x →
    // FlatChapters) wins over both: the graph/detected layout records what
    // the directory contains, not what the target FTB version can load.
    let layout_is_subdirs = match layout_override {
        Some(crate::imports::ftb_quests::FtBQuestsLayout::Subdirs) => true,
        Some(crate::imports::ftb_quests::FtBQuestsLayout::FlatChapters)
        | Some(crate::imports::ftb_quests::FtBQuestsLayout::Flat) => false,
        None => {
            if graph.layout.is_empty() {
                crate::imports::ftb_quests::detect_layout(&quests_dir)
                    == crate::imports::ftb_quests::FtBQuestsLayout::Subdirs
            } else {
                graph.layout == "Subdirs"
            }
        }
    };

    if layout_is_subdirs {
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

    // Subdirs cleanup: remove chapter dirs that are stale duplicates of a
    // current chapter (same chapter id, wrong folder name — a retitled
    // chapter's old folder), and the flat chapters/ dir this exporter used
    // to write. Dirs whose chapter id is NOT in the graph are left alone.
    let current_chapters: Vec<String> = graph.chapters.iter().map(|c| c.id.clone()).collect();
    if let Ok(entries) = std::fs::read_dir(&quests_dir) {
        for entry in entries.flatten() {
            let p = entry.path();
            if !p.is_dir() || !p.join("chapter.snbt").exists() {
                continue;
            }
            let content = std::fs::read_to_string(p.join("chapter.snbt")).unwrap_or_default();
            let dir_id = crate::imports::snbt::parse_snbt(&content)
                .ok()
                .and_then(|v| v.get_str("id").map(|s| s.to_string()))
                .unwrap_or_default();
            let current_title = graph.chapters.iter()
                .find(|c| c.id == dir_id)
                .map(|c| crate::imports::ftb_quests::export::helpers::sanitize_filename(&c.title));
            let is_managed = current_title.as_ref().is_some_and(|t| {
                p.file_name().map(|n| n.to_string_lossy().to_string()) == Some(t.clone())
            });
            if current_chapters.contains(&dir_id) && !is_managed {
                std::fs::remove_dir_all(&p).map_err(|e| anyhow::anyhow!("{e}"))?;
                eprintln!("[ModCanvas] Removed stale duplicate chapter dir {:?}", p);
            }
        }
    }
    let flat_dir = quests_dir.join("chapters");
    if flat_dir.is_dir() {
        std::fs::remove_dir_all(&flat_dir).map_err(|e| anyhow::anyhow!("{e}"))?;
    }
    } else {
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

        // Try to parse existing chapter file to preserve metadata (images, icon, group, etc.);
        // for a fresh export (no existing file), build the FULL metadata map so
        // subtitle/visibility/size defaults survive the round-trip — the flat
        // exporter used to start from an empty map, silently dropping them.
        let mut chapter_compound = if chapter_path.exists() {
            match crate::imports::snbt::parse_snbt_compound(
                &std::fs::read_to_string(&chapter_path).unwrap_or_default()
            ) {
                Ok(map) => map,
                Err(_) => HashMap::new(),
            }
        } else {
            build_subdirs_chapter_map(chapter_node, chapter_meta, &filename)
        };

        // Always set/update id, filename
        chapter_compound.insert("id".to_string(), ce(SnbtValue::String(chapter_node.id.clone())));
        chapter_compound.insert("filename".to_string(), ce(SnbtValue::String(filename.to_string())));

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

        // Sidecar merge LAST: preserve comments on unchanged chapter fields and
        // quests. All graph overrides (id/filename/title/order_index/images)
        // must land BEFORE this, or they'd wipe the merged comments.
        if let Some(merged) = snbt_sidecar::merge_quests_in_chapter(effective_sidecar, &chapter_node.id, &chapter_compound, &new_quests) {
            chapter_compound = merged;
        } else {
            // Fallback: no sidecar data, just insert quests directly
            chapter_compound.insert("quests".to_string(), ce(SnbtValue::List(new_quests)));
        }

        crate::path_safety::atomic_write_str(&chapter_path, &compound_to_snbt(&chapter_compound))
            .map_err(|e| anyhow::anyhow!("{e}"))?;
    }

    // Flat cleanup: remove the subdirs chapter folders this exporter used to
    // write alongside the flat files (they are duplicates of the same book).
    if let Ok(entries) = std::fs::read_dir(&quests_dir) {
        for entry in entries.flatten() {
            let p = entry.path();
            if p.is_dir() && p.join("chapter.snbt").exists() {
                std::fs::remove_dir_all(&p).map_err(|e| anyhow::anyhow!("{e}"))?;
            }
        }
    }
    }

    write_reward_tables_snbt(&graph, &quests_dir, effective_sidecar)?;

    Ok(())
}
