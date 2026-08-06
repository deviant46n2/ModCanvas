use crate::imports::snbt::{SnbtValue, CommentedSnbt};
use crate::quest::*;
use anyhow::Result;
use std::collections::HashMap;

use super::helpers::{ce, item_compound, item_value};

/// Convert a QuestReward to an SNBT reward compound
pub(super) fn reward_to_snbt(reward: &QuestReward, flat_chapters: bool) -> Result<SnbtValue> {
    let mut m: HashMap<String, CommentedSnbt> = HashMap::new();

    m.insert("id".to_string(), ce(SnbtValue::String(reward.id.clone())));
    if !reward.label.is_empty() {
        m.insert("title".to_string(), ce(SnbtValue::String(reward.label.clone())));
    }

    let (ftb_type, extra_fields) = match &reward.reward_type {
        RewardType::Item => {
            let mut fields = vec![
                ("item".to_string(), ce(item_value(&reward.item_id, reward.item_count, &reward.smart_filter, flat_chapters))),
            ];
            if reward.random_bonus != 0.0 {
                fields.push(("random_bonus".to_string(), ce(SnbtValue::Double(reward.random_bonus))));
            }
            if reward.only_one {
                fields.push(("only_one".to_string(), ce(SnbtValue::Byte(1))));
            }
            ("item", fields)
        }
        RewardType::ItemWithWeight => ("item", vec![
            ("item".to_string(), ce(item_value(&reward.item_id, reward.item_count, &reward.smart_filter, flat_chapters))),
            ("weight".to_string(), ce(SnbtValue::Double(reward.weight))),
        ]),
        RewardType::Experience => ("xp", vec![
            ("xp".to_string(), ce(SnbtValue::Int(reward.xp_amount))),
        ]),
        RewardType::XpLevels => ("levels", vec![
            ("levels".to_string(), ce(SnbtValue::Int(reward.xp_levels))),
        ]),
        RewardType::Command => {
            let mut fields = vec![
                ("command".to_string(), ce(SnbtValue::String(reward.command.clone()))),
            ];
            if reward.permission_level > 0 {
                fields.push(("permission_level".to_string(), ce(SnbtValue::Int(reward.permission_level))));
            }
            if reward.silent {
                fields.push(("silent".to_string(), ce(SnbtValue::Byte(1))));
            }
            if !reward.feedback_message.is_empty() {
                fields.push(("feedback_message".to_string(), ce(SnbtValue::String(reward.feedback_message.clone()))));
            }
            ("command", fields)
        }
        RewardType::LootTable => ("loot", vec![
            ("loot_table".to_string(), ce(SnbtValue::String(reward.loot_table.clone()))),
        ]),
        RewardType::Choice | RewardType::Random | RewardType::AllTable => {
            let ftb_type = match reward.reward_type {
                RewardType::Choice => "choice",
                RewardType::Random => "random",
                _ => "all",
            };
            let mut fields = Vec::new();
            if !reward.table_id.is_empty() {
                // FTB writes the raw long; reward-table files are keyed by hex.
                fields.push(("table_id".to_string(), ce(SnbtValue::Long(RewardTable::to_long_id(&reward.table_id)))));
            }
            (ftb_type, fields)
        }
        RewardType::Advancement => ("advancement", vec![
            ("advancement".to_string(), ce(SnbtValue::String(reward.item_id.clone()))),
        ]),
        RewardType::Toast => ("toast", vec![
            ("message".to_string(), ce(SnbtValue::String(reward.toast_message.clone()))),
        ]),
        RewardType::Unlock => ("unlock", vec![
            ("stage".to_string(), ce(SnbtValue::String(reward.game_stage.clone()))),
        ]),
        RewardType::GameStage => ("stage", vec![
            ("stage".to_string(), ce(SnbtValue::String(reward.game_stage.clone()))),
        ]),
        RewardType::Custom => ("item", vec![]),
    };

    m.insert("type".to_string(), ce(SnbtValue::String(ftb_type.to_string())));

    for (key, val) in extra_fields {
        m.insert(key, val);
    }

    // FTB reads the reward quantity from the top-level `count` field.
    if reward.count > 1
        && matches!(reward.reward_type, RewardType::Item | RewardType::ItemWithWeight) {
        m.insert("count".to_string(), ce(SnbtValue::Int(reward.count)));
    }

    // Choice/random/all rewards reference a reward table by id. When the reward
    // carries inline items but no resolved table, embed the pool as an internal
    // table (`table_data`), which the game treats as an embedded pool.
    if matches!(reward.reward_type, RewardType::Choice | RewardType::Random | RewardType::AllTable)
        && reward.table_id.is_empty()
        && !reward.items.is_empty() {
        let reward_list: Vec<SnbtValue> = reward.items.iter()
            .map(|item| {
                let mut item_m: HashMap<String, CommentedSnbt> = HashMap::new();
                item_m.insert("id".to_string(), ce(SnbtValue::String(format!("{:016X}", item.len() as i64 + 1))));
                item_m.insert("item".to_string(), ce(item_compound(item, 1, "")));
                item_m.insert("weight".to_string(), ce(SnbtValue::Float(1.0)));
                SnbtValue::Compound(item_m)
            })
            .collect();
        let mut table_data: HashMap<String, CommentedSnbt> = HashMap::new();
        table_data.insert("rewards".to_string(), ce(SnbtValue::List(reward_list)));
        m.insert("table_data".to_string(), ce(SnbtValue::Compound(table_data)));
    }

    if reward.item_count > 1 {
        if let Some(item_val) = m.get("item").cloned() {
            match &item_val.value {
                SnbtValue::String(item_str) => {
                    let mut item_m: HashMap<String, CommentedSnbt> = HashMap::new();
                    item_m.insert("id".to_string(), ce(SnbtValue::String(item_str.clone())));
                    item_m.insert("count".to_string(), ce(SnbtValue::Int(reward.item_count)));
                    m.insert("item".to_string(), ce(SnbtValue::Compound(item_m)));
                }
                SnbtValue::Compound(comp) => {
                    let mut extended = comp.clone();
                    extended.insert("count".to_string(), ce(SnbtValue::Int(reward.item_count)));
                    m.insert("item".to_string(), ce(SnbtValue::Compound(extended)));
                }
                _ => {}
            }
        }
    }

    // 1.20.5+ Data Components
    if !reward.nbt_data.is_empty() {
        if let Ok(comp) = crate::imports::snbt::parse_snbt(&reward.nbt_data) {
            if let Some(cm) = comp.as_compound() {
                m.insert("components".to_string(), ce(SnbtValue::Compound(cm.clone())));
            } else {
                m.insert("nbt".to_string(), ce(SnbtValue::String(reward.nbt_data.clone())));
            }
        } else {
            m.insert("nbt".to_string(), ce(SnbtValue::String(reward.nbt_data.clone())));
        }
    }

    if !reward.item_tag.is_empty() {
        m.insert("tag".to_string(), ce(SnbtValue::String(reward.item_tag.clone())));
    }

    if reward.consume_items {
        m.insert("consume_items".to_string(), ce(SnbtValue::Byte(1)));
    }

    if reward.match_nbt {
        m.insert("match_nbt".to_string(), ce(SnbtValue::Byte(1)));
    }

    if reward.ignore_nbt {
        m.insert("ignore_nbt".to_string(), ce(SnbtValue::Byte(1)));
    }

    // `team_reward` is a tristate in the format: TRUE writes 1b, FALSE writes
    // 0b, and the default omits the key. We omit when false to match that.
    if reward.team_reward {
        m.insert("team_reward".to_string(), ce(SnbtValue::Byte(1)));
    }

    if !reward.autoclaim.is_empty() {
        m.insert("auto".to_string(), ce(SnbtValue::String(reward.autoclaim.clone())));
    }

    if reward.exclude_from_claim_all {
        m.insert("exclude_from_claim_all".to_string(), ce(SnbtValue::Byte(1)));
    }

    if reward.ignore_reward_blocking {
        m.insert("ignore_reward_blocking".to_string(), ce(SnbtValue::Byte(1)));
    }

    if reward.disable_reward_screen_blur {
        m.insert("disable_reward_screen_blur".to_string(), ce(SnbtValue::Byte(1)));
    }

    Ok(SnbtValue::Compound(m))
}
