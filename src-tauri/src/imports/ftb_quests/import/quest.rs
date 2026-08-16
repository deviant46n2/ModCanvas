use super::super::types::FtBQuestsImportResult;
use super::helpers::{extract_icon_str, format_color, format_item_title, parse_description, resolve_ftbquests_icon};
use super::reward::parse_snbt_rewards;
use super::task::parse_snbt_single_task;
use crate::imports::snbt::SnbtValue;
use crate::quest::*;
use anyhow::Result;
use std::collections::HashMap;
use uuid::Uuid;

/// Extract the item ID from the first `item`-type task (for title/icon fallback).
/// Returns `None` if no item task is found.
fn extract_first_task_item(m: &SnbtValue) -> Option<String> {
    let tasks_val = m.get("tasks");
    let tasks_list = tasks_val.and_then(|v| v.as_list())?;
    let first = tasks_list.first()?;
    let task_type = first.get_str("type").unwrap_or("item");
    if task_type != "item" && task_type != "ftbquests:item" && task_type != "minecraft:item"
        && task_type != "item_retrieval" && task_type != "ftbquests:item_retrieval"
        && task_type != "item_crafting" && task_type != "crafting" && task_type != "craft"
    {
        return None;
    }
    if let Some(item_m) = first.get("item").and_then(|v| v.as_compound()) {
        return item_m.get("id").and_then(|v| v.as_str()).map(|s| s.to_string());
    }
    if let Some(item_str) = first.get_str("item") {
        return Some(item_str.to_string());
    }
    None
}

/// True if the first task is a `checkmark`-type task (the FTB checkmark, not a
/// shaped node). Checkmark tasks carry no item id, so quests whose only task is a
/// checkmark would otherwise fall back to an unresolvable icon.
fn first_task_is_checkmark(m: &SnbtValue) -> bool {
    let tasks_val = m.get("tasks");
    let tasks_list = tasks_val.and_then(|v| v.as_list());
    if let Some(first) = tasks_list.and_then(|l| l.first()) {
        let task_type = first.get_str("type").unwrap_or("");
        return task_type == "checkmark" || task_type == "ftbquests:checkmark"
            || task_type == "minecraft:checkmark";
    }
    false
}

/// Parse a single quest from an SNBT compound
pub(super) fn parse_snbt_quest(m: &SnbtValue, chapter_id: &str, default_hide_dep_lines: bool, chapter_default_enabled: bool, result: &mut FtBQuestsImportResult) -> Result<QuestNode> {
    let id = m.get_str("id")
        .map(|s| s.to_string())
        .unwrap_or_else(|| Uuid::new_v4().to_string());

    let first_task_item = extract_first_task_item(m);
    let title = m.get_str("title")
        .map(|s| s.to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| {
            let from_task = first_task_item.as_ref().map(|item| format_item_title(item));
            if from_task.is_some() {
                result.stats.title_from_task += 1;
            }
            from_task.unwrap_or_else(|| {
                // Last resort: use the quest id
                id.chars().take(8).collect()
            })
        });
    let description = parse_description(m);
    let x = m.get_f64("x").unwrap_or(0.0);
    let y = m.get_f64("y").unwrap_or(0.0);
    let icon = extract_icon_str(m);
    let icon = if icon.is_empty() || icon == "minecraft:" {
        if let Some(item) = first_task_item.as_deref() {
            result.stats.icon_from_task += 1;
            resolve_ftbquests_icon(item)
        } else if first_task_is_checkmark(m) {
            // In-game FTB uses Icons.ACCEPT_GRAY as the checkmark task icon.
            "ftblibrary:textures/icons/accept_gray.png".to_string()
        } else {
            resolve_ftbquests_icon("")
        }
    } else {
        resolve_ftbquests_icon(&icon)
    };
    let color_int = m.get_i64("color").unwrap_or(-1);
    let color = if color_int >= 0 { format_color(color_int) } else { String::new() };
    let subtitle = m.get_str("subtitle").unwrap_or("").to_string();
    let shape = m.get_str("shape").unwrap_or("").to_string();
    let visibility = m.get_str("visibility").unwrap_or("normal").to_string();
    let optional = m.get_bool("optional").unwrap_or(false);
    let default_enabled = m.get_bool("default_enabled").unwrap_or(chapter_default_enabled);
    let silently_complete = m.get_bool("silently_complete").unwrap_or(false);
    let can_be_repeatable = m.get_bool("can_be_repeatable").unwrap_or(false)
        || m.get_bool("can_repeat").unwrap_or(false)
        || m.get_i64("repeatability").unwrap_or(0) > 0;
    let repeat_min_delay = m.get_i64("repeat_min_delay").unwrap_or(0);
    let repeat_max_delay = m.get_i64("repeat_max_delay").unwrap_or(0);
    let repeat_time = m.get_i64("repeat_time").unwrap_or(0);
    // FTB writes a single seconds cooldown; keep legacy keys as a fallback.
    let repeat_cooldown = m.get_i64("repeat_cooldown").unwrap_or(0);
    let hide_lock_icon = m.get_bool("hide_lock_icon").unwrap_or(false);
    let guide_page = m.get_str("guide_page").unwrap_or("").to_string();
    let max_completable_dependents = m.get_i64("max_completable_dependents").unwrap_or(0) as i32;
    let hide_quest_until_deps_complete = m.get_bool("hide_quest_until_deps_complete").unwrap_or(false);
    let hide_quest_until_quest_complete = m.get_bool("hide_quest_until_quest_complete").unwrap_or(false);
    let hide_quest_until_all_complete = m.get_bool("hide_quest_until_all_complete").unwrap_or(false);
    let disable_reward = m.get_bool("disable_reward").unwrap_or(false);
    let pause_reward = m.get_bool("pause_reward").unwrap_or(false);
    let lock_icon = m.get_str("lock_icon").unwrap_or("").to_string();
    let quest_background = m.get_str("quest_background").unwrap_or("").to_string();
    // The quest format writes the icon multiplier as `icon_scale`; also accept
    // the legacy `icon_scaling` key the app once emitted for subdirs layouts,
    // and clamp to the editor range (0.1 – 2.0).
    let icon_scaling = m
        .get_f64("icon_scale")
        .or_else(|| m.get_f64("icon_scaling"))
        .unwrap_or(1.0)
        .clamp(0.1, 2.0);
    let progression_mode = m.get_str("progression_mode").unwrap_or("default").to_string();
    let sequential_tasks = m.get_bool("sequential_tasks").unwrap_or(false);
    let disable_completion_toast = m.get_bool("disable_completion_toast").unwrap_or(false);
    let ignore_reward_blocking = m.get_bool("ignore_reward_blocking").unwrap_or(false);
    let disable_jei_recipe = m.get_bool("disable_jei_recipe").unwrap_or(false) || m.get_bool("default_quest_disable_jei").unwrap_or(false);
    // FTB writes the quest's minimum window width as `min_width`; accept the
    // legacy `min_window_width` key the app once emitted (alias unification).
    let min_window_width = m.get_i64("min_width").or_else(|| m.get_i64("min_window_width")).unwrap_or(0) as i32;
    let hide_details_until_startable = m.get_bool("hide_details_until_startable").unwrap_or(false);
    let hide_text_until_completed = m.get_bool("hide_text_until_completed").unwrap_or(false);
    let invisible_until_completed = m.get_bool("invisible_until_completed").unwrap_or(false) || m.get_bool("invisible").unwrap_or(false);
    // FTB writes `invisible_until_tasks`; accept the legacy `invisible_until_x_tasks`.
    let invisible_until_x_tasks = m.get_i64("invisible_until_tasks").or_else(|| m.get_i64("invisible_until_x_tasks")).unwrap_or(0) as i32;
    let tags = m.get_list("tags").map(|list| {
        list.iter().filter_map(|v| v.as_str().map(|s| s.to_string())).collect()
    }).unwrap_or_default();
    let hide_dependency_lines = m.get_bool("hide_dependency_lines").unwrap_or(default_hide_dep_lines);
    let hide_dependent_lines = m.get_bool("hide_dependent_lines").unwrap_or(false);
    let min_required_dependencies = m.get_i64("min_required_dependencies").unwrap_or(0) as i32;
    let dependency_requirement = m.get_str("dependency_requirement").unwrap_or("default").to_string();

    // Parse size
    // Supports: list [width, height], compound { width, height }, or scalar multiplier (FlatChapters)
    let size = if let Some(size_val) = m.get("size") {
        if let Some(size_list) = size_val.as_list() {
            if size_list.len() >= 2 {
                QuestSize {
                    width: size_list[0].as_f64().unwrap_or(24.0),
                    height: size_list[1].as_f64().unwrap_or(24.0),
                }
            } else { QuestSize::default() }
        } else if let Some(size_m) = size_val.as_compound() {
            QuestSize {
                width: size_m.get("width").and_then(|v| v.as_f64()).unwrap_or(24.0),
                height: size_m.get("height").and_then(|v| v.as_f64()).unwrap_or(24.0),
            }
        } else if let Some(scalar) = size_val.as_f64() {
            // FlatChapters scalar multiplier: size = 1.0 means 24x24, 2.0 means 48x48
            QuestSize {
                width: scalar.max(0.5) * 24.0,
                height: scalar.max(0.5) * 24.0,
            }
        } else { QuestSize::default() }
    } else { QuestSize::default() };

    // Parse tasks
    let objectives = parse_snbt_tasks(m)?;

    // Parse rewards
    let rewards = parse_snbt_rewards(m)?;

    // Parse dependencies (stored for later edge building)
    let mut data = HashMap::new();
    if let Some(deps) = m.get("dependencies") {
        if let Some(deps_list) = deps.as_list() {
            let dep_ids: Vec<String> = deps_list.iter()
                .filter_map(|v| v.as_str().map(|s| s.to_string()))
                .collect();
            if !dep_ids.is_empty() {
                data.insert("_dependencies".to_string(), dep_ids.join(","));
            }
        }
    }

    let (node_type, link_target) = if let Some(link) = m.get_str("linked_quest") {
        let target = link.to_string();
        if !target.is_empty() {
            data.insert("_link_target".to_string(), target.clone());
        }
        (QuestNodeType::QuestLink, target)
    } else if !default_enabled {
        (QuestNodeType::SideQuest, String::new())
    } else {
        (QuestNodeType::Quest, String::new())
    };

    let parsed_visibility = match visibility.as_str() {
        "always" | "always_visible" => QuestVisibility::AlwaysVisible,
        "never" | "never_visible" => QuestVisibility::NeverVisible,
        "when_dependencies_complete" | "deps_complete" => QuestVisibility::WhenDependenciesComplete,
        "when_quest_complete" | "quest_complete" => QuestVisibility::WhenQuestComplete,
        "when_all_complete" | "all_complete" => QuestVisibility::WhenAllComplete,
        _ => QuestVisibility::Normal,
    };

    let parsed_dependency_requirement = match dependency_requirement.as_str() {
        "one" | "one_completed" => DependencyRequirement::OneCompleted,
        "all_started" | "started" => DependencyRequirement::AllStarted,
        "one_started" => DependencyRequirement::OneStarted,
        _ => DependencyRequirement::AllCompleted,
    };

    Ok(QuestNode {
        id,
        node_type,
        label: title,
        description,
        position: Position { x, y },
        data,
        objectives,
        rewards,
        required_items: Vec::new(),
        chapter_id: Some(chapter_id.to_string()),
        icon,
        size,
        color,
        visibility: parsed_visibility,
        optional,
        silently_complete,
        can_be_repeatable,
        repeat_min_delay,
        repeat_max_delay,
        repeat_time,
        repeat_cooldown,
        hide_quest_until_deps_complete,
        hide_quest_until_quest_complete,
        hide_quest_until_all_complete,
        disable_reward,
        pause_reward,
        lock_icon,
        hide_lock_icon,
        guide_page,
        max_completable_dependents,
        subtitle,
        quest_background,
        shape: QuestShape::from_string(&shape),
        icon_scaling,
        tags,
        progression_mode: QuestProgressionMode::from_string(&progression_mode),
        sequential_tasks,
        disable_completion_toast,
        ignore_reward_blocking,
        disable_jei_recipe,
        min_window_width,
        hide_details_until_startable,
        hide_text_until_completed,
        invisible_until_completed,
        invisible_until_x_tasks,
        hide_dependency_lines,
        hide_dependent_lines,
        min_required_dependencies,
        dependency_requirement: parsed_dependency_requirement,
        link_target,
    })
}

// ─── SNBT Task Parser ──────────────────────────────────────────────────────

fn parse_snbt_tasks(m: &SnbtValue) -> Result<Vec<QuestObjective>> {
    let mut objectives = Vec::new();

    // Tasks can be: compound with "tasks" key containing a list, or direct list
    let tasks_val = m.get("tasks");
    let tasks_list = tasks_val.and_then(|v| v.as_list());

    if let Some(tasks) = tasks_list {
        for task_val in tasks {
            if let Ok(obj) = parse_snbt_single_task(task_val) {
                objectives.push(obj);
            }
        }
    }

    Ok(objectives)
}
