use super::helpers::{extract_smart_filter, parse_description, parse_item_task};
use crate::imports::snbt::SnbtValue;
use crate::quest::*;
use anyhow::Result;
use uuid::Uuid;

pub(super) fn parse_snbt_single_task(m: &SnbtValue) -> Result<QuestObjective> {
    let id = m.get_str("id")
        .map(|s| s.to_string())
        .unwrap_or_else(|| Uuid::new_v4().to_string());
    let title = m.get_str("title").unwrap_or("").to_string();
    let task_type = m.get_str("type").unwrap_or("item").to_string();
    let description = parse_description(m);

    let (objective_type, target, target_count) = match task_type.as_str() {
        // Item acquisition (detection/retrieval/crafting)
        "item" | "ftbquests:item" | "minecraft:item" | "detection" | "item_detection" => {
            let (item, count) = parse_item_task(m);
            (ObjectiveType::ItemAcquisition, item, count)
        }
        "item_retrieval" | "ftbquests:item_retrieval" | "retrieval" => {
            let (item, count) = parse_item_task(m);
            (ObjectiveType::ItemRetrieval, item, count)
        }
        "item_crafting" | "ftbquests:item_crafting" | "crafting" | "craft" => {
            let (item, count) = parse_item_task(m);
            (ObjectiveType::ItemCrafting, item, count)
        }
        // Block break/place
        "block_break" | "ftbquests:block_break" | "minecraft:block_break" | "break" => {
            let (item, count) = parse_item_task(m);
            (ObjectiveType::BlockBreak, item, count)
        }
        "block_place" | "ftbquests:block_place" | "minecraft:block_place" | "place" => {
            let (item, count) = parse_item_task(m);
            (ObjectiveType::BlockPlace, item, count)
        }
        // Entity kill
        "kill" | "ftbquests:kill" | "minecraft:kill" => {
            let entity = m.get_str("entity")
                .or_else(|| m.get_str("entity_type"))
                .or_else(|| m.get_str("mob"))
                .unwrap_or("").to_string();
            // FTB writes the kill count under `value`; accept `count` as a legacy fallback.
            let count = m.get_i64("value").or_else(|| m.get_i64("count")).unwrap_or(1) as i32;
            (ObjectiveType::EntityKill, entity, count)
        }
        // Location visit
        "location" | "ftbquests:location" | "minecraft:location" => {
            let dim = m.get_str("dimension").unwrap_or("").to_string();
            // FTB serializes the box as position:[I;x,y,z] + size:[I;w,h,d]; accept x/y/z/w/h/d as legacy.
            let pos = m.get_int_array("position").cloned()
                .or_else(|| m.get_list("position").and_then(|l| l.iter().map(|v| v.as_i64().map(|n| n as i32)).collect::<Option<Vec<_>>>()))
                .unwrap_or_default();
            let sz = m.get_int_array("size").cloned()
                .or_else(|| m.get_list("size").and_then(|l| l.iter().map(|v| v.as_i64().map(|n| n as i32)).collect::<Option<Vec<_>>>()))
                .unwrap_or_default();
            let (x, y, z) = if pos.len() >= 3 { (pos[0] as f64, pos[1] as f64, pos[2] as f64) } else { (0.0, 0.0, 0.0) };
            let (w, h, d) = if sz.len() >= 3 { (sz[0] as f64, sz[1] as f64, sz[2] as f64) } else { (1.0, 1.0, 1.0) };
            let radius = m.get_f64("radius").unwrap_or(0.0);
            let target = if !dim.is_empty() { dim } else { format!("{},{},{},{}", x, y, z, radius) };
            (ObjectiveType::LocationVisit, target, 1)
        }
        // Advancement
        "advancement" | "ftbquests:advancement" | "minecraft:advancement" => {
            let adv = m.get_str("advancement").unwrap_or("").to_string();
            (ObjectiveType::Advancement, adv, 1)
        }
        // Checkmark
        "checkmark" | "ftbquests:checkmark" | "minecraft:checkmark" => {
            (ObjectiveType::Checkmark, String::new(), 1)
        }
        // XP
        "xp" | "ftbquests:xp" | "minecraft:xp" => {
            let amount = m.get_i64("xp").unwrap_or(0) as i32;
            (ObjectiveType::Xp, String::new(), amount)
        }
        // Fluid
        "fluid" | "ftbquests:fluid" | "minecraft:fluid" => {
            let fluid = m.get_str("fluid").unwrap_or("").to_string();
            let amount = m.get_f64("amount").unwrap_or(0.0);
            (ObjectiveType::Fluid, fluid, amount as i32)
        }
        // Energy
        "energy" | "ftbquests:energy" | "minecraft:energy" => {
            let amount = m.get_f64("amount").unwrap_or(0.0);
            let unit = m.get_str("unit").unwrap_or("FE").to_string();
            (ObjectiveType::Energy, unit, amount as i32)
        }
        // Dimension
        "dimension" | "ftbquests:dimension" | "minecraft:dimension" => {
            let dim = m.get_str("dimension").unwrap_or("").to_string();
            (ObjectiveType::LocationVisit, dim, 1)
        }
        // Stat
        "stat" | "ftbquests:stat" | "minecraft:stat" => {
            let stat = m.get_str("stat").unwrap_or("").to_string();
            let count = m.get_i64("count").unwrap_or(1) as i32;
            (ObjectiveType::Stat, stat, count)
        }
        // Observation
        "observation" | "ftbquests:observation" | "minecraft:observation" => {
            (ObjectiveType::Observation, String::new(), 1)
        }
        // Biome
        "biome" | "ftbquests:biome" | "minecraft:biome" => {
            let biome = m.get_str("biome").unwrap_or("").to_string();
            (ObjectiveType::VisitBiome, biome, 1)
        }
        // Structure
        "structure" | "ftbquests:structure" | "minecraft:structure" => {
            let structure = m.get_str("structure").unwrap_or("").to_string();
            (ObjectiveType::FindStructure, structure, 1)
        }
        // Game Stage
        "stage" | "ftbquests:stage" | "minecraft:stage" | "gamestage" => {
            let stage = m.get_str("stage").unwrap_or("").to_string();
            (ObjectiveType::GameStage, stage, 1)
        }
        // Custom
        "custom" | "ftbquests:custom" | "minecraft:custom" => {
            (ObjectiveType::Custom, String::new(), m.get_i64("max_progress").unwrap_or(1) as i32)
        }
        _ => {
            (ObjectiveType::Custom, task_type, 1)
        }
    };

    let mut obj = QuestObjective {
        id,
        label: if title.is_empty() { objective_type.display_name().to_string() } else { title },
        objective_type,
        target,
        target_count,
        required: !m.get_bool("optional_task").or_else(|| m.get_bool("optional")).unwrap_or(false),
        description,
        ..Default::default()
    };

    // Extract task-type-specific fields
    if let Some(nbt) = m.get_str("nbt") {
        obj.nbt_data = nbt.to_string();
    }
    // 1.20.5+ Data Components support
    if let Some(components) = m.get("components") {
        if let Some(comp_m) = components.as_compound() {
            // Serialize components back to string for storage
            obj.nbt_data = crate::imports::snbt::compound_to_snbt(&comp_m);
        }
    }
    // FTB Filter System smart filter DSL (nested item components)
    obj.smart_filter = extract_smart_filter(m);
    if let Some(tag) = m.get_str("tag") {
        obj.item_tag = tag.to_string();
    }
    obj.consume_items = m.get_bool("consume_items").unwrap_or(false);
    obj.match_nbt = m.get_bool("match_nbt").unwrap_or(false);
    obj.ignore_nbt = m.get_bool("ignore_nbt").unwrap_or(false);
    obj.task_screen_only = m.get_bool("task_screen_only").unwrap_or(false);
    obj.only_from_crafting = m.get_bool("only_from_crafting").unwrap_or(false);
    obj.match_components = m.get_bool("match_components").unwrap_or(false);
    
    // Location/box for location tasks
    if matches!(obj.objective_type, ObjectiveType::LocationVisit) {
        obj.x = m.get_f64("x").unwrap_or(0.0);
        obj.y = m.get_f64("y").unwrap_or(0.0);
        obj.z = m.get_f64("z").unwrap_or(0.0);
        let pos_vals: Vec<i32> = match m.get("position") {
            Some(v) => match v {
                SnbtValue::IntArray(arr) => arr.clone(),
                SnbtValue::List(list) => list.iter().filter_map(|i| i.as_i64().map(|n| n as i32)).collect(),
                _ => Vec::new(),
            },
            None => Vec::new(),
        };
        if pos_vals.len() >= 3 {
            obj.x = pos_vals[0] as f64;
            obj.y = pos_vals[1] as f64;
            obj.z = pos_vals[2] as f64;
        }
        let size_vals: Vec<i32> = match m.get("size") {
            Some(v) => match v {
                SnbtValue::IntArray(arr) => arr.clone(),
                SnbtValue::List(list) => list.iter().filter_map(|i| i.as_i64().map(|n| n as i32)).collect(),
                _ => Vec::new(),
            },
            None => Vec::new(),
        };
        if size_vals.len() >= 3 {
            obj.box_w = size_vals[0] as f64;
            obj.box_h = size_vals[1] as f64;
            obj.box_d = size_vals[2] as f64;
        } else {
            obj.box_w = m.get_f64("w").unwrap_or(0.0);
            obj.box_h = m.get_f64("h").unwrap_or(0.0);
            obj.box_d = m.get_f64("d").unwrap_or(0.0);
        }
        obj.radius = m.get_f64("radius").unwrap_or(0.0);
        obj.ignore_dim = m.get_bool("ignore_dimension").or_else(|| m.get_bool("ignore_dim")).unwrap_or(false);
        obj.dimension = m.get_str("dimension").unwrap_or("").to_string();
    }
    
    // Entity for kill tasks
    if matches!(obj.objective_type, ObjectiveType::EntityKill) {
        obj.entity_id = m.get_str("entity")
            .or_else(|| m.get_str("entity_type"))
            .or_else(|| m.get_str("mob"))
            .unwrap_or("").to_string();
        obj.custom_name = m.get_str("custom_name").unwrap_or("").to_string();
        // FTB-canonical key is `entityTypeTag`; `tag` is accepted as a legacy fallback.
        obj.entity_type_tag = m.get_str("entityTypeTag").or_else(|| m.get_str("tag")).unwrap_or("").to_string();
        obj.nbt_filter = m.get_str("nbt_filter").unwrap_or("").to_string();
    }
    
    // Advancement ID + criterion
    if matches!(obj.objective_type, ObjectiveType::Advancement) {
        obj.advancement_id = m.get_str("advancement").unwrap_or("").to_string();
        obj.criterion = m.get_str("criterion").unwrap_or("").to_string();
    }
    
    // Custom JSON for custom tasks
    if matches!(obj.objective_type, ObjectiveType::Custom) {
        if let Some(custom) = m.get("custom") {
            obj.custom_json = custom.to_snbt_string();
        }
    }
    
    // Stat name/value
    if matches!(obj.objective_type, ObjectiveType::Stat) {
        obj.stat_name = m.get_str("stat").unwrap_or("").to_string();
        obj.stat_value = m.get_i64("count").unwrap_or(1) as i32;
    }
    
    // Biome ID
    if matches!(obj.objective_type, ObjectiveType::VisitBiome) {
        obj.biome_id = m.get_str("biome").unwrap_or("").to_string();
    }
    
    // Structure ID
    if matches!(obj.objective_type, ObjectiveType::FindStructure) {
        obj.structure_id = m.get_str("structure").unwrap_or("").to_string();
    }
    
    // Observation range
    if matches!(obj.objective_type, ObjectiveType::Observation) {
        obj.observation_range = m.get_f64("range").unwrap_or(4.0);
    }
    
    // Fluid amount
    if matches!(obj.objective_type, ObjectiveType::Fluid) {
        obj.fluid_id = m.get_str("fluid").unwrap_or("").to_string();
        obj.fluid_amount = m.get_f64("amount").unwrap_or(0.0);
    }
    
    // Energy amount/unit
    if matches!(obj.objective_type, ObjectiveType::Energy) {
        obj.energy_amount = m.get_f64("amount").unwrap_or(0.0);
        obj.energy_unit = m.get_str("unit").unwrap_or("FE").to_string();
    }
    
    // XP levels/points
    if matches!(obj.objective_type, ObjectiveType::Xp) {
        obj.xp_levels = m.get_i64("levels").unwrap_or(0) as i32;
        obj.xp_points = m.get_i64("xp").unwrap_or(0) as i32;
    }
    
    // Command
    if matches!(obj.objective_type, ObjectiveType::Command) {
        obj.command = m.get_str("command").unwrap_or("").to_string();
    }
    
    // Game Stage
    if matches!(obj.objective_type, ObjectiveType::GameStage) {
        obj.advancement_id = m.get_str("stage").unwrap_or("").to_string(); // reuse field
        obj.team_stage = m.get_bool("team_stage").unwrap_or(false);
    }

    Ok(obj)
}
