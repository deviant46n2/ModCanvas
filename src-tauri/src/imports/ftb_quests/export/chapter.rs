use crate::imports::snbt::{SnbtValue, CommentedSnbt};
use crate::quest::*;
use std::collections::HashMap;

use super::helpers::{ce, chapter_images_to_snbt};
use super::quest::quest_to_snbt;

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
pub(super) fn build_subdirs_chapter_map(
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

pub(super) fn build_flat_chapters_quests<'a>(
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
