use serde::{Deserialize, Serialize};
use uuid::Uuid;
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
    #[serde(default)]
    pub subtitle: String,
    #[serde(default)]
    pub default_min_width: i32,
    #[serde(default)]
    pub always_invisible: bool,
    #[serde(default)]
    pub default_hide_dependency_lines: bool,
    #[serde(default)]
    pub hide_quest_details_until_startable: bool,
    #[serde(default)]
    pub hide_quest_until_deps_visible: bool,
    #[serde(default)]
    pub hide_quest_until_deps_complete: bool,
    #[serde(default)]
    pub hide_text_until_complete: bool,
    #[serde(default)]
    pub autofocus_id: String,
    #[serde(default)]
    pub default_repeatable: bool,
    #[serde(default)]
    pub require_sequential_tasks: bool,
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
