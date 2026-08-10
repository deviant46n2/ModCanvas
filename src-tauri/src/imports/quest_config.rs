//! Parsing of quest configs from various quest mod formats (FTB Quests,
//! Better Questing) into the internal `QuestGraph`. Split into submodules:
//! `ftb` (FTB Quests SNBT), `ftb_json` (FTB Quests JSON variant),
//! `better_questing` (BQ JSON), and `convert` (ParsedQuestData → QuestGraph).
//! The public API of this module is unchanged by the split.

use crate::quest::Position;
use serde::{Deserialize, Serialize};

mod better_questing;
mod convert;
mod ftb;
mod ftb_json;

pub use better_questing::parse_better_questing;
pub use convert::parse_all_quest_configs;
pub use ftb::parse_ftb_quests;


/// Parsed quest data from various quest mod formats
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParsedQuestData {
    pub nodes: Vec<ParsedQuestNode>,
    pub edges: Vec<ParsedQuestEdge>,
}

/// A quest node parsed from config
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParsedQuestNode {
    pub id: String,
    pub title: String,
    pub description: String,
    pub node_type: String,
    pub objectives: Vec<ParsedObjective>,
    pub rewards: Vec<ParsedReward>,
    pub position: Option<Position>,
    pub parent_chapter: Option<String>,
}

/// A quest edge parsed from config
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParsedQuestEdge {
    pub from: String,
    pub to: String,
    pub edge_type: String,
}

/// Parsed objective
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParsedObjective {
    pub id: String,
    pub title: String,
    pub objective_type: String,
    pub target: String,
    pub count: u32,
    pub required: bool,
}

/// Parsed reward
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParsedReward {
    pub id: String,
    pub title: String,
    pub reward_type: String,
    pub items: Vec<String>,
    pub description: String,
}
