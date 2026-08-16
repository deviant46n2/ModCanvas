use super::super::types::{FtBQuestsFormat, FtBQuestsImportResult, SnbtMapHelper};
use crate::imports::snbt::parse_snbt;
use crate::quest::*;
use anyhow::Result;
use std::path::Path;

/// Infer Minecraft version from FTB Quests format and version
pub(super) fn infer_minecraft_version(format: FtBQuestsFormat, ftb_version: &Option<String>) -> String {
    match format {
        FtBQuestsFormat::Json5 => {
            // Json5 format was introduced in FTB Quests 1800+ (1.20.5+)
            if let Some(v) = ftb_version {
                if let Some(major) = v.split('.').next() {
                    if let Ok(major_num) = major.parse::<u32>() {
                        if major_num >= 26 {
                            return "1.20.5+".to_string();
                        }
                    }
                }
            }
            "1.20.5+".to_string()
        }
        FtBQuestsFormat::Snbt => {
            // SNBT format is older
            if let Some(v) = ftb_version {
                if let Some(major) = v.split('.').next() {
                    if let Ok(major_num) = major.parse::<u32>() {
                        if major_num >= 20 {
                            return "1.20.x".to_string();
                        } else if major_num >= 18 {
                            return "1.19.x".to_string();
                        } else if major_num >= 16 {
                            return "1.18.x".to_string();
                        }
                    }
                }
            }
            "1.16.x-1.19.x".to_string()
        }
    }
}

// ─── Global Settings ───────────────────────────────────────────────────────

/// Parse global settings and return FTB Quests version if available
pub(super) fn parse_global_settings(quests_dir: &Path, format: FtBQuestsFormat, graph: &mut QuestGraph, result: &mut FtBQuestsImportResult) -> Result<Option<String>> {
    match format {
        FtBQuestsFormat::Snbt => {
            let data_file = quests_dir.join("data.snbt");
            if !data_file.exists() { return Ok(None); }
            let content = std::fs::read_to_string(&data_file)?;
            let snbt = parse_snbt(&content)?;
            if let Some(shape) = snbt.get_str("default_quest_shape") {
                graph.default_quest_shape = QuestShape::from_string(shape);
            }
            // Book icon: FTB stores it as an ItemStack compound `icon: { id: "..." }`
            // (QuestObjectBase.rawIcon). The editor keeps just the item id.
            if let Some(map) = snbt.get_compound("icon") {
                if let Some(id) = map.get_str("id") {
                    graph.book_icon = id.to_string();
                }
            }
            if let Some(mode) = snbt.get_str("progression_mode") {
                graph.book_progression_mode = QuestProgressionMode::from_string(mode);
            }
            if let Some(gs) = snbt.get_f64("grid_scale") {
                graph.grid_scale = gs;
            }
            if let Some(v) = snbt.get_bool("default_reward_team") {
                graph.default_reward_team = v;
            }
            if let Some(v) = snbt.get_bool("default_consume_items") {
                graph.default_consume_items = v;
            }
            if let Some(v) = snbt.get_str("default_autoclaim_rewards") {
                graph.default_autoclaim_rewards = v.to_string();
            }
            if let Some(v) = snbt.get_i64("detection_delay") {
                graph.detection_delay = v as i32;
            }
            if let Some(list) = snbt.get_list("emergency_items") {
                graph.emergency_items = list.iter().filter_map(|entry| {
                    let map = entry.as_compound()?;
                    Some(EmergencyItem {
                        id: map.get_str("id").unwrap_or("").to_string(),
                        count: map.get_i64("count").unwrap_or(1) as i32,
                    })
                }).collect();
            }
            if let Some(v) = snbt.get_i64("emergency_items_cooldown") {
                graph.emergency_items_cooldown = v as i32;
            }
            if let Some(v) = snbt.get_str("lock_message") {
                graph.lock_message = v.to_string();
            }
            if let Some(v) = snbt.get_bool("show_lock_icons") {
                graph.show_lock_icons = v;
            }
            if let Some(v) = snbt.get_str("fallback_locale") {
                graph.fallback_locale = v.to_string();
            }
            if let Some(v) = snbt.get_bool("disable_gui") {
                graph.disable_gui = v;
            }
            if let Some(v) = snbt.get_bool("pause_game") {
                graph.pause_game = v;
            }
            if let Some(v) = snbt.get_bool("drop_book_on_death") {
                graph.drop_book_on_death = v;
            }
            if let Some(v) = snbt.get_bool("drop_loot_crates") {
                graph.drop_loot_crates = v;
            }
            if let Some(v) = snbt.get_bool("hide_excluded_quests") {
                graph.hide_excluded_quests = v;
            }
            if let Some(v) = snbt.get_bool("verify_on_load") {
                graph.verify_on_load = v;
            }
            if let Some(v) = snbt.get_bool("default_quest_disable_jei") {
                graph.default_quest_disable_jei = v;
            }
            if let Some(map) = snbt.get_compound("loot_crate_no_drop") {
                graph.loot_crate_no_drop = LootCrateNoDrop {
                    boss: map.get_i64("boss").unwrap_or(0) as i32,
                    monster: map.get_i64("monster").unwrap_or(0) as i32,
                    passive: map.get_i64("passive").unwrap_or(0) as i32,
                };
            }
            // Try to get version
            let version = snbt.get_str("version")
                .or_else(|| snbt.get_str("Version"))
                .map(|s| s.to_string());
            result.stats.files_processed += 1;
            Ok(version)
        }
        FtBQuestsFormat::Json5 => {
            let data_file = if quests_dir.join("data.json5").exists() {
                quests_dir.join("data.json5")
            } else {
                quests_dir.join("data.json")
            };
            if !data_file.exists() { return Ok(None); }
            let content = std::fs::read_to_string(&data_file)?;
            let val: serde_json::Value = json5::from_str(&content)
                .or_else(|_| serde_json::from_str(&content))?;
            if let Some(shape) = val.get("default_quest_shape").and_then(|v| v.as_str()) {
                graph.default_quest_shape = QuestShape::from_string(shape);
            }
            if let Some(obj) = val.get("icon").and_then(|v| v.as_object()) {
                if let Some(id) = obj.get("id").and_then(|v| v.as_str()) {
                    graph.book_icon = id.to_string();
                }
            }
            if let Some(mode) = val.get("progression_mode").and_then(|v| v.as_str()) {
                graph.book_progression_mode = QuestProgressionMode::from_string(mode);
            }
            if let Some(v) = val.get("grid_scale").and_then(|v| v.as_f64()) {
                graph.grid_scale = v;
            }
            if let Some(v) = val.get("default_reward_team").and_then(|v| v.as_bool()) {
                graph.default_reward_team = v;
            }
            if let Some(v) = val.get("default_consume_items").and_then(|v| v.as_bool()) {
                graph.default_consume_items = v;
            }
            if let Some(v) = val.get("default_autoclaim_rewards").and_then(|v| v.as_str()) {
                graph.default_autoclaim_rewards = v.to_string();
            }
            if let Some(v) = val.get("detection_delay").and_then(|v| v.as_i64()) {
                graph.detection_delay = v as i32;
            }
            if let Some(list) = val.get("emergency_items").and_then(|v| v.as_array()) {
                graph.emergency_items = list.iter().filter_map(|entry| {
                    let obj = entry.as_object()?;
                    Some(EmergencyItem {
                        id: obj.get("id").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                        count: obj.get("count").and_then(|v| v.as_i64()).unwrap_or(1) as i32,
                    })
                }).collect();
            }
            if let Some(v) = val.get("emergency_items_cooldown").and_then(|v| v.as_i64()) {
                graph.emergency_items_cooldown = v as i32;
            }
            if let Some(v) = val.get("lock_message").and_then(|v| v.as_str()) {
                graph.lock_message = v.to_string();
            }
            if let Some(v) = val.get("show_lock_icons").and_then(|v| v.as_bool()) {
                graph.show_lock_icons = v;
            }
            if let Some(v) = val.get("fallback_locale").and_then(|v| v.as_str()) {
                graph.fallback_locale = v.to_string();
            }
            if let Some(v) = val.get("disable_gui").and_then(|v| v.as_bool()) {
                graph.disable_gui = v;
            }
            if let Some(v) = val.get("pause_game").and_then(|v| v.as_bool()) {
                graph.pause_game = v;
            }
            if let Some(v) = val.get("drop_book_on_death").and_then(|v| v.as_bool()) {
                graph.drop_book_on_death = v;
            }
            if let Some(v) = val.get("drop_loot_crates").and_then(|v| v.as_bool()) {
                graph.drop_loot_crates = v;
            }
            if let Some(v) = val.get("hide_excluded_quests").and_then(|v| v.as_bool()) {
                graph.hide_excluded_quests = v;
            }
            if let Some(v) = val.get("verify_on_load").and_then(|v| v.as_bool()) {
                graph.verify_on_load = v;
            }
            if let Some(v) = val.get("default_quest_disable_jei").and_then(|v| v.as_bool()) {
                graph.default_quest_disable_jei = v;
            }
            if let Some(map) = val.get("loot_crate_no_drop").and_then(|v| v.as_object()) {
                graph.loot_crate_no_drop = LootCrateNoDrop {
                    boss: map.get("boss").and_then(|v| v.as_i64()).unwrap_or(0) as i32,
                    monster: map.get("monster").and_then(|v| v.as_i64()).unwrap_or(0) as i32,
                    passive: map.get("passive").and_then(|v| v.as_i64()).unwrap_or(0) as i32,
                };
            }
            let version = val.get("version")
                .or_else(|| val.get("Version"))
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());
            result.stats.files_processed += 1;
            Ok(version)
        }
    }
}
