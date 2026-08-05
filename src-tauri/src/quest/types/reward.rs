use serde::{Deserialize, Serialize};
use uuid::Uuid;
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
    pub smart_filter: String,
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
    #[serde(default)]
    pub random_bonus: f64,
    #[serde(default)]
    pub only_one: bool,
    #[serde(default)]
    pub permission_level: i32,
    #[serde(default)]
    pub silent: bool,
    #[serde(default)]
    pub feedback_message: String,
    #[serde(default)]
    pub autoclaim: String,
    #[serde(default)]
    pub exclude_from_claim_all: bool,
    #[serde(default)]
    pub ignore_reward_blocking: bool,
    #[serde(default)]
    pub disable_reward_screen_blur: bool,
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
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
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

/// A weighted reward pool referenced by random/choice/all-table rewards.
/// Serializes to an FTB `reward_tables/<hex_id>.snbt` file.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RewardTable {
    /// Hex code string id (16 uppercase hex chars), e.g. `"00E1FAFD0EF07752"`.
    pub id: String,
    #[serde(default)]
    pub title: String,
    #[serde(default)]
    pub order_index: i32,
    #[serde(default)]
    pub loot_size: i32,
    #[serde(default)]
    pub empty_weight: f64,
    #[serde(default)]
    pub hide_tooltip: bool,
    #[serde(default)]
    pub use_title: bool,
    /// Weighted rewards; each carries a `weight`.
    #[serde(default)]
    pub rewards: Vec<QuestReward>,
}

impl Default for RewardTable {
    fn default() -> Self {
        Self {
            id: Uuid::new_v4().to_string(),
            title: String::new(),
            order_index: 0,
            loot_size: 0,
            empty_weight: 0.0,
            hide_tooltip: false,
            use_title: true,
            rewards: Vec::new(),
        }
    }
}

impl RewardTable {
    /// Resolve a `table_id` reference. FTB writes the raw long into the quest
    /// file; the reward table file is keyed by the 16-digit uppercase hex form
    /// (`Long.toHexString(longId)` uppercased).
    pub fn to_hex_id(raw_long: i64) -> String {
        format!("{:016X}", raw_long)
    }

    pub fn to_long_id(hex_id: &str) -> i64 {
        i64::from_str_radix(hex_id.trim_start_matches("#"), 16).unwrap_or(0)
    }
}

/// An item entry in the book's emergency-items list (`emergency_items`).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EmergencyItem {
    pub id: String,
    #[serde(default)]
    pub count: i32,
}

/// `loot_crate_no_drop` percentages per kill source (boss/monster/passive).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LootCrateNoDrop {
    #[serde(default)]
    pub boss: i32,
    #[serde(default)]
    pub monster: i32,
    #[serde(default)]
    pub passive: i32,
}

impl Default for LootCrateNoDrop {
    fn default() -> Self {
        Self { boss: 0, monster: 0, passive: 0 }
    }
}
