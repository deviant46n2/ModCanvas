use crate::imports::snbt::{SnbtValue, CommentedSnbt};
use crate::quest::*;
use anyhow::Result;
use std::collections::HashMap;

use super::helpers::{ce, item_value};

/// Convert a QuestObjective to an SNBT task compound
pub(super) fn objective_to_snbt_task(obj: &QuestObjective, flat_chapters: bool) -> Result<SnbtValue> {
    let mut m: HashMap<String, CommentedSnbt> = HashMap::new();

    m.insert("id".to_string(), ce(SnbtValue::String(obj.id.clone())));
    if !obj.label.is_empty() {
        m.insert("title".to_string(), ce(SnbtValue::String(obj.label.clone())));
    }

    let (ftb_type, extra_fields) = match &obj.objective_type {
        ObjectiveType::ItemAcquisition => ("item", vec![
            ("item".to_string(), ce(item_value(&obj.target, obj.target_count, &obj.smart_filter, flat_chapters))),
        ]),
        ObjectiveType::ItemRetrieval => ("item", vec![
            ("item".to_string(), ce(item_value(&obj.target, obj.target_count, &obj.smart_filter, flat_chapters))),
        ]),
        ObjectiveType::ItemCrafting => ("item", vec![
            ("item".to_string(), ce(item_value(&obj.target, obj.target_count, &obj.smart_filter, flat_chapters))),
        ]),
        ObjectiveType::EntityKill => {
            let mut fields = vec![
                ("entity".to_string(), ce(SnbtValue::String(obj.target.clone()))),
            ];
            if !obj.entity_type_tag.is_empty() {
                fields.push(("entityTypeTag".to_string(), ce(SnbtValue::String(obj.entity_type_tag.clone()))));
            }
            if obj.target_count > 1 {
                fields.push(("value".to_string(), ce(SnbtValue::Long(obj.target_count as i64))));
            }
            if !obj.custom_name.is_empty() {
                fields.push(("custom_name".to_string(), ce(SnbtValue::String(obj.custom_name.clone()))));
            }
            if !obj.nbt_filter.is_empty() {
                fields.push(("nbt_filter".to_string(), ce(SnbtValue::String(obj.nbt_filter.clone()))));
            }
            ("kill", fields)
        }
        ObjectiveType::LocationVisit => {
            let (w, h, d) = if obj.box_w > 0.0 || obj.box_h > 0.0 || obj.box_d > 0.0 {
                (obj.box_w.max(1.0), obj.box_h.max(1.0), obj.box_d.max(1.0))
            } else {
                (1.0, 1.0, 1.0)
            };
            let is_dimension_only = obj.x == 0.0 && obj.y == 0.0 && obj.z == 0.0 && w == 1.0 && h == 1.0 && d == 1.0;
            if flat_chapters && is_dimension_only && !obj.dimension.is_empty() {
                // FlatChapters uses the 'dimension' type for dimension-only checks
                ("dimension", vec![
                    ("dimension".to_string(), ce(SnbtValue::String(obj.dimension.clone()))),
                ])
            } else {
                ("location", vec![
                    ("dimension".to_string(), ce(SnbtValue::String(obj.dimension.clone()))),
                    ("ignore_dimension".to_string(), ce(SnbtValue::Byte(obj.ignore_dim as i8))),
                    ("position".to_string(), ce(SnbtValue::IntArray(vec![obj.x as i32, obj.y as i32, obj.z as i32]))),
                    ("size".to_string(), ce(SnbtValue::IntArray(vec![w as i32, h as i32, d as i32]))),
                ])
            }
        }
        ObjectiveType::Advancement => {
            let mut fields = vec![
                ("advancement".to_string(), ce(SnbtValue::String(obj.advancement_id.clone()))),
            ];
            if !obj.criterion.is_empty() {
                fields.push(("criterion".to_string(), ce(SnbtValue::String(obj.criterion.clone()))));
            }
            ("advancement", fields)
        }
        ObjectiveType::Checkmark => ("checkmark", vec![]),
        ObjectiveType::Xp => ("xp", vec![
            ("xp".to_string(), ce(SnbtValue::Int(obj.xp_points))),
            ("levels".to_string(), ce(SnbtValue::Int(obj.xp_levels))),
        ]),
        ObjectiveType::Fluid => ("fluid", vec![
            ("fluid".to_string(), ce(SnbtValue::String(obj.fluid_id.clone()))),
            ("amount".to_string(), ce(SnbtValue::Double(obj.fluid_amount))),
        ]),
        ObjectiveType::Energy => ("energy", vec![
            ("amount".to_string(), ce(SnbtValue::Double(obj.energy_amount))),
            ("unit".to_string(), ce(SnbtValue::String(obj.energy_unit.clone()))),
        ]),
        ObjectiveType::Stat => ("stat", vec![
            ("stat".to_string(), ce(SnbtValue::String(obj.stat_name.clone()))),
            ("count".to_string(), ce(SnbtValue::Int(obj.stat_value))),
        ]),
        ObjectiveType::Observation => ("observation", vec![
            ("range".to_string(), ce(SnbtValue::Double(obj.observation_range))),
        ]),
        ObjectiveType::VisitBiome => ("biome", vec![
            ("biome".to_string(), ce(SnbtValue::String(obj.biome_id.clone()))),
        ]),
        ObjectiveType::FindStructure => ("structure", vec![
            ("structure".to_string(), ce(SnbtValue::String(obj.structure_id.clone()))),
        ]),
        ObjectiveType::GameStage => {
            let mut fields = vec![
                ("stage".to_string(), ce(SnbtValue::String(obj.advancement_id.clone()))),
            ];
            if obj.team_stage {
                fields.push(("team_stage".to_string(), ce(SnbtValue::Byte(1))));
            }
            ("stage", fields)
        }
        ObjectiveType::BlockBreak => ("block_break", vec![
            ("item".to_string(), ce(item_value(&obj.target, 1, &obj.smart_filter, flat_chapters))),
        ]),
        ObjectiveType::BlockPlace => ("block_place", vec![
            ("item".to_string(), ce(item_value(&obj.target, 1, &obj.smart_filter, flat_chapters))),
        ]),
        ObjectiveType::Command => ("custom", vec![
            ("command".to_string(), ce(SnbtValue::String(obj.command.clone()))),
        ]),
        ObjectiveType::Image => ("custom", vec![]),
        ObjectiveType::Custom => ("custom", vec![
            ("custom".to_string(), ce(SnbtValue::String(obj.custom_json.clone()))),
            ("max_progress".to_string(), ce(SnbtValue::Int(obj.target_count))),
        ]),
    };

    m.insert("type".to_string(), ce(SnbtValue::String(ftb_type.to_string())));

    if obj.target_count > 1 && !matches!(obj.objective_type, ObjectiveType::Xp | ObjectiveType::Fluid | ObjectiveType::Energy | ObjectiveType::Stat | ObjectiveType::Observation | ObjectiveType::EntityKill) {
        m.insert("count".to_string(), ce(SnbtValue::Long(obj.target_count as i64)));
    }

    for (key, val) in extra_fields {
        m.insert(key, val);
    }

    if !obj.required {
        // FTB tasks serialize the optional flag under `optional_task` (quests use `optional`).
        m.insert("optional_task".to_string(), ce(SnbtValue::Byte(1)));
    }

    if !obj.nbt_data.is_empty() {
        if let Ok(comp) = crate::imports::snbt::parse_snbt(&obj.nbt_data) {
            if let Some(cm) = comp.as_compound() {
                m.insert("components".to_string(), ce(SnbtValue::Compound(cm.clone())));
            } else {
                m.insert("nbt".to_string(), ce(SnbtValue::String(obj.nbt_data.clone())));
            }
        } else {
            m.insert("nbt".to_string(), ce(SnbtValue::String(obj.nbt_data.clone())));
        }
    }

    if !obj.item_tag.is_empty() {
        m.insert("tag".to_string(), ce(SnbtValue::String(obj.item_tag.clone())));
    }

    if obj.consume_items {
        m.insert("consume_items".to_string(), ce(SnbtValue::Byte(1)));
    }

    if obj.match_nbt {
        m.insert("match_nbt".to_string(), ce(SnbtValue::Byte(1)));
    }

    if obj.ignore_nbt {
        m.insert("ignore_nbt".to_string(), ce(SnbtValue::Byte(1)));
    }

    if obj.task_screen_only {
        m.insert("task_screen_only".to_string(), ce(SnbtValue::Byte(1)));
    }

    if obj.only_from_crafting {
        m.insert("only_from_crafting".to_string(), ce(SnbtValue::Byte(1)));
    }

    if obj.match_components {
        m.insert("match_components".to_string(), ce(SnbtValue::Byte(1)));
    }

    Ok(SnbtValue::Compound(m))
}
