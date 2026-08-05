use crate::imports::snbt::{SnbtValue, CommentedSnbt};
use crate::quest::*;
use anyhow::Result;
use std::collections::HashMap;

use super::helpers::{ce, icon_to_snbt, parse_hex_color};
use super::reward::reward_to_snbt;
use super::task::objective_to_snbt_task;

/// Convert a QuestNode to an SNBT compound value
pub(super) fn quest_to_snbt(node: &QuestNode, deps: Option<&Vec<String>>, flat_chapters: bool) -> Result<SnbtValue> {
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
