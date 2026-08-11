use super::super::types::FtBQuestsImportResult;
use super::LangTitles;
use super::json5::parse_json5_quest;
use crate::quest::*;
use anyhow::{Context, Result};
use std::path::Path;
use uuid::Uuid;

// ─── Json5 Chapter Parser ──────────────────────────────────────────────────

pub(super) fn parse_json5_chapter_file(path: &Path, graph: &mut QuestGraph, result: &mut FtBQuestsImportResult, lang_titles: &LangTitles) -> Result<(usize, String)> {
    let content = std::fs::read_to_string(path)?;
    let val: serde_json::Value = json5::from_str(&content)
        .or_else(|_| serde_json::from_str(&content))
        .with_context(|| format!("Failed to parse {}", path.display()))?;

    let chapter_id = val.get("id").and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .unwrap_or_else(|| Uuid::new_v4().to_string());

    // Dedupe by chapter id BEFORE parsing quests — same stale-duplicate-dir
    // guard as the SNBT parser (retitled chapter folders double their
    // quests' dependency edges otherwise).
    if graph.chapters.iter().any(|c| c.id == chapter_id) {
        return Ok((0, chapter_id));
    }
    let title = val.get("title").and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .unwrap_or_else(|| {
            // Try language file titles first
            if let Some(lang_title) = lang_titles.chapter.get(&chapter_id) {
                return lang_title.clone();
            }
            path.parent().and_then(|p| p.file_name()).map(|f| f.to_string_lossy().to_string()).unwrap_or_default()
        })
        .to_string();
    let _filename = val.get("filename").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let default_shape = val.get("default_quest_shape").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let progression_mode = val.get("progression_mode").and_then(|v| v.as_str()).unwrap_or("flexible").to_string();
    let group = val.get("group").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let order_index = val.get("order_index").and_then(|v| v.as_i64()).unwrap_or(0) as i32;
    let chapter_default_enabled = val.get("default_enabled").and_then(|v| v.as_bool()).unwrap_or(true);
    let subtitle = val.get("subtitle").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let default_min_width = val.get("default_min_width").and_then(|v| v.as_i64()).unwrap_or(0) as i32;
    let default_size_scalar = val.get("default_quest_size").and_then(|v| v.as_f64()).unwrap_or(1.0);
    let default_quest_size = QuestSize {
        width: (default_size_scalar * 24.0).round(),
        height: (default_size_scalar * 24.0).round(),
    };
    let always_invisible = val.get("always_invisible").and_then(|v| v.as_bool()).unwrap_or(false);
    let hide_dep_lines = val.get("default_hide_dependency_lines").and_then(|v| v.as_bool()).unwrap_or(false);
    let hide_details_until_startable = val.get("hide_quest_details_until_startable").and_then(|v| v.as_bool()).unwrap_or(false);
    let hide_until_deps_visible = val.get("hide_quest_until_deps_visible").and_then(|v| v.as_bool()).unwrap_or(false);
    let hide_until_deps_complete = val.get("hide_quest_until_deps_complete").and_then(|v| v.as_bool()).unwrap_or(false);
    let hide_text_until_complete = val.get("hide_text_until_complete").and_then(|v| v.as_bool()).unwrap_or(false);
    let autofocus_id = val.get("autofocus_id").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let default_repeatable = val.get("default_repeatable_quest").and_then(|v| v.as_bool()).unwrap_or(false);
    let require_sequential_tasks = val.get("require_sequential_tasks").and_then(|v| v.as_bool()).unwrap_or(false);
    result.stats.files_processed += 1;

    if !group.is_empty() && !graph.chapter_groups.iter().any(|cg| cg.id == group || cg.title == group) {
        let group_title = lang_titles.chapter_group.get(&group).cloned().unwrap_or_else(|| group.clone());
        graph.chapter_groups.push(QuestChapterGroup {
            id: group.clone(),
            title: group_title,
            ..Default::default()
        });
    }

    graph.nodes.push(QuestNode {
        id: chapter_id.clone(),
        node_type: QuestNodeType::Chapter,
        label: title.clone(),
        description: String::new(),
        position: Position { x: 0.0, y: 0.0 },
        chapter_id: None,
        ..Default::default()
    });

    let images: Vec<ChapterImage> = val.get("images")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter().map(|item| {
                let obj = item.as_object().map(|o| {
                    let x = o.get("x").and_then(|v| v.as_f64()).unwrap_or(0.0);
                    let y = o.get("y").and_then(|v| v.as_f64()).unwrap_or(0.0);
                    let width = o.get("width").and_then(|v| v.as_f64()).unwrap_or(1.0);
                    let height = o.get("height").and_then(|v| v.as_f64()).unwrap_or(1.0);
                    let rotation = o.get("rotation").and_then(|v| v.as_f64()).unwrap_or(0.0);
                    let image = o.get("image").and_then(|v| v.as_str()).unwrap_or("").to_string();
                    let scale = o.get("scale").and_then(|v| v.as_f64()).unwrap_or(1.0);
                    let order = o.get("order").and_then(|v| v.as_i64()).unwrap_or(0) as i32;
                    let alpha = o.get("alpha").and_then(|v| v.as_i64()).unwrap_or(255) as u8;
                    let color = o.get("color").and_then(|v| v.as_i64()).unwrap_or(0) as i32;
                    let click = o.get("click").and_then(|v| v.as_str()).unwrap_or("").to_string();
                    let hover: Vec<String> = o.get("hover").and_then(|v| v.as_array())
                        .map(|h| h.iter().filter_map(|s| s.as_str().map(String::from)).collect())
                        .unwrap_or_default();
                    ChapterImage { x, y, width, height, rotation, image, scale, order, alpha, color, click, hover }
                }).unwrap_or_default();
                obj
            }).collect()
        })
        .unwrap_or_default();

    graph.chapters.push(QuestChapter {
        id: chapter_id.clone(),
        title,
        subtitle,
        description: String::new(),
        icon: val.get("icon").and_then(|v| v.as_str()).unwrap_or("").to_string(),
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

    let mut quest_count = 0usize;
    if let Some(quests) = val.get("quests").and_then(|v| v.as_array()) {
        for quest_val in quests {
            if let Some(quest_m) = quest_val.as_object() {
                if let Ok(node) = parse_json5_quest(quest_m, &chapter_id, chapter_default_enabled) {
                    graph.nodes.push(node);
                    quest_count += 1;
                }
            }
        }
    }

    Ok((quest_count, chapter_id))
}
