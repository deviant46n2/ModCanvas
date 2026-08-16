use super::helpers::format_color;
use crate::quest::*;
use anyhow::Result;
use std::collections::HashMap;
use uuid::Uuid;

pub(super) fn parse_json5_quest(m: &serde_json::Map<String, serde_json::Value>, chapter_id: &str, chapter_default_enabled: bool) -> Result<QuestNode> {
    let id = m.get("id").and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .unwrap_or_else(|| Uuid::new_v4().to_string());
    let title = m.get("title").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let description = json5_description(m);
    let x = m.get("x").and_then(|v| v.as_f64()).unwrap_or(0.0);
    let y = m.get("y").and_then(|v| v.as_f64()).unwrap_or(0.0);
    let icon = m.get("icon").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let color_int = m.get("color").and_then(|v| v.as_i64()).unwrap_or(-1);
    let color = if color_int >= 0 { format_color(color_int) } else { String::new() };
    let _subtitle = m.get("subtitle").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let shape = m.get("shape").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let visibility = m.get("visibility").and_then(|v| v.as_str()).unwrap_or("normal").to_string();
    let optional = m.get("optional").and_then(|v| v.as_bool()).unwrap_or(false);
    let default_enabled = m.get("default_enabled").and_then(|v| v.as_bool()).unwrap_or(chapter_default_enabled);
    let progression_mode = m.get("progression_mode").and_then(|v| v.as_str()).unwrap_or("default").to_string();
    let can_be_repeatable = m.get("can_be_repeatable").and_then(|v| v.as_bool()).unwrap_or(false)
        || m.get("can_repeat").and_then(|v| v.as_bool()).unwrap_or(false);
    let repeat_cooldown = m.get("repeat_cooldown").and_then(|v| v.as_i64()).unwrap_or(0);
    let hide_lock_icon = m.get("hide_lock_icon").and_then(|v| v.as_bool()).unwrap_or(false);
    let guide_page = m.get("guide_page").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let max_completable_dependents = m.get("max_completable_dependents").and_then(|v| v.as_i64()).unwrap_or(0) as i32;
    let invisible_until_completed = m.get("invisible").and_then(|v| v.as_bool()).unwrap_or(false);
    let invisible_until_x_tasks = m.get("invisible_until_tasks").and_then(|v| v.as_i64()).unwrap_or(0) as i32;
    // FTB writes `min_width`; accept the legacy `min_window_width` key too.
    let min_window_width = m.get("min_width").and_then(|v| v.as_i64()).unwrap_or(0) as i32;
    let tags = m.get("tags").and_then(|v| v.as_array()).map(|arr| {
        arr.iter().filter_map(|v| v.as_str().map(|s| s.to_string())).collect()
    }).unwrap_or_default();
    let min_required_dependencies = m.get("min_required_dependencies").and_then(|v| v.as_i64()).unwrap_or(0) as i32;
    let dependency_requirement = m.get("dependency_requirement").and_then(|v| v.as_str()).unwrap_or("default").to_string();
    let hide_details_until_startable = m.get("hide_details_until_startable").and_then(|v| v.as_bool()).unwrap_or(false);
    let hide_text_until_completed = m.get("hide_text_until_complete").and_then(|v| v.as_bool()).unwrap_or(false);
    let hide_dependency_lines = m.get("hide_dependency_lines").and_then(|v| v.as_bool()).unwrap_or(false);
    let hide_dependent_lines = m.get("hide_dependent_lines").and_then(|v| v.as_bool()).unwrap_or(false);
    let parsed_dependency_requirement = match dependency_requirement.as_str() {
        "one" | "one_completed" => DependencyRequirement::OneCompleted,
        "all_started" | "started" => DependencyRequirement::AllStarted,
        "one_started" => DependencyRequirement::OneStarted,
        _ => DependencyRequirement::AllCompleted,
    };

    let mut data = HashMap::new();
    if let Some(deps) = m.get("dependencies").and_then(|v| v.as_array()) {
        let dep_ids: Vec<String> = deps.iter().filter_map(|v| v.as_str().map(|s| s.to_string())).collect();
        if !dep_ids.is_empty() {
            data.insert("_dependencies".to_string(), dep_ids.join(","));
        }
    }
    let link_target = m.get("linked_quest").and_then(|v| v.as_str()).unwrap_or("").to_string();
    if !link_target.is_empty() {
        data.insert("_link_target".to_string(), link_target.clone());
    }

    let parsed_visibility = match visibility.as_str() {
        "always" | "always_visible" => QuestVisibility::AlwaysVisible,
        "never" | "never_visible" => QuestVisibility::NeverVisible,
        "when_dependencies_complete" => QuestVisibility::WhenDependenciesComplete,
        "when_quest_complete" => QuestVisibility::WhenQuestComplete,
        "when_all_complete" => QuestVisibility::WhenAllComplete,
        _ => QuestVisibility::Normal,
    };

    // Parse tasks
    let objectives = if let Some(tasks) = m.get("tasks").and_then(|v| v.as_array()) {
        tasks.iter().filter_map(|t| {
            t.as_object().and_then(|tm| parse_json5_task(tm).ok())
        }).collect()
    } else { Vec::new() };

    // Parse rewards
    let rewards = if let Some(rewards_arr) = m.get("rewards").and_then(|v| v.as_array()) {
        rewards_arr.iter().filter_map(|r| {
            r.as_object().and_then(|rm| parse_json5_reward(rm).ok())
        }).collect()
    } else { Vec::new() };

    Ok(QuestNode {
        id,
        node_type: if !link_target.is_empty() {
            QuestNodeType::QuestLink
        } else if !default_enabled {
            QuestNodeType::SideQuest
        } else {
            QuestNodeType::Quest
        },
        label: title,
        description,
        position: Position { x, y },
        data,
        objectives,
        rewards,
        required_items: Vec::new(),
        chapter_id: Some(chapter_id.to_string()),
        icon,
        size: QuestSize::default(),
        color,
        visibility: parsed_visibility,
        optional,
        shape: QuestShape::from_string(&shape),
        progression_mode: QuestProgressionMode::from_string(&progression_mode),
        link_target,
        can_be_repeatable,
        repeat_cooldown,
        hide_lock_icon,
        guide_page,
        max_completable_dependents,
        invisible_until_completed,
        invisible_until_x_tasks,
        min_window_width,
        tags,
        min_required_dependencies,
        dependency_requirement: parsed_dependency_requirement,
        hide_details_until_startable,
        hide_text_until_completed,
        hide_dependency_lines,
        hide_dependent_lines,
        ..Default::default()
    })
}

fn json5_description(m: &serde_json::Map<String, serde_json::Value>) -> String {
    match m.get("description") {
        Some(serde_json::Value::String(s)) => s.clone(),
        Some(serde_json::Value::Array(arr)) => {
            arr.iter().filter_map(|v| v.as_str().map(|s| s.to_string())).collect::<Vec<_>>().join("\n")
        }
        _ => String::new(),
    }
}

fn parse_json5_task(m: &serde_json::Map<String, serde_json::Value>) -> Result<QuestObjective> {
    let id = m.get("id").and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .unwrap_or_else(|| Uuid::new_v4().to_string());
    let title = m.get("title").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let task_type = m.get("type").and_then(|v| v.as_str()).unwrap_or("item").to_string();
    let count = m.get("count").and_then(|v| v.as_i64()).unwrap_or(1) as i32;

    let (objective_type, target) = match task_type.as_str() {
        "item" | "ftbquests:item" | "minecraft:item" => {
            let item = m.get("item").and_then(|v| v.as_str()).unwrap_or("").to_string();
            (ObjectiveType::ItemAcquisition, item)
        }
        "kill" | "ftbquests:kill" => {
            let entity = m.get("entity").or_else(|| m.get("entity_type")).and_then(|v| v.as_str()).unwrap_or("").to_string();
            (ObjectiveType::EntityKill, entity)
        }
        "advancement" | "ftbquests:advancement" => {
            let adv = m.get("advancement").and_then(|v| v.as_str()).unwrap_or("").to_string();
            (ObjectiveType::Advancement, adv)
        }
        "checkmark" | "ftbquests:checkmark" => (ObjectiveType::Checkmark, String::new()),
        "xp" | "ftbquests:xp" => (ObjectiveType::Xp, String::new()),
        "fluid" | "ftbquests:fluid" => {
            let fluid = m.get("fluid").and_then(|v| v.as_str()).unwrap_or("").to_string();
            (ObjectiveType::Fluid, fluid)
        }
        "energy" | "ftbquests:energy" => (ObjectiveType::Energy, String::new()),
        "stat" | "ftbquests:stat" => {
            let stat = m.get("stat").and_then(|v| v.as_str()).unwrap_or("").to_string();
            (ObjectiveType::Stat, stat)
        }
        "observation" | "ftbquests:observation" => (ObjectiveType::Observation, String::new()),
        "biome" | "ftbquests:biome" => {
            let biome = m.get("biome").and_then(|v| v.as_str()).unwrap_or("").to_string();
            (ObjectiveType::VisitBiome, biome)
        }
        "structure" | "ftbquests:structure" => {
            let s = m.get("structure").and_then(|v| v.as_str()).unwrap_or("").to_string();
            (ObjectiveType::FindStructure, s)
        }
        "stage" | "ftbquests:stage" => {
            let stage = m.get("stage").and_then(|v| v.as_str()).unwrap_or("").to_string();
            (ObjectiveType::GameStage, stage)
        }
        "location" | "ftbquests:location" => {
            let dim = m.get("dimension").and_then(|v| v.as_str()).unwrap_or("").to_string();
            (ObjectiveType::LocationVisit, dim)
        }
        _ => (ObjectiveType::Custom, task_type),
    };

    Ok(QuestObjective {
        id,
        label: if title.is_empty() { objective_type.display_name().to_string() } else { title },
        objective_type,
        target,
        target_count: count,
        required: !m.get("optional_task").or_else(|| m.get("optional")).and_then(|v| v.as_bool()).unwrap_or(false),
        custom_name: m.get("custom_name").and_then(|v| v.as_str()).unwrap_or("").to_string(),
        entity_type_tag: m.get("entityTypeTag").or_else(|| m.get("tag")).and_then(|v| v.as_str()).unwrap_or("").to_string(),
        nbt_filter: m.get("nbt_filter").and_then(|v| v.as_str()).unwrap_or("").to_string(),
        team_stage: m.get("team_stage").and_then(|v| v.as_bool()).unwrap_or(false),
        criterion: m.get("criterion").and_then(|v| v.as_str()).unwrap_or("").to_string(),
        consume_items: m.get("consume_items").and_then(|v| v.as_bool()).unwrap_or(false),
        match_nbt: m.get("match_nbt").and_then(|v| v.as_bool()).unwrap_or(false),
        ignore_nbt: m.get("ignore_nbt").and_then(|v| v.as_bool()).unwrap_or(false),
        task_screen_only: m.get("task_screen_only").and_then(|v| v.as_bool()).unwrap_or(false),
        only_from_crafting: m.get("only_from_crafting").and_then(|v| v.as_bool()).unwrap_or(false),
        match_components: m.get("match_components").and_then(|v| v.as_bool()).unwrap_or(false),
        ..Default::default()
    })
}

pub(super) fn parse_json5_reward(m: &serde_json::Map<String, serde_json::Value>) -> Result<QuestReward> {
    let id = m.get("id").and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .unwrap_or_else(|| Uuid::new_v4().to_string());
    let title = m.get("title").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let reward_type_str = m.get("type").and_then(|v| v.as_str()).unwrap_or("item").to_string();

    let (reward_type, item_id) = match reward_type_str.as_str() {
        "item" | "ftbquests:item" | "minecraft:item" => {
            let item = m.get("item").and_then(|v| v.as_str()).unwrap_or("").to_string();
            (RewardType::Item, item)
        }
        "xp" | "ftbquests:xp" => (RewardType::Experience, String::new()),
        "levels" | "ftbquests:levels" => (RewardType::XpLevels, String::new()),
        "command" | "ftbquests:command" => {
            let cmd = m.get("command").and_then(|v| v.as_str()).unwrap_or("").to_string();
            (RewardType::Command, cmd)
        }
        "loot" | "ftbquests:loot" => {
            let table = m.get("loot_table").and_then(|v| v.as_str()).unwrap_or("").to_string();
            (RewardType::LootTable, table)
        }
        "choice" | "ftbquests:choice" => {
            let table_id = m.get("table_id").and_then(|v| v.as_i64());
            let table_hex = table_id.map(|t| RewardTable::to_hex_id(t)).unwrap_or_default();
            (RewardType::Choice, table_hex)
        }
        "random" | "ftbquests:random" => {
            let table_id = m.get("table_id").and_then(|v| v.as_i64());
            let table_hex = table_id.map(|t| RewardTable::to_hex_id(t)).unwrap_or_default();
            (RewardType::Random, table_hex)
        }
        "all" | "ftbquests:all" | "all_table" | "ftbquests:all_table" => {
            let table_id = m.get("table_id").and_then(|v| v.as_i64());
            let table_hex = table_id.map(|t| RewardTable::to_hex_id(t)).unwrap_or_default();
            (RewardType::AllTable, table_hex)
        }
        "advancement" | "ftbquests:advancement" => {
            let adv = m.get("advancement").and_then(|v| v.as_str()).unwrap_or("").to_string();
            (RewardType::Advancement, adv)
        }
        "toast" | "ftbquests:toast" => (RewardType::Toast, String::new()),
        "stage" | "ftbquests:stage" => {
            let stage = m.get("stage").and_then(|v| v.as_str()).unwrap_or("").to_string();
            (RewardType::GameStage, stage)
        }
        _ => (RewardType::Custom, reward_type_str),
    };

    let is_table_type = matches!(reward_type, RewardType::Choice | RewardType::Random | RewardType::AllTable);
    Ok(QuestReward {
        id,
        label: if title.is_empty() { reward_type.display_name().to_string() } else { title },
        reward_type,
        item_id: if is_table_type { String::new() } else { item_id.clone() },
        table_id: if is_table_type { item_id } else { String::new() },
        random_bonus: m.get("random_bonus").and_then(|v| v.as_f64()).unwrap_or(0.0),
        only_one: m.get("only_one").and_then(|v| v.as_bool()).unwrap_or(false),
        permission_level: m.get("permission_level").and_then(|v| v.as_i64()).unwrap_or(0) as i32,
        silent: m.get("silent").and_then(|v| v.as_bool()).unwrap_or(false),
        feedback_message: m.get("feedback_message").and_then(|v| v.as_str()).unwrap_or("").to_string(),
        team_reward: m.get("team_reward").and_then(|v| v.as_bool()).unwrap_or(false),
        autoclaim: m.get("auto").and_then(|v| v.as_str()).unwrap_or("").to_string(),
        exclude_from_claim_all: m.get("exclude_from_claim_all").and_then(|v| v.as_bool()).unwrap_or(false),
        ignore_reward_blocking: m.get("ignore_reward_blocking").and_then(|v| v.as_bool()).unwrap_or(false),
        disable_reward_screen_blur: m.get("disable_reward_screen_blur").and_then(|v| v.as_bool()).unwrap_or(false),
        ..Default::default()
    })
}
