use super::super::snbt_sidecar;
use super::super::types::{FtBQuestsFormat, FtBQuestsImportResult, SnbtMapHelper};
use super::LangTitles;
use super::helpers::{extract_icon_str, resolve_ftbquests_icon};
use super::quest::parse_snbt_quest;
use crate::imports::snbt::{SnbtValue, parse_snbt};
use crate::quest::*;
use anyhow::{Context, Result};
use std::path::Path;
use uuid::Uuid;

/// Parse chapter_groups.snbt/json5 for chapter ordering
pub(super) fn parse_chapter_groups(quests_dir: &Path, format: FtBQuestsFormat, graph: &mut QuestGraph, result: &mut FtBQuestsImportResult, lang_titles: &LangTitles) {
    match format {
        FtBQuestsFormat::Snbt => {
            let file = quests_dir.join("chapter_groups.snbt");
            if !file.exists() { return; }
            if let Ok(content) = std::fs::read_to_string(&file) {
                if let Ok(snbt) = parse_snbt(&content) {
                    if let Some(groups) = snbt.get("chapter_groups").and_then(|v| v.as_list()) {
                        for (i, g) in groups.iter().enumerate() {
                            if let Some(m) = g.as_compound() {
                                let id = m.get_str("id").unwrap_or("").to_string();
                                let title = m.get_str("title")
                                    .map(|s| s.to_string())
                                    .filter(|t| !t.is_empty())
                                    .or_else(|| lang_titles.chapter_group.get(&id).cloned())
                                    .unwrap_or_else(|| id.clone());
                                if !id.is_empty() && !graph.chapter_groups.iter().any(|cg| cg.id == id) {
                                    graph.chapter_groups.push(QuestChapterGroup {
                                        id,
                                        title,
                                        order_index: i as i32,
                                        ..Default::default()
                                    });
                                }
                            }
                        }
                    }
                }
            }
            result.stats.files_processed += 1;
        }
        FtBQuestsFormat::Json5 => {
            let file = if quests_dir.join("chapter_groups.json5").exists() {
                quests_dir.join("chapter_groups.json5")
            } else {
                quests_dir.join("chapter_groups.json")
            };
            if !file.exists() { return; }
            if let Ok(content) = std::fs::read_to_string(&file) {
                if let Ok(val) = json5::from_str::<serde_json::Value>(&content)
                    .or_else(|_| serde_json::from_str(&content))
                {
                    if let Some(groups) = val.get("chapter_groups").and_then(|v| v.as_array()) {
                        for (i, g) in groups.iter().enumerate() {
                            let id = g.get("id").and_then(|v| v.as_str()).unwrap_or("").to_string();
                            let title = g.get("title")
                                .and_then(|v| v.as_str())
                                .filter(|t| !t.is_empty())
                                .map(|s| s.to_string())
                                .or_else(|| lang_titles.chapter_group.get(&id).cloned())
                                .unwrap_or_else(|| id.clone());
                            if !id.is_empty() && !graph.chapter_groups.iter().any(|cg| cg.id == id) {
                                graph.chapter_groups.push(QuestChapterGroup {
                                    id,
                                    title,
                                    order_index: i as i32,
                                    ..Default::default()
                                });
                            }
                        }
                    }
                }
            }
            result.stats.files_processed += 1;
        }
    }
}

// ─── Chapter Image Parser ───────────────────────────────────────────────────

fn parse_chapter_image(val: &SnbtValue) -> ChapterImage {
    ChapterImage {
        x: val.get_f64("x").unwrap_or(0.0),
        y: val.get_f64("y").unwrap_or(0.0),
        width: val.get_f64("width").unwrap_or(1.0),
        height: val.get_f64("height").unwrap_or(1.0),
        rotation: val.get_f64("rotation").unwrap_or(0.0),
        image: val.get_str("image").unwrap_or("").to_string(),
        scale: val.get_f64("scale").unwrap_or(1.0),
        order: val.get_i64("order").unwrap_or(0) as i32,
        alpha: val.get_i64("alpha").unwrap_or(255) as u8,
        color: val.get_i64("color").unwrap_or(0) as i32,
        click: val.get_str("click").unwrap_or("").to_string(),
        hover: val.get_list("hover")
            .map(|list| {
                list.iter()
                    .filter_map(|v| v.as_str().map(|s| s.to_string()))
                    .collect()
            })
            .unwrap_or_default(),
    }
}

// ─── SNBT Chapter Parser ───────────────────────────────────────────────────

/// Parse a chapter.snbt file. Returns (quest_count, chapter_node_id).
pub(super) fn parse_snbt_chapter_file(path: &Path, graph: &mut QuestGraph, result: &mut FtBQuestsImportResult, lang_titles: &LangTitles) -> Result<(usize, String)> {
    let content = std::fs::read_to_string(path)?;
    let snbt = parse_snbt(&content)?;
    snbt.as_compound().context("chapter.snbt root is not a compound")?;
    let m = &snbt;
    result.stats.files_processed += 1;

    let chapter_id = m.get_str("id")
        .map(|s| s.to_string())
        .unwrap_or_else(|| Uuid::new_v4().to_string());

    // Store raw SNBT in sidecar for comment preservation during export
    snbt_sidecar::store_chapter(&mut result.sidecar, &chapter_id, &content);

    let title = m.get_str("title")
        .map(|s| s.to_string())
        .unwrap_or_else(|| {
            // Try language file titles first
            if let Some(lang_title) = lang_titles.chapter.get(&chapter_id) {
                return lang_title.clone();
            }
            // For old flat layout (chapters/ae2.snbt), use the file stem as title
            path.file_stem()
                .map(|f| f.to_string_lossy().replace('_', " "))
                .or_else(|| path.parent().and_then(|p| p.file_name()).map(|f| f.to_string_lossy().to_string()))
                .unwrap_or_default()
        })
        .to_string();
    let _filename = m.get_str("filename").unwrap_or("").to_string();

    // Chapter-level settings
    let default_shape = m.get_str("default_quest_shape").unwrap_or("").to_string();
    let progression_mode = m.get_str("progression_mode").unwrap_or("flexible").to_string();
    let group = m.get_str("group").unwrap_or("").to_string();
    let order_index = m.get_i64("order_index").unwrap_or(0) as i32;
    let hide_dep_lines = m.get_bool("default_hide_dependency_lines").unwrap_or(false);
    let chapter_default_enabled = m.get_bool("default_enabled").unwrap_or(true);
    let subtitle = m.get_str("subtitle").unwrap_or("").to_string();
    let default_min_width = m.get_i64("default_min_width").unwrap_or(0) as i32;
    let default_size_scalar = m.get_f64("default_quest_size").unwrap_or(1.0);
    let default_quest_size = QuestSize {
        width: (default_size_scalar * 24.0).round(),
        height: (default_size_scalar * 24.0).round(),
    };
    let always_invisible = m.get_bool("always_invisible").unwrap_or(false);
    let hide_details_until_startable = m.get_bool("hide_quest_details_until_startable").unwrap_or(false);
    let hide_until_deps_visible = m.get_bool("hide_quest_until_deps_visible").unwrap_or(false);
    let hide_until_deps_complete = m.get_bool("hide_quest_until_deps_complete").unwrap_or(false);
    let hide_text_until_complete = m.get_bool("hide_text_until_complete").unwrap_or(false);
    let autofocus_id = m.get_str("autofocus_id").unwrap_or("").to_string();
    let default_repeatable = m.get_bool("default_repeatable_quest").unwrap_or(false);
    let require_sequential_tasks = m.get_bool("require_sequential_tasks").unwrap_or(false);

    // Chapter groups
    if !group.is_empty() {
        if !graph.chapter_groups.iter().any(|cg| cg.id == group || cg.title == group) {
            let group_title = lang_titles.chapter_group.get(&group).cloned().unwrap_or_else(|| group.clone());
            graph.chapter_groups.push(QuestChapterGroup {
                id: group.clone(),
                title: group_title,
                ..Default::default()
            });
        }
    }

    // Create chapter node
    let chapter_node = QuestNode {
        id: chapter_id.clone(),
        node_type: QuestNodeType::Chapter,
        label: title.clone(),
        description: String::new(),
        position: Position { x: 0.0, y: 0.0 },
        chapter_id: None,
        ..Default::default()
    };
    graph.nodes.push(chapter_node);

    // Parse images array
    let images: Vec<ChapterImage> = m.get("images")
        .and_then(|v| v.as_list())
        .map(|list| {
            let imgs: Vec<_> = list.iter().map(|val| parse_chapter_image(val)).collect();
            result.stats.chapter_images_total += imgs.len();
            imgs
        })
        .unwrap_or_default();

    // Chapter metadata
    graph.chapters.push(QuestChapter {
        id: chapter_id.clone(),
        title,
        subtitle,
        description: String::new(),
        icon: resolve_ftbquests_icon(&extract_icon_str(&m.value)),
        background_image: String::new(),
        order_index,
        hide_until_first_quest_complete: false,
        default_quest_size,
        default_min_width,
        quest_color: String::new(),
        group_id: if group.is_empty() { None } else { Some(group) },
        default_quest_shape: QuestShape::from_string(&default_shape),
        default_enabled: chapter_default_enabled,
        progression_mode: QuestProgressionMode::from_string(&progression_mode),
        images,
        always_invisible,
        default_hide_dependency_lines: hide_dep_lines,
        hide_quest_details_until_startable: hide_details_until_startable,
        hide_quest_until_deps_visible: hide_until_deps_visible,
        hide_quest_until_deps_complete: hide_until_deps_complete,
        hide_text_until_complete,
        autofocus_id,
        default_repeatable,
        require_sequential_tasks,
    });

    // Parse quests array
    let mut quest_count = 0usize;
        if let Some(quests_val) = m.get("quests") {
            if let Some(quests_list) = quests_val.as_list() {
                for quest_val in quests_list {
                    if let Ok(node) = parse_snbt_quest(quest_val, &chapter_id, hide_dep_lines, chapter_default_enabled, result) {
                        graph.nodes.push(node);
                        quest_count += 1;
                    }
                }
        }
    }

    Ok((quest_count, chapter_id))
}
