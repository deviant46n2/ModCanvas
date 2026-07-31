use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use uuid::Uuid;

pub use crate::shared::{EdgeType, Position};

/// A chapter/tab that groups quests
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QuestChapter {
    pub id: String,
    pub title: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub icon: String,
    #[serde(default)]
    pub background_image: String,
    #[serde(default)]
    pub order_index: i32,
    #[serde(default)]
    pub hide_until_first_quest_complete: bool,
    #[serde(default)]
    pub default_quest_size: QuestSize,
    #[serde(default)]
    pub quest_color: String,
    #[serde(default)]
    pub group_id: Option<String>,
    #[serde(default)]
    pub default_quest_shape: QuestShape,
    #[serde(default = "default_true")]
    pub default_enabled: bool,
    #[serde(default)]
    pub progression_mode: QuestProgressionMode,
    #[serde(default)]
    pub images: Vec<ChapterImage>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ChapterImage {
    #[serde(default)]
    pub x: f64,
    #[serde(default)]
    pub y: f64,
    #[serde(default)]
    pub width: f64,
    #[serde(default)]
    pub height: f64,
    #[serde(default)]
    pub rotation: f64,
    #[serde(default)]
    pub image: String,
    #[serde(default)]
    pub scale: f64,
    #[serde(default)]
    pub order: i32,
    #[serde(default)]
    pub alpha: u8,
    #[serde(default)]
    pub color: i32,
    #[serde(default)]
    pub click: String,
    #[serde(default)]
    pub hover: Vec<String>,
}

fn default_true() -> bool { true }

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum QuestShape {
    #[default]
    Default,
    Circle,
    Square,
    RoundedSquare,
    Diamond,
    Pentagon,
    Hexagon,
    Octagon,
    Heart,
    Gear,
}

impl QuestShape {
    pub fn to_string(&self) -> String {
        match self {
            QuestShape::Default => "default".to_string(),
            QuestShape::Circle => "circle".to_string(),
            QuestShape::Square => "square".to_string(),
            QuestShape::RoundedSquare => "rounded_square".to_string(),
            QuestShape::Diamond => "diamond".to_string(),
            QuestShape::Pentagon => "pentagon".to_string(),
            QuestShape::Hexagon => "hexagon".to_string(),
            QuestShape::Octagon => "octagon".to_string(),
            QuestShape::Heart => "heart".to_string(),
            QuestShape::Gear => "gear".to_string(),
        }
    }

    pub fn from_string(s: &str) -> Self {
        match s.to_lowercase().as_str() {
            "circle" => QuestShape::Circle,
            "square" => QuestShape::Square,
            "rounded_square" | "rounded" | "rsquare" | "roundedsquare" => QuestShape::RoundedSquare,
            "diamond" => QuestShape::Diamond,
            "pentagon" => QuestShape::Pentagon,
            "hexagon" => QuestShape::Hexagon,
            "octagon" => QuestShape::Octagon,
            "heart" => QuestShape::Heart,
            "gear" => QuestShape::Gear,
            _ => QuestShape::Default,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum QuestProgressionMode {
    #[default]
    Default,
    Linear,
    Flexible,
}

impl QuestProgressionMode {
    pub fn to_string(&self) -> String {
        match self {
            QuestProgressionMode::Default => "default".to_string(),
            QuestProgressionMode::Linear => "linear".to_string(),
            QuestProgressionMode::Flexible => "flexible".to_string(),
        }
    }

    pub fn from_string(s: &str) -> Self {
        match s.to_lowercase().as_str() {
            "linear" => QuestProgressionMode::Linear,
            "flexible" => QuestProgressionMode::Flexible,
            _ => QuestProgressionMode::Default,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum DependencyRequirement {
    #[default]
    AllCompleted,
    OneCompleted,
    AllStarted,
    OneStarted,
}

impl DependencyRequirement {
    pub fn to_string(&self) -> String {
        match self {
            DependencyRequirement::AllCompleted => "all_completed".to_string(),
            DependencyRequirement::OneCompleted => "one_completed".to_string(),
            DependencyRequirement::AllStarted => "all_started".to_string(),
            DependencyRequirement::OneStarted => "one_started".to_string(),
        }
    }

    pub fn from_string(s: &str) -> Self {
        match s.to_lowercase().as_str() {
            "one_completed" | "one" => DependencyRequirement::OneCompleted,
            "all_started" | "started" => DependencyRequirement::AllStarted,
            "one_started" => DependencyRequirement::OneStarted,
            _ => DependencyRequirement::AllCompleted,
        }
    }
}

/// A chapter group that organizes chapters
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QuestChapterGroup {
    pub id: String,
    pub title: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub icon: String,
    #[serde(default)]
    pub order_index: i32,
}

impl Default for QuestChapterGroup {
    fn default() -> Self {
        Self {
            id: Uuid::new_v4().to_string(),
            title: String::new(),
            description: String::new(),
            icon: String::new(),
            order_index: 0,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QuestSize {
    pub width: f64,
    pub height: f64,
}

impl Default for QuestSize {
    fn default() -> Self {
        QuestSize { width: 24.0, height: 24.0 }
    }
}

/// A node in the quest graph
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QuestNode {
    pub id: String,
    pub node_type: QuestNodeType,
    pub label: String,
    pub description: String,
    pub position: Position,
    #[serde(default)]
    pub data: HashMap<String, String>,
    #[serde(default)]
    pub objectives: Vec<QuestObjective>,
    #[serde(default)]
    pub rewards: Vec<QuestReward>,
    #[serde(default)]
    pub required_items: Vec<String>,
    #[serde(default)]
    pub chapter_id: Option<String>,

    #[serde(default)]
    pub icon: String,
    #[serde(default)]
    pub size: QuestSize,
    #[serde(default)]
    pub color: String,
    #[serde(default)]
    pub visibility: QuestVisibility,
    #[serde(default)]
    pub optional: bool,
    #[serde(default)]
    pub silently_complete: bool,
    #[serde(default)]
    pub can_be_repeatable: bool,
    #[serde(default)]
    pub repeat_min_delay: i64,
    #[serde(default)]
    pub repeat_max_delay: i64,
    #[serde(default)]
    pub repeat_time: i64,
    #[serde(default)]
    pub hide_quest_until_deps_complete: bool,
    #[serde(default)]
    pub hide_quest_until_quest_complete: bool,
    #[serde(default)]
    pub hide_quest_until_all_complete: bool,
    #[serde(default)]
    pub disable_reward: bool,
    #[serde(default)]
    pub pause_reward: bool,
    #[serde(default)]
    pub lock_icon: String,
    #[serde(default)]
    pub subtitle: String,
    #[serde(default)]
    pub quest_background: String,
    #[serde(default)]
    pub shape: QuestShape,
    #[serde(default)]
    pub icon_scaling: f64,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub progression_mode: QuestProgressionMode,
    #[serde(default)]
    pub sequential_tasks: bool,
    #[serde(default)]
    pub disable_completion_toast: bool,
    #[serde(default)]
    pub ignore_reward_blocking: bool,
    #[serde(default)]
    pub disable_jei_recipe: bool,
    #[serde(default)]
    pub min_window_width: i32,
    #[serde(default)]
    pub hide_details_until_startable: bool,
    #[serde(default)]
    pub hide_text_until_completed: bool,
    #[serde(default)]
    pub invisible_until_completed: bool,
    #[serde(default)]
    pub invisible_until_x_tasks: i32,
    #[serde(default)]
    pub hide_dependency_lines: bool,
    #[serde(default)]
    pub hide_dependent_lines: bool,
    #[serde(default)]
    pub min_required_dependencies: i32,
    #[serde(default)]
    pub dependency_requirement: DependencyRequirement,
}

impl Default for QuestNode {
    fn default() -> Self {
        Self {
            id: String::new(),
            node_type: QuestNodeType::Quest,
            label: String::new(),
            description: String::new(),
            position: Position { x: 0.0, y: 0.0 },
            data: HashMap::new(),
            objectives: Vec::new(),
            rewards: Vec::new(),
            required_items: Vec::new(),
            chapter_id: None,
            icon: String::new(),
            size: QuestSize::default(),
            color: String::new(),
            visibility: QuestVisibility::default(),
            optional: false,
            silently_complete: false,
            can_be_repeatable: false,
            repeat_min_delay: 0,
            repeat_max_delay: 0,
            repeat_time: 0,
            hide_quest_until_deps_complete: false,
            hide_quest_until_quest_complete: false,
            hide_quest_until_all_complete: false,
            disable_reward: false,
            pause_reward: false,
            lock_icon: String::new(),
            subtitle: String::new(),
            quest_background: String::new(),
            shape: QuestShape::Default,
            icon_scaling: 1.0,
            tags: Vec::new(),
            progression_mode: QuestProgressionMode::Default,
            sequential_tasks: false,
            disable_completion_toast: false,
            ignore_reward_blocking: false,
            disable_jei_recipe: false,
            min_window_width: 0,
            hide_details_until_startable: false,
            hide_text_until_completed: false,
            invisible_until_completed: false,
            invisible_until_x_tasks: 0,
            hide_dependency_lines: false,
            hide_dependent_lines: false,
            min_required_dependencies: 0,
            dependency_requirement: DependencyRequirement::AllCompleted,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum QuestVisibility {
    #[default]
    Normal,
    AlwaysVisible,
    NeverVisible,
    WhenDependenciesComplete,
    WhenQuestComplete,
    WhenAllComplete,
}

impl QuestVisibility {
    pub fn to_string(&self) -> String {
        match self {
            QuestVisibility::Normal => "normal".to_string(),
            QuestVisibility::AlwaysVisible => "always".to_string(),
            QuestVisibility::NeverVisible => "never".to_string(),
            QuestVisibility::WhenDependenciesComplete => "when_dependencies_complete".to_string(),
            QuestVisibility::WhenQuestComplete => "when_quest_complete".to_string(),
            QuestVisibility::WhenAllComplete => "when_all_complete".to_string(),
        }
    }

    pub fn from_string(s: &str) -> Self {
        match s.to_lowercase().as_str() {
            "always" | "always_visible" => QuestVisibility::AlwaysVisible,
            "never" | "never_visible" => QuestVisibility::NeverVisible,
            "when_dependencies_complete" | "deps_complete" => QuestVisibility::WhenDependenciesComplete,
            "when_quest_complete" | "quest_complete" => QuestVisibility::WhenQuestComplete,
            "when_all_complete" | "all_complete" => QuestVisibility::WhenAllComplete,
            _ => QuestVisibility::Normal,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum QuestNodeType {
    /// A chapter/group header
    Chapter,
    /// A quest with objectives
    Quest,
    /// A reward node
    Reward,
    /// A gating requirement
    Gate,
    /// An optional side quest
    SideQuest,
}

impl QuestNodeType {
    pub fn to_string(&self) -> String {
        match self {
            QuestNodeType::Chapter => "chapter".to_string(),
            QuestNodeType::Quest => "quest".to_string(),
            QuestNodeType::Reward => "reward".to_string(),
            QuestNodeType::Gate => "gate".to_string(),
            QuestNodeType::SideQuest => "side_quest".to_string(),
        }
    }

    pub fn from_string(s: &str) -> Self {
        match s.to_lowercase().as_str() {
            "chapter" => QuestNodeType::Chapter,
            "quest" => QuestNodeType::Quest,
            "reward" => QuestNodeType::Reward,
            "gate" => QuestNodeType::Gate,
            "side_quest" | "side" => QuestNodeType::SideQuest,
            _ => QuestNodeType::Quest,
        }
    }
}

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
    pub consume_items: bool,
    #[serde(default)]
    pub match_nbt: bool,
    #[serde(default)]
    pub ignore_nbt: bool,
    #[serde(default)]
    pub exact_match: bool,
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
            consume_items: false,
            match_nbt: false,
            ignore_nbt: false,
            exact_match: false,
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
            entity_id: String::new(),
            advancement_id: String::new(),
            custom_json: String::new(),
            description: String::new(),
            stat_name: String::new(),
            stat_value: 0,
            biome_id: String::new(),
            structure_id: String::new(),
            observation_range: 4.0,
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

/// A reward from completing a quest
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QuestReward {
    pub id: String,
    pub label: String,
    pub reward_type: RewardType,
    #[serde(default)]
    pub items: Vec<String>,
    #[serde(default)]
    pub description: String,

    #[serde(default)]
    pub item_id: String,
    #[serde(default)]
    pub item_tag: String,
    #[serde(default)]
    pub item_count: i32,
    #[serde(default)]
    pub nbt_data: String,
    #[serde(default)]
    pub xp_amount: i32,
    #[serde(default)]
    pub xp_levels: i32,
    #[serde(default)]
    pub command: String,
    #[serde(default)]
    pub loot_table: String,
    #[serde(default)]
    pub game_stage: String,
    #[serde(default)]
    pub weight: f64,
    #[serde(default)]
    pub reward_chests: Vec<String>,
    #[serde(default)]
    pub team_reward: bool,
    #[serde(default)]
    pub toast_message: String,
    #[serde(default)]
    pub table_id: String,
    #[serde(default)]
    pub choices: Vec<String>,
    #[serde(default)]
    pub consume_items: bool,
    #[serde(default)]
    pub match_nbt: bool,
    #[serde(default)]
    pub ignore_nbt: bool,
}

impl Default for QuestReward {
    fn default() -> Self {
        Self {
            id: Uuid::new_v4().to_string(),
            label: String::new(),
            reward_type: RewardType::Item,
            items: Vec::new(),
            description: String::new(),
            item_id: String::new(),
            item_tag: String::new(),
            item_count: 1,
            nbt_data: String::new(),
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
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RewardType {
    Item,
    ItemWithWeight,
    Choice,
    AllTable,
    Random,
    Experience,
    XpLevels,
    Unlock,
    Command,
    LootTable,
    Advancement,
    Toast,
    GameStage,
    Custom,
}

impl RewardType {
    pub fn to_string(&self) -> String {
        match self {
            RewardType::Item => "item".to_string(),
            RewardType::ItemWithWeight => "item_weighted".to_string(),
            RewardType::Choice => "choice".to_string(),
            RewardType::AllTable => "all_table".to_string(),
            RewardType::Random => "random".to_string(),
            RewardType::Experience => "experience".to_string(),
            RewardType::XpLevels => "xp_levels".to_string(),
            RewardType::Unlock => "unlock".to_string(),
            RewardType::Command => "command".to_string(),
            RewardType::LootTable => "loot_table".to_string(),
            RewardType::Advancement => "advancement".to_string(),
            RewardType::Toast => "toast".to_string(),
            RewardType::GameStage => "game_stage".to_string(),
            RewardType::Custom => "custom".to_string(),
        }
    }

    pub fn from_string(s: &str) -> Self {
        match s.to_lowercase().as_str() {
            "item" => RewardType::Item,
            "item_weighted" | "weighted" | "item_with_weight" => RewardType::ItemWithWeight,
            "choice" | "choose" | "player_choice" => RewardType::Choice,
            "all_table" | "all_rewards" => RewardType::AllTable,
            "random" | "random_reward" => RewardType::Random,
            "experience" | "xp" => RewardType::Experience,
            "xp_levels" | "levels" | "experience_levels" => RewardType::XpLevels,
            "unlock" => RewardType::Unlock,
            "command" | "cmd" => RewardType::Command,
            "loot_table" | "loot" | "loottable" => RewardType::LootTable,
            "advancement" | "adv" => RewardType::Advancement,
            "toast" | "notification" => RewardType::Toast,
            "game_stage" | "stage" | "gamestage" => RewardType::GameStage,
            _ => RewardType::Custom,
        }
    }

    pub fn display_name(&self) -> &str {
        match self {
            RewardType::Item => "Item Reward",
            RewardType::ItemWithWeight => "Weighted Item",
            RewardType::Choice => "Choice Reward",
            RewardType::AllTable => "All Table",
            RewardType::Random => "Random Reward",
            RewardType::Experience => "Experience",
            RewardType::XpLevels => "XP Levels",
            RewardType::Unlock => "Unlock",
            RewardType::Command => "Command",
            RewardType::LootTable => "Loot Table",
            RewardType::Advancement => "Advancement",
            RewardType::Toast => "Toast Notification",
            RewardType::GameStage => "Game Stage",
            RewardType::Custom => "Custom",
        }
    }
}

/// An edge connecting two quest nodes
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QuestEdge {
    pub id: String,
    pub source: String,
    pub target: String,
    pub label: Option<String>,
    pub edge_type: EdgeType,
    #[serde(default)]
    pub inverted: bool,
}

impl Default for QuestEdge {
    fn default() -> Self {
        Self {
            id: Uuid::new_v4().to_string(),
            source: String::new(),
            target: String::new(),
            label: None,
            edge_type: EdgeType::Prerequisite,
            inverted: false,
        }
    }
}

/// The complete quest graph
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QuestGraph {
    pub id: String,
    pub project_id: String,
    pub name: String,
    pub description: String,
    pub nodes: Vec<QuestNode>,
    pub edges: Vec<QuestEdge>,
    #[serde(default)]
    pub chapters: Vec<QuestChapter>,
    #[serde(default)]
    pub chapter_groups: Vec<QuestChapterGroup>,
    #[serde(default)]
    pub book_progression_mode: QuestProgressionMode,
    #[serde(default)]
    pub book_icon: String,
    #[serde(default)]
    pub book_background_image: String,
    #[serde(default)]
    pub quest_color: String,
    #[serde(default)]
    pub default_quest_size: QuestSize,
    #[serde(default)]
    pub default_quest_shape: QuestShape,
}

impl QuestGraph {
    pub fn new(project_id: &str, name: &str) -> Self {
        Self {
            id: Uuid::new_v4().to_string(),
            project_id: project_id.to_string(),
            name: name.to_string(),
            description: String::new(),
            nodes: Vec::new(),
            edges: Vec::new(),
            chapters: Vec::new(),
            chapter_groups: Vec::new(),
            book_progression_mode: QuestProgressionMode::Default,
            book_icon: String::new(),
            book_background_image: String::new(),
            quest_color: String::new(),
            default_quest_size: QuestSize::default(),
            default_quest_shape: QuestShape::Default,
        }
    }
}

/// Analysis results for the quest graph
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QuestAnalysis {
    pub total_quests: usize,
    pub total_chapters: usize,
    pub total_objectives: usize,
    pub total_rewards: usize,
    pub orphaned_quests: Vec<OrphanedQuest>,
    pub incomplete_quests: Vec<IncompleteQuest>,
    pub chapters: Vec<ChapterSummary>,
    pub issues: Vec<QuestIssue>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OrphanedQuest {
    pub quest_id: String,
    pub quest_label: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IncompleteQuest {
    pub quest_id: String,
    pub quest_label: String,
    pub missing_objectives: usize,
    pub missing_rewards: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChapterSummary {
    pub chapter_id: String,
    pub chapter_label: String,
    pub quest_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QuestIssue {
    pub severity: String,
    pub message: String,
    pub node_id: Option<String>,
}

#[cfg(test)]
mod quest_shape_tests {
    use super::QuestShape;

    #[test]
    fn parses_modern_ftb_shape_ids() {
        assert_eq!(QuestShape::from_string("circle"), QuestShape::Circle);
        assert_eq!(QuestShape::from_string("square"), QuestShape::Square);
        assert_eq!(QuestShape::from_string("rounded_square"), QuestShape::RoundedSquare);
        assert_eq!(QuestShape::from_string("diamond"), QuestShape::Diamond);
        assert_eq!(QuestShape::from_string("pentagon"), QuestShape::Pentagon);
        assert_eq!(QuestShape::from_string("hexagon"), QuestShape::Hexagon);
        assert_eq!(QuestShape::from_string("octagon"), QuestShape::Octagon);
        assert_eq!(QuestShape::from_string("heart"), QuestShape::Heart);
        assert_eq!(QuestShape::from_string("gear"), QuestShape::Gear);
    }

    #[test]
    fn parses_legacy_shape_aliases() {
        assert_eq!(QuestShape::from_string("rsquare"), QuestShape::RoundedSquare);
        assert_eq!(QuestShape::from_string("roundedsquare"), QuestShape::RoundedSquare);
        assert_eq!(QuestShape::from_string("rounded"), QuestShape::RoundedSquare);
        assert_eq!(QuestShape::from_string("RSQUARE"), QuestShape::RoundedSquare);
    }

    #[test]
    fn unknown_and_empty_fall_back_to_default() {
        assert_eq!(QuestShape::from_string(""), QuestShape::Default);
        assert_eq!(QuestShape::from_string("blob"), QuestShape::Default);
        assert_eq!(QuestShape::from_string("default"), QuestShape::Default);
    }
}
