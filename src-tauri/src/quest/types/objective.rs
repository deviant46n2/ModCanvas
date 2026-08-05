use serde::{Deserialize, Serialize};
use uuid::Uuid;
/// An objective within a quest node
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QuestObjective {
    pub id: String,
    pub label: String,
    pub objective_type: ObjectiveType,
    #[serde(default)]
    pub target: String,
    #[serde(default)]
    pub target_count: i32,
    #[serde(default)]
    pub required: bool,

    #[serde(default)]
    pub item_tag: String,
    #[serde(default)]
    pub nbt_data: String,
    #[serde(default)]
    pub smart_filter: String,
    #[serde(default)]
    pub consume_items: bool,
    #[serde(default)]
    pub match_nbt: bool,
    #[serde(default)]
    pub ignore_nbt: bool,
    #[serde(default)]
    pub exact_match: bool,
    #[serde(default)]
    pub task_screen_only: bool,
    #[serde(default)]
    pub only_from_crafting: bool,
    #[serde(default)]
    pub match_components: bool,
    #[serde(default)]
    pub fluid_id: String,
    #[serde(default)]
    pub fluid_amount: f64,
    #[serde(default)]
    pub energy_amount: f64,
    #[serde(default)]
    pub energy_unit: String,
    #[serde(default)]
    pub xp_levels: i32,
    #[serde(default)]
    pub xp_points: i32,
    #[serde(default)]
    pub command: String,
    #[serde(default)]
    pub dimension: String,
    #[serde(default)]
    pub x: f64,
    #[serde(default)]
    pub y: f64,
    #[serde(default)]
    pub z: f64,
    #[serde(default)]
    pub radius: f64,
    #[serde(default)]
    pub box_w: f64,
    #[serde(default)]
    pub box_h: f64,
    #[serde(default)]
    pub box_d: f64,
    #[serde(default)]
    pub ignore_dim: bool,
    #[serde(default)]
    pub entity_id: String,
    #[serde(default)]
    pub advancement_id: String,
    #[serde(default)]
    pub custom_json: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub stat_name: String,
    #[serde(default)]
    pub stat_value: i32,
    #[serde(default)]
    pub biome_id: String,
    #[serde(default)]
    pub structure_id: String,
    #[serde(default)]
    pub observation_range: f64,
    #[serde(default)]
    pub custom_name: String,
    #[serde(default)]
    pub entity_type_tag: String,
    #[serde(default)]
    pub nbt_filter: String,
    #[serde(default)]
    pub team_stage: bool,
    #[serde(default)]
    pub criterion: String,
}

impl Default for QuestObjective {
    fn default() -> Self {
        Self {
            id: Uuid::new_v4().to_string(),
            label: String::new(),
            objective_type: ObjectiveType::ItemAcquisition,
            target: String::new(),
            target_count: 1,
            required: true,
            item_tag: String::new(),
            nbt_data: String::new(),
            smart_filter: String::new(),
            consume_items: false,
            match_nbt: false,
            ignore_nbt: false,
            exact_match: false,
            task_screen_only: false,
            only_from_crafting: false,
            match_components: false,
            fluid_id: String::new(),
            fluid_amount: 0.0,
            energy_amount: 0.0,
            energy_unit: "FE".to_string(),
            xp_levels: 0,
            xp_points: 0,
            command: String::new(),
            dimension: String::new(),
            x: 0.0,
            y: 0.0,
            z: 0.0,
            radius: 0.0,
            box_w: 0.0,
            box_h: 0.0,
            box_d: 0.0,
            ignore_dim: false,
            entity_id: String::new(),
            advancement_id: String::new(),
            custom_json: String::new(),
            description: String::new(),
            stat_name: String::new(),
            stat_value: 0,
            biome_id: String::new(),
            structure_id: String::new(),
            observation_range: 4.0,
            custom_name: String::new(),
            entity_type_tag: String::new(),
            nbt_filter: String::new(),
            team_stage: false,
            criterion: String::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ObjectiveType {
    ItemAcquisition,
    ItemRetrieval,
    ItemCrafting,
    BlockBreak,
    BlockPlace,
    EntityKill,
    LocationVisit,
    Advancement,
    Fluid,
    Energy,
    Xp,
    Command,
    GameStage,
    Stat,
    Observation,
    VisitBiome,
    FindStructure,
    Checkmark,
    Image,
    Custom,
}

impl ObjectiveType {
    pub fn to_string(&self) -> String {
        match self {
            ObjectiveType::ItemAcquisition => "item_acquisition".to_string(),
            ObjectiveType::ItemRetrieval => "item_retrieval".to_string(),
            ObjectiveType::ItemCrafting => "item_crafting".to_string(),
            ObjectiveType::BlockBreak => "block_break".to_string(),
            ObjectiveType::BlockPlace => "block_place".to_string(),
            ObjectiveType::EntityKill => "entity_kill".to_string(),
            ObjectiveType::LocationVisit => "location_visit".to_string(),
            ObjectiveType::Advancement => "advancement".to_string(),
            ObjectiveType::Fluid => "fluid".to_string(),
            ObjectiveType::Energy => "energy".to_string(),
            ObjectiveType::Xp => "xp".to_string(),
            ObjectiveType::Command => "command".to_string(),
            ObjectiveType::GameStage => "game_stage".to_string(),
            ObjectiveType::Stat => "stat".to_string(),
            ObjectiveType::Observation => "observation".to_string(),
            ObjectiveType::VisitBiome => "visit_biome".to_string(),
            ObjectiveType::FindStructure => "find_structure".to_string(),
            ObjectiveType::Checkmark => "checkmark".to_string(),
            ObjectiveType::Image => "image".to_string(),
            ObjectiveType::Custom => "custom".to_string(),
        }
    }

    pub fn from_string(s: &str) -> Self {
        match s.to_lowercase().as_str() {
            "item_acquisition" | "item" | "detection" | "item_detection" => ObjectiveType::ItemAcquisition,
            "item_retrieval" | "retrieval" => ObjectiveType::ItemRetrieval,
            "item_crafting" | "crafting" | "craft" => ObjectiveType::ItemCrafting,
            "block_break" | "break" => ObjectiveType::BlockBreak,
            "block_place" | "place" => ObjectiveType::BlockPlace,
            "entity_kill" | "kill" | "mob_kill" => ObjectiveType::EntityKill,
            "location_visit" | "visit" | "location" => ObjectiveType::LocationVisit,
            "advancement" | "adv" => ObjectiveType::Advancement,
            "fluid" | "fluid_detection" => ObjectiveType::Fluid,
            "energy" | "energy_detection" | "fe" | "rf" => ObjectiveType::Energy,
            "xp" | "experience" => ObjectiveType::Xp,
            "command" | "cmd" => ObjectiveType::Command,
            "game_stage" | "stage" | "gamestage" => ObjectiveType::GameStage,
            "stat" | "statistics" => ObjectiveType::Stat,
            "observation" | "observe" => ObjectiveType::Observation,
            "visit_biome" | "biome" => ObjectiveType::VisitBiome,
            "find_structure" | "structure" => ObjectiveType::FindStructure,
            "checkmark" | "check" => ObjectiveType::Checkmark,
            "image" | "img" => ObjectiveType::Image,
            _ => ObjectiveType::Custom,
        }
    }

    pub fn display_name(&self) -> &str {
        match self {
            ObjectiveType::ItemAcquisition => "Item Detection",
            ObjectiveType::ItemRetrieval => "Item Retrieval",
            ObjectiveType::ItemCrafting => "Item Crafting",
            ObjectiveType::BlockBreak => "Block Breaking",
            ObjectiveType::BlockPlace => "Block Placing",
            ObjectiveType::EntityKill => "Entity Kill",
            ObjectiveType::LocationVisit => "Location Visit",
            ObjectiveType::Advancement => "Advancement",
            ObjectiveType::Fluid => "Fluid Detection",
            ObjectiveType::Energy => "Energy Detection",
            ObjectiveType::Xp => "Experience",
            ObjectiveType::Command => "Command",
            ObjectiveType::GameStage => "Game Stage",
            ObjectiveType::Stat => "Statistics",
            ObjectiveType::Observation => "Observation",
            ObjectiveType::VisitBiome => "Visit Biome",
            ObjectiveType::FindStructure => "Find Structure",
            ObjectiveType::Checkmark => "Checkmark",
            ObjectiveType::Image => "Image",
            ObjectiveType::Custom => "Custom",
        }
    }
}
