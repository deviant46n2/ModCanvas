use super::*;

use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::shared::EdgeType;
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
    /// Optional manual curvature, editor-only (not exported to SNBT). Control
    /// points are offsets relative to the source/target handle anchors in flow
    /// pixels so a curve tracks its quests. `sourceControl`/`targetControl`
    /// are `[x, y]` pairs.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub bezier: Option<EdgeBezier>,
}

/// Manual bezier control-point offsets for a curved dependency edge.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EdgeBezier {
    #[serde(default)]
    pub source_control: [f64; 2],
    #[serde(default)]
    pub target_control: [f64; 2],
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
            bezier: None,
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
    pub reward_tables: Vec<RewardTable>,
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
    /// On-disk layout this graph came from ("Subdirs" | "FlatChapters" | "Flat").
    /// Set by the import; the exporter writes ONE layout (this one when known,
    /// else the target dir's detected layout) so a pack never accumulates two
    /// copies of the same book.
    #[serde(default)]
    pub layout: String,
    #[serde(default)]
    pub default_quest_size: QuestSize,
    #[serde(default)]
    pub default_quest_shape: QuestShape,
    /// FTB quest grid snap scale (`grid_scale` from data.snbt). Positions snap to
    /// multiples of `grid_scale × minSize`; default 0.5 matches in-game.
    #[serde(default)]
    pub grid_scale: f64,
    /// `default_reward_team` from data.snbt — rewards go to the whole team.
    #[serde(default)]
    pub default_reward_team: bool,
    /// `default_consume_items` from data.snbt — tasks consume items on completion.
    #[serde(default)]
    pub default_consume_items: bool,
    /// `default_autoclaim_rewards` from data.snbt — one of "disabled", "enabled",
    /// "no_toast", "invisible" (RewardAutoClaim id, FTB default "disabled").
    #[serde(default)]
    pub default_autoclaim_rewards: String,
    /// `detection_delay` from data.snbt — quest-completion scan ticks; FTB default 20.
    #[serde(default)]
    pub detection_delay: i32,
    /// `emergency_items` from data.snbt — fallback items given on book open.
    #[serde(default)]
    pub emergency_items: Vec<EmergencyItem>,
    /// `emergency_items_cooldown` from data.snbt — seconds between grants.
    #[serde(default)]
    pub emergency_items_cooldown: i32,
    /// `lock_message` from data.snbt — tooltip shown for locked quests.
    #[serde(default)]
    pub lock_message: String,
    /// `show_lock_icons` from data.snbt — draw the lock icon on locked quests.
    #[serde(default)]
    pub show_lock_icons: bool,
    /// `fallback_locale` from data.snbt — locale used when the player's is missing.
    #[serde(default)]
    pub fallback_locale: String,
    /// `disable_gui` from data.snbt — prevent the quest book from opening in-game.
    #[serde(default)]
    pub disable_gui: bool,
    /// `pause_game` from data.snbt — pause single-player when the book is open.
    #[serde(default)]
    pub pause_game: bool,
    /// `drop_book_on_death` from data.snbt — drop the book on death (keep-inventory aware).
    #[serde(default)]
    pub drop_book_on_death: bool,
    /// `drop_loot_crates` from data.snbt — drop loot crates on kill.
    #[serde(default)]
    pub drop_loot_crates: bool,
    /// `hide_excluded_quests` from data.snbt — hide quests excluded from the current team.
    #[serde(default)]
    pub hide_excluded_quests: bool,
    /// `verify_on_load` from data.snbt — run a file integrity check on load.
    #[serde(default)]
    pub verify_on_load: bool,
    /// `default_quest_disable_jei` from data.snbt — disable JEI for quests by default.
    #[serde(default)]
    pub default_quest_disable_jei: bool,
    /// `loot_crate_no_drop` from data.snbt — per-source no-drop percentages.
    #[serde(default)]
    pub loot_crate_no_drop: LootCrateNoDrop,
    /// Book-level visual preset palette, editor-only (not exported to SNBT).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub edge_color: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub edge_cycle_color: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub active_theme: Option<String>,
}

impl Default for QuestGraph {
    fn default() -> Self {
        Self::new("", "")
    }
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
            reward_tables: Vec::new(),
            chapters: Vec::new(),
            chapter_groups: Vec::new(),
            book_progression_mode: QuestProgressionMode::Default,
            book_icon: String::new(),
            book_background_image: String::new(),
            quest_color: String::new(),
            layout: String::new(),
            default_quest_size: QuestSize::default(),
            default_quest_shape: QuestShape::Default,
            grid_scale: 0.5,
            default_reward_team: false,
            default_consume_items: false,
            default_autoclaim_rewards: "disabled".to_string(),
            detection_delay: 20,
            emergency_items: Vec::new(),
            emergency_items_cooldown: 300,
            lock_message: String::new(),
            show_lock_icons: true,
            fallback_locale: String::new(),
            disable_gui: false,
            pause_game: false,
            drop_book_on_death: false,
            drop_loot_crates: false,
            hide_excluded_quests: false,
            verify_on_load: false,
            default_quest_disable_jei: false,
            loot_crate_no_drop: LootCrateNoDrop::default(),
            edge_color: None,
            edge_cycle_color: None,
            active_theme: None,
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
