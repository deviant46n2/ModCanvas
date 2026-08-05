use super::*;

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

use crate::shared::Position;
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
    /// FTB-canonical repeat cooldown in seconds (`repeat_cooldown`).
    #[serde(default)]
    pub repeat_cooldown: i64,
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
    /// FTB-canonical flag to hide the lock icon (`hide_lock_icon`).
    #[serde(default)]
    pub hide_lock_icon: bool,
    /// Guide page for FTB's in-quest guide screen (`guide_page`).
    #[serde(default)]
    pub guide_page: String,
    /// Max dependents that can complete before this quest locks (`max_completable_dependents`).
    #[serde(default)]
    pub max_completable_dependents: i32,
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
    /// For QuestLink nodes: the id of the quest this link points to.
    #[serde(default)]
    pub link_target: String,
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
            repeat_cooldown: 0,
            hide_quest_until_deps_complete: false,
            hide_quest_until_quest_complete: false,
            hide_quest_until_all_complete: false,
            disable_reward: false,
            pause_reward: false,
            lock_icon: String::new(),
            hide_lock_icon: false,
            guide_page: String::new(),
            max_completable_dependents: 0,
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
            link_target: String::new(),
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

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
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
    /// A cross-chapter reference to another quest (FTB QuestLink)
    QuestLink,
}

impl QuestNodeType {
    pub fn to_string(&self) -> String {
        match self {
            QuestNodeType::Chapter => "chapter".to_string(),
            QuestNodeType::Quest => "quest".to_string(),
            QuestNodeType::Reward => "reward".to_string(),
            QuestNodeType::Gate => "gate".to_string(),
            QuestNodeType::SideQuest => "side_quest".to_string(),
            QuestNodeType::QuestLink => "quest_link".to_string(),
        }
    }

    pub fn from_string(s: &str) -> Self {
        match s.to_lowercase().as_str() {
            "chapter" => QuestNodeType::Chapter,
            "quest" => QuestNodeType::Quest,
            "reward" => QuestNodeType::Reward,
            "gate" => QuestNodeType::Gate,
            "side_quest" | "side" => QuestNodeType::SideQuest,
            "quest_link" | "link" => QuestNodeType::QuestLink,
            _ => QuestNodeType::Quest,
        }
    }
}
