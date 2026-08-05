use super::super::types::{FtBQuestsFormat, FtBQuestsImportResult, ImportIssue, IssueSeverity, IssueCategory};
use super::json5::parse_json5_reward;
use super::reward::parse_snbt_single_reward;
use crate::imports::snbt::{CommentedSnbt, parse_snbt};
use crate::quest::*;
use anyhow::Result;
use std::collections::HashMap;
use std::path::Path;

// ─── Reward Tables ──────────────────────────────────────────────────────────

/// Parse `quests_dir/reward_tables/*.snbt|json5` weighted pools into the graph,
/// then resolve `table_id` references on random/choice/all_table rewards so the
/// table's item list is available to the editor.
pub(super) fn parse_reward_tables(quests_dir: &Path, format: FtBQuestsFormat, graph: &mut QuestGraph, result: &mut FtBQuestsImportResult) {
    let tables_dir = quests_dir.join("reward_tables");
    if !tables_dir.is_dir() {
        return;
    }

    let mut tables: Vec<RewardTable> = Vec::new();
    if let Ok(entries) = std::fs::read_dir(&tables_dir) {
        for entry in entries.flatten() {
            let file_path = entry.path();
            if !file_path.is_file() { continue; }
            let ext = file_path.extension().unwrap_or_default();
            let parsed = match format {
                FtBQuestsFormat::Snbt if ext == "snbt" => parse_snbt_reward_table_file(&file_path),
                FtBQuestsFormat::Json5 if ext == "json5" || ext == "json" => parse_json5_reward_table_file(&file_path),
                _ => continue,
            };
            match parsed {
                Ok(Some(table)) => tables.push(table),
                Ok(None) => {}
                Err(e) => {
                    result.issues.push(ImportIssue {
                        severity: IssueSeverity::Warning,
                        category: IssueCategory::ParseError,
                        message: format!("Failed to parse reward table: {e}"),
                        file: Some(file_path.display().to_string()),
                        node_id: None,
                    });
                }
            }
        }
    }

    tables.sort_by_key(|t| t.order_index);
    // Preserve stable ids for existing tables by name, then add new ones.
    for table in tables {
        if !graph.reward_tables.iter().any(|t| t.id == table.id) {
            graph.reward_tables.push(table);
        }
    }

    // Resolve table_id references on rewards across all quest nodes.
    for node in graph.nodes.iter_mut() {
        if !matches!(node.node_type, QuestNodeType::Quest | QuestNodeType::SideQuest) {
            continue;
        }
        for reward in node.rewards.iter_mut() {
            match reward.reward_type {
                RewardType::Random | RewardType::Choice | RewardType::AllTable => {
                    if reward.table_id.is_empty() {
                        continue;
                    }
                    let long_id = RewardTable::to_long_id(&reward.table_id);
                    if let Some(table) = graph.reward_tables.iter().find(|t| RewardTable::to_long_id(&t.id) == long_id) {
                        if reward.items.is_empty() {
                            reward.items = table.rewards.iter()
                                .map(|r| r.item_id.clone())
                                .filter(|i| !i.is_empty())
                                .collect();
                        }
                    }
                }
                _ => {}
            }
        }
    }
}

/// Parse a single `reward_tables/<hex_id>.snbt` file into a `RewardTable`.
fn parse_snbt_reward_table_file(path: &Path) -> Result<Option<RewardTable>> {
    let content = std::fs::read_to_string(path)?;
    let snbt = parse_snbt(&content)?;
    let map = snbt.as_compound().ok_or_else(|| anyhow::anyhow!("reward table root is not a compound"))?;
    let table = parse_snbt_reward_table(map)?;
    Ok(Some(table))
}

fn parse_snbt_reward_table(map: &HashMap<String, CommentedSnbt>) -> Result<RewardTable> {
    let id = map.get("id").and_then(|v| v.value.as_str()).unwrap_or("").to_string();
    let mut rewards = Vec::new();
    if let Some(list) = map.get("rewards").and_then(|v| v.value.as_list()) {
        for reward_val in list {
            if let Ok(r) = parse_snbt_single_reward(reward_val) {
                rewards.push(r);
            }
        }
    }
    Ok(RewardTable {
        id,
        title: map.get("title").and_then(|v| v.value.as_str()).unwrap_or("").to_string(),
        order_index: map.get("order_index").and_then(|v| v.value.as_i64()).unwrap_or(0) as i32,
        loot_size: map.get("loot_size").and_then(|v| v.value.as_i64()).unwrap_or(0) as i32,
        empty_weight: map.get("empty_weight").and_then(|v| v.value.as_f64()).unwrap_or(0.0),
        hide_tooltip: map.get("hide_tooltip").and_then(|v| v.value.as_bool()).unwrap_or(false),
        use_title: map.get("use_title").and_then(|v| v.value.as_bool()).unwrap_or(true),
        rewards,
    })
}

/// Parse a single `reward_tables/<hex_id>.json5` file into a `RewardTable`.
fn parse_json5_reward_table_file(path: &Path) -> Result<Option<RewardTable>> {
    let content = std::fs::read_to_string(path)?;
    let val: serde_json::Value = serde_json::from_str(&content)?;
    let obj = val.as_object().ok_or_else(|| anyhow::anyhow!("reward table root is not an object"))?;

    let mut rewards = Vec::new();
    if let Some(serde_json::Value::Array(list)) = obj.get("rewards") {
        for reward_val in list {
            if let Some(reward_obj) = reward_val.as_object() {
                if let Ok(r) = parse_json5_reward(reward_obj) {
                    rewards.push(r);
                }
            }
        }
    }

    Ok(Some(RewardTable {
        id: obj.get("id").and_then(|v| v.as_str()).unwrap_or("").to_string(),
        title: obj.get("title").and_then(|v| v.as_str()).unwrap_or("").to_string(),
        order_index: obj.get("order_index").and_then(|v| v.as_i64()).unwrap_or(0) as i32,
        loot_size: obj.get("loot_size").and_then(|v| v.as_i64()).unwrap_or(0) as i32,
        empty_weight: obj.get("empty_weight").and_then(|v| v.as_f64()).unwrap_or(0.0),
        hide_tooltip: obj.get("hide_tooltip").and_then(|v| v.as_bool()).unwrap_or(false),
        use_title: obj.get("use_title").and_then(|v| v.as_bool()).unwrap_or(true),
        rewards,
    }))
}
