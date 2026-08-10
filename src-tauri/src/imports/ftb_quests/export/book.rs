// export/book.rs — book-level file writes: data.snbt + chapter_groups.snbt.
// Split out of export/mod.rs when it passed the 300-line cap (s30 debt
// payment, 303 -> under). The data.snbt map is a flat book-level settings
// dump; chapter groups are written here too (same sidecar merge pattern).

use crate::imports::snbt::{SnbtValue, CommentedSnbt, compound_to_snbt};
use super::snbt_sidecar;
use crate::quest::*;
use anyhow::Result;
use std::collections::HashMap;
use std::path::Path;

use super::helpers::ce;
use super::reward::reward_to_snbt;

/// Write `data.snbt` — the book-level settings map. `effective_sidecar` is
/// the comment-recovery map; unchanged fields keep their comments.
pub(crate) fn write_book_snbt(graph: &QuestGraph, quests_dir: &Path, effective_sidecar: &snbt_sidecar::SnbtSidecar) -> Result<()> {
    let mut data_map = HashMap::new();
    data_map.insert("version".to_string(), ce(SnbtValue::Int(13)));
    if graph.default_reward_team {
        data_map.insert("default_reward_team".to_string(), ce(SnbtValue::Byte(1)));
    } else {
        data_map.insert("default_reward_team".to_string(), ce(SnbtValue::Byte(0)));
    }
    if graph.default_consume_items {
        data_map.insert("default_consume_items".to_string(), ce(SnbtValue::Byte(1)));
    } else {
        data_map.insert("default_consume_items".to_string(), ce(SnbtValue::Byte(0)));
    }
    let autoclaim = if graph.default_autoclaim_rewards.is_empty() {
        "disabled".to_string()
    } else {
        graph.default_autoclaim_rewards.clone()
    };
    data_map.insert("default_autoclaim_rewards".to_string(), ce(SnbtValue::String(autoclaim)));
    data_map.insert("default_quest_shape".to_string(), ce(SnbtValue::String(graph.default_quest_shape.to_string())));
    data_map.insert("progression_mode".to_string(), ce(SnbtValue::String(graph.book_progression_mode.to_string())));
    data_map.insert("grid_scale".to_string(), ce(SnbtValue::Double(graph.grid_scale)));
    data_map.insert("detection_delay".to_string(), ce(SnbtValue::Int(graph.detection_delay)));
    data_map.insert("emergency_items_cooldown".to_string(), ce(SnbtValue::Int(graph.emergency_items_cooldown)));
    data_map.insert("lock_message".to_string(), ce(SnbtValue::String(graph.lock_message.clone())));
    data_map.insert("show_lock_icons".to_string(), ce(SnbtValue::Byte(if graph.show_lock_icons { 1 } else { 0 })));
    data_map.insert("fallback_locale".to_string(), ce(SnbtValue::String(graph.fallback_locale.clone())));
    data_map.insert("disable_gui".to_string(), ce(SnbtValue::Byte(if graph.disable_gui { 1 } else { 0 })));
    data_map.insert("pause_game".to_string(), ce(SnbtValue::Byte(if graph.pause_game { 1 } else { 0 })));
    data_map.insert("drop_book_on_death".to_string(), ce(SnbtValue::Byte(if graph.drop_book_on_death { 1 } else { 0 })));
    data_map.insert("drop_loot_crates".to_string(), ce(SnbtValue::Byte(if graph.drop_loot_crates { 1 } else { 0 })));
    data_map.insert("hide_excluded_quests".to_string(), ce(SnbtValue::Byte(if graph.hide_excluded_quests { 1 } else { 0 })));
    data_map.insert("verify_on_load".to_string(), ce(SnbtValue::Byte(if graph.verify_on_load { 1 } else { 0 })));
    data_map.insert("default_quest_disable_jei".to_string(), ce(SnbtValue::Byte(if graph.default_quest_disable_jei { 1 } else { 0 })));
    let loot_crate_map = HashMap::from([
        ("boss".to_string(), ce(SnbtValue::Int(graph.loot_crate_no_drop.boss))),
        ("monster".to_string(), ce(SnbtValue::Int(graph.loot_crate_no_drop.monster))),
        ("passive".to_string(), ce(SnbtValue::Int(graph.loot_crate_no_drop.passive))),
    ]);
    data_map.insert("loot_crate_no_drop".to_string(), ce(SnbtValue::Compound(loot_crate_map)));
    if !graph.emergency_items.is_empty() {
        let items: Vec<SnbtValue> = graph.emergency_items.iter().map(|item| {
            let mut m = HashMap::new();
            m.insert("id".to_string(), ce(SnbtValue::String(item.id.clone())));
            m.insert("count".to_string(), ce(SnbtValue::Int(item.count)));
            SnbtValue::Compound(m)
        }).collect();
        data_map.insert("emergency_items".to_string(), ce(SnbtValue::List(items)));
    }
    crate::path_safety::atomic_write_str(
        &quests_dir.join("data.snbt"),
        &compound_to_snbt(&snbt_sidecar::merge_book_comments(effective_sidecar, "book:data", &data_map).unwrap_or(data_map)),
    )
        .map_err(|e| anyhow::anyhow!("{e}"))?;

    // Export chapter groups (quests_dir/chapter_groups.snbt). FTB reads group
    // membership either from this file or from the per-chapter `group` key; we
    // write both so the ordering and titles round-trip cleanly.
    if !graph.chapter_groups.is_empty() {
        let mut groups = graph.chapter_groups.clone();
        groups.sort_by_key(|g| g.order_index);
        let group_values: Vec<SnbtValue> = groups
            .iter()
            .map(|g| {
                let mut m: HashMap<String, CommentedSnbt> = HashMap::new();
                m.insert("id".to_string(), ce(SnbtValue::String(g.id.clone())));
                if !g.title.is_empty() {
                    m.insert("title".to_string(), ce(SnbtValue::String(g.title.clone())));
                }
                SnbtValue::Compound(m)
            })
            .collect();
        let mut groups_compound: HashMap<String, CommentedSnbt> = HashMap::new();
        groups_compound.insert("chapter_groups".to_string(), ce(SnbtValue::List(group_values)));
        let groups_out = snbt_sidecar::merge_book_comments(effective_sidecar, "book:chapter_groups", &groups_compound)
            .unwrap_or(groups_compound);
        crate::path_safety::atomic_write_str(
            &quests_dir.join("chapter_groups.snbt"),
            &compound_to_snbt(&groups_out),
        )
        .map_err(|e| anyhow::anyhow!("{e}"))?;
    }

    Ok(())
}

/// Write `reward_tables/<hex_id>.snbt` for each table. Random/choice rewards
/// reference these by `table_id`; FTB keys the file by the 16-digit uppercase
/// hex form of the id.
pub(crate) fn write_reward_tables_snbt(graph: &QuestGraph, quests_dir: &Path, effective_sidecar: &snbt_sidecar::SnbtSidecar) -> Result<()> {
    if graph.reward_tables.is_empty() {
        return Ok(());
    }
    let reward_tables_dir = quests_dir.join("reward_tables");
    std::fs::create_dir_all(&reward_tables_dir)?;
    let mut tables = graph.reward_tables.clone();
    tables.sort_by_key(|t| t.order_index);
    for (order_index, table) in tables.iter().enumerate() {
        let hex_id = if table.id.len() == 16 {
            table.id.clone()
        } else {
            RewardTable::to_hex_id(RewardTable::to_long_id(&table.id))
        };
        let mut m: HashMap<String, CommentedSnbt> = HashMap::new();
        m.insert("id".to_string(), ce(SnbtValue::String(hex_id.clone())));
        m.insert("order_index".to_string(), ce(SnbtValue::Int(order_index as i32)));
        if !table.title.is_empty() {
            m.insert("title".to_string(), ce(SnbtValue::String(table.title.clone())));
        }
        if table.loot_size > 0 {
            m.insert("loot_size".to_string(), ce(SnbtValue::Int(table.loot_size)));
        }
        if table.empty_weight > 0.0 {
            m.insert("empty_weight".to_string(), ce(SnbtValue::Float(table.empty_weight as f32)));
        }
        if table.hide_tooltip {
            m.insert("hide_tooltip".to_string(), ce(SnbtValue::Byte(1)));
        }
        if table.use_title {
            m.insert("use_title".to_string(), ce(SnbtValue::Byte(1)));
        }
        let reward_list: Vec<SnbtValue> = table.rewards.iter()
            .filter_map(|r| reward_to_snbt(r, true).ok())
            .collect();
        m.insert("rewards".to_string(), ce(SnbtValue::List(reward_list)));

        let sidecar_key = format!("book:reward_table:{hex_id}");
        let table_out = snbt_sidecar::merge_book_comments(effective_sidecar, &sidecar_key, &m).unwrap_or(m);

        crate::path_safety::atomic_write_str(
            &reward_tables_dir.join(format!("{hex_id}.snbt")),
            &compound_to_snbt(&table_out),
        )
        .map_err(|e| anyhow::anyhow!("{e}"))?;
    }

    Ok(())
}
