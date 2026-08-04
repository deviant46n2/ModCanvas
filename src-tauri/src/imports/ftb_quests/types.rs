use crate::imports::snbt::CommentedSnbt;
use crate::quest::QuestGraph;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

pub(crate) trait SnbtMapHelper {
    fn get_str(&self, key: &str) -> Option<&str>;
    fn get_i64(&self, key: &str) -> Option<i64>;
    fn get_f64(&self, key: &str) -> Option<f64>;
    fn get_bool(&self, key: &str) -> Option<bool>;
}

impl SnbtMapHelper for HashMap<String, CommentedSnbt> {
    fn get_str(&self, key: &str) -> Option<&str> {
        self.get(key).and_then(|c| c.value.as_str())
    }
    fn get_i64(&self, key: &str) -> Option<i64> {
        self.get(key).and_then(|c| c.value.as_i64())
    }
    fn get_f64(&self, key: &str) -> Option<f64> {
        self.get(key).and_then(|c| c.value.as_f64())
    }
    fn get_bool(&self, key: &str) -> Option<bool> {
        self.get(key).and_then(|c| c.value.as_bool())
    }
}

/// Detected FTB Quests format version
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FtBQuestsFormat {
    /// Pre-26.x: SNBT format
    Snbt,
    /// 26.x+: Json5 format
    Json5,
}

/// Detected FTB Quests directory layout
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FtBQuestsLayout {
    /// New layout: quests_dir/<chapter_dir>/chapter.snbt (subdirectories)
    Subdirs,
    /// Old layout: quests_dir/chapters/*.snbt (flat files in chapters/ dir)
    FlatChapters,
    /// Very old: quests_dir/*.snbt (flat files directly in quests dir)
    Flat,
}

/// Detailed import issue/warning
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportIssue {
    pub severity: IssueSeverity,
    pub category: IssueCategory,
    pub message: String,
    pub file: Option<String>,
    pub node_id: Option<String>,
}

/// Severity of an import issue
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum IssueSeverity {
    Error,
    Warning,
    Info,
}

/// Category of an import issue
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum IssueCategory {
    UnknownField,
    UnsupportedType,
    MissingDependency,
    DataLoss,
    FormatMismatch,
    ParseError,
    DuplicateId,
}

/// Detailed import statistics
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ImportStats {
    pub quests_parsed: usize,
    pub chapters_parsed: usize,
    pub chapter_groups_parsed: usize,
    pub tasks_parsed: usize,
    pub rewards_parsed: usize,
    pub dependencies_resolved: usize,
    pub dependencies_missing: usize,
    pub unknown_task_types: Vec<String>,
    pub unknown_reward_types: Vec<String>,
    pub files_processed: usize,
    pub files_failed: usize,
    /// Quests whose title was derived from the first task's item (fallback)
    pub title_from_task: usize,
    /// Quests whose icon was derived from the first task's item (fallback)
    pub icon_from_task: usize,
    /// Total chapter images parsed from images: [...] arrays
    pub chapter_images_total: usize,
}

/// Enhanced import result with detailed reporting
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FtBQuestsImportResult {
    pub graph: QuestGraph,
    pub format: String,
    pub layout: String,
    pub quest_count: usize,
    pub chapter_count: usize,
    pub stats: ImportStats,
    pub issues: Vec<ImportIssue>,
    /// The detected FTB Quests version (if available from data.snbt)
    pub ftb_quests_version: Option<String>,
    /// Target Minecraft version inferred from format
    pub minecraft_version: Option<String>,
    /// Raw SNBT sidecar for comment preservation during export.
    /// Populated by `import_ftb_quests`; passed to `export_ftb_quests_snbt`.
    /// Skipped during serialization — the frontend never sees this.
    #[serde(skip)]
    pub sidecar: super::snbt_sidecar::SnbtSidecar,
}

impl Default for FtBQuestsImportResult {
    fn default() -> Self {
        Self {
            graph: QuestGraph::new("", "FTB Quests Import"),
            format: String::new(),
            layout: String::new(),
            quest_count: 0,
            chapter_count: 0,
            stats: ImportStats::default(),
            issues: Vec::new(),
            ftb_quests_version: None,
            minecraft_version: None,
            sidecar: super::snbt_sidecar::SnbtSidecar::new(),
        }
    }
}
