use super::helpers::{extract_smart_filter, parse_description, parse_item_task};
use crate::imports::snbt::SnbtValue;
use crate::quest::*;
use anyhow::Result;
use uuid::Uuid;

// ─── SNBT Reward Parser ────────────────────────────────────────────────────

pub(super) fn parse_snbt_rewards(m: &SnbtValue) -> Result<Vec<QuestReward>> {
    let mut rewards = Vec::new();

    if let Some(rewards_val) = m.get("rewards") {
        if let Some(rewards_list) = rewards_val.as_list() {
            for reward_val in rewards_list {
                if let Ok(r) = parse_snbt_single_reward(reward_val) {
                    rewards.push(r);
                }
            }
        }
    }

    Ok(rewards)
}

pub(super) fn parse_snbt_single_reward(m: &SnbtValue) -> Result<QuestReward> {
    let id = m.get_str("id")
        .map(|s| s.to_string())
        .unwrap_or_else(|| Uuid::new_v4().to_string());
    let title = m.get_str("title").unwrap_or("").to_string();
    let reward_type_str = m.get_str("type").unwrap_or("item").to_string();
    let description = parse_description(m);

    let mut reward = QuestReward {
        id,
        label: String::new(),
        reward_type: RewardType::Item,
        items: Vec::new(),
        description,
        item_id: String::new(),
        item_count: 1,
        item_tag: String::new(),
        nbt_data: String::new(),
        smart_filter: String::new(),
        xp_amount: 0,
        xp_levels: 0,
        command: String::new(),
        loot_table: String::new(),
        game_stage: String::new(),
        weight: 1.0,
        reward_chests: Vec::new(),
        team_reward: false,
        toast_message: String::new(),
        table_id: String::new(),
        choices: Vec::new(),
        consume_items: false,
        match_nbt: false,
        ignore_nbt: false,
        random_bonus: 0.0,
        only_one: false,
        permission_level: 0,
        silent: false,
        feedback_message: String::new(),
        autoclaim: String::new(),
        exclude_from_claim_all: false,
        ignore_reward_blocking: false,
        disable_reward_screen_blur: false,
    };

    match reward_type_str.as_str() {
        "item" | "ftbquests:item" | "minecraft:item" => {
            let (item, count) = parse_item_task(m);
            reward.reward_type = RewardType::Item;
            reward.item_id = item;
            reward.item_count = count;
            reward.random_bonus = m.get_f64("random_bonus").unwrap_or(0.0);
            reward.only_one = m.get_bool("only_one").unwrap_or(false);
            // Handle components (1.20.5+)
            if let Some(components) = m.get("components").and_then(|v| v.as_compound()) {
                reward.nbt_data = crate::imports::snbt::compound_to_snbt(&components);
            }
        }
        "item_weighted" | "ftbquests:item_weighted" | "minecraft:item_weighted" => {
            let (item, count) = parse_item_task(m);
            reward.reward_type = RewardType::ItemWithWeight;
            reward.item_id = item;
            reward.item_count = count;
            reward.weight = m.get_f64("weight").unwrap_or(1.0);
            if let Some(components) = m.get("components").and_then(|v| v.as_compound()) {
                reward.nbt_data = crate::imports::snbt::compound_to_snbt(&components);
            }
        }
        "xp" | "ftbquests:xp" | "minecraft:xp" => {
            reward.reward_type = RewardType::Experience;
            reward.xp_amount = m.get_i64("xp").unwrap_or(0) as i32;
        }
        "levels" | "ftbquests:levels" | "minecraft:levels" | "xp_levels" => {
            reward.reward_type = RewardType::XpLevels;
            reward.xp_levels = m.get_i64("levels").unwrap_or(0) as i32;
        }
        "command" | "ftbquests:command" | "minecraft:command" => {
            reward.reward_type = RewardType::Command;
            reward.command = m.get_str("command").unwrap_or("").to_string();
            reward.permission_level = m.get_i64("permission_level").unwrap_or(0) as i32;
            reward.silent = m.get_bool("silent").unwrap_or(false);
            reward.feedback_message = m.get_str("feedback_message").unwrap_or("").to_string();
        }
        "loot" | "ftbquests:loot" | "minecraft:loot" => {
            reward.reward_type = RewardType::LootTable;
            reward.loot_table = m.get_str("loot_table").unwrap_or("").to_string();
        }
        "choice" | "ftbquests:choice" | "minecraft:choice" => {
            reward.reward_type = RewardType::Choice;
            reward.items = parse_reward_items(m);
            if let Some(table_id) = m.get_i64("table_id") {
                reward.table_id = RewardTable::to_hex_id(table_id);
            }
        }
        "random" | "ftbquests:random" | "minecraft:random" => {
            reward.reward_type = RewardType::Random;
            reward.items = parse_reward_items(m);
            if let Some(table_id) = m.get_i64("table_id") {
                reward.table_id = RewardTable::to_hex_id(table_id);
            }
        }
        "all" | "ftbquests:all" | "minecraft:all" => {
            reward.reward_type = RewardType::AllTable;
            reward.items = parse_reward_items(m);
            if let Some(table_id) = m.get_i64("table_id") {
                reward.table_id = RewardTable::to_hex_id(table_id);
            }
        }
        "advancement" | "ftbquests:advancement" | "minecraft:advancement" => {
            reward.reward_type = RewardType::Advancement;
            reward.item_id = m.get_str("advancement").unwrap_or("").to_string();
        }
        "toast" | "ftbquests:toast" | "minecraft:toast" => {
            reward.reward_type = RewardType::Toast;
            reward.toast_message = m.get_str("message").unwrap_or("").to_string();
        }
        "stage" | "ftbquests:stage" | "minecraft:stage" => {
            reward.reward_type = RewardType::GameStage;
            reward.game_stage = m.get_str("stage").unwrap_or("").to_string();
        }
        "unlock" | "ftbquests:unlock" | "minecraft:unlock" => {
            reward.reward_type = RewardType::Unlock;
            reward.game_stage = m.get_str("stage").unwrap_or("").to_string();
        }
        _ => {
            reward.reward_type = RewardType::Custom;
            reward.item_id = reward_type_str;
        }
    }

    // Common fields
    if let Some(nbt) = m.get_str("nbt") {
        reward.nbt_data = nbt.to_string();
    }
    // Table entries always carry a weight even when the type is plain "item".
    if reward.reward_type != RewardType::ItemWithWeight {
        if let Some(w) = m.get_f64("weight") {
            reward.weight = w;
        }
    }
    if let Some(components) = m.get("components").and_then(|v| v.as_compound()) {
        reward.nbt_data = crate::imports::snbt::compound_to_snbt(&components);
    }
    if let Some(tag) = m.get_str("tag") {
        reward.item_tag = tag.to_string();
    }
    reward.smart_filter = extract_smart_filter(m);
    reward.consume_items = m.get_bool("consume_items").unwrap_or(false);
    reward.match_nbt = m.get_bool("match_nbt").unwrap_or(false);
    reward.ignore_nbt = m.get_bool("ignore_nbt").unwrap_or(false);
    reward.team_reward = m.get_bool("team_reward").unwrap_or(false);
    reward.autoclaim = m.get_str("auto").unwrap_or("").to_string();
    reward.exclude_from_claim_all = m.get_bool("exclude_from_claim_all").unwrap_or(false);
    reward.ignore_reward_blocking = m.get_bool("ignore_reward_blocking").unwrap_or(false);
    reward.disable_reward_screen_blur = m.get_bool("disable_reward_screen_blur").unwrap_or(false);

    reward.label = if title.is_empty() { reward.reward_type.display_name().to_string() } else { title };

    Ok(reward)
}

fn parse_reward_items(m: &SnbtValue) -> Vec<String> {
    let mut items = Vec::new();

    if let Some(items_val) = m.get("items") {
        match items_val {
            SnbtValue::Compound(map) => {
                for (_key, val) in map {
                    if let Some(item_str) = val.get_str("item") {
                        items.push(item_str.to_string());
                    } else if let Some(id) = val.get("id").and_then(|v| v.as_str()) {
                        items.push(id.to_string());
                    }
                }
            }
            SnbtValue::List(list) => {
                for val in list {
                    if let Some(item_str) = val.get_str("item") {
                        items.push(item_str.to_string());
                    } else if let Some(id) = val.get("id").and_then(|v| v.as_str()) {
                        items.push(id.to_string());
                    }
                }
            }
            _ => {}
        }
    }

    items
}
