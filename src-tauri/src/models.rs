use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;
use std::collections::HashMap;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum ModLoader {
    Forge,
    NeoForge,
    Fabric,
    Quilt,
    Vanilla,
}

impl std::fmt::Display for ModLoader {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ModLoader::Forge => write!(f, "Forge"),
            ModLoader::NeoForge => write!(f, "NeoForge"),
            ModLoader::Fabric => write!(f, "Fabric"),
            ModLoader::Quilt => write!(f, "Quilt"),
            ModLoader::Vanilla => write!(f, "Vanilla"),
        }
    }
}

impl ModLoader {
    pub fn from_str(s: &str) -> ModLoader {
        match s.to_lowercase().as_str() {
            "forge" => ModLoader::Forge,
            "neoforge" | "neo" => ModLoader::NeoForge,
            "fabric" => ModLoader::Fabric,
            "quilt" => ModLoader::Quilt,
            "vanilla" => ModLoader::Vanilla,
            _ => ModLoader::Fabric, // Default to Fabric
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum PackFormat {
    CurseForge,
    ModrinthMrpack,
    Packwiz,
    MultiMC,
    Prism,
    Zip,
    Unknown,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Project {
    pub id: Uuid,
    pub name: String,
    pub description: String,
    pub minecraft_version: String,
    pub mod_loader: ModLoader,
    pub pack_format: PackFormat,
    pub pack_version: String,
    pub author: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModEntry {
    pub id: Uuid,
    pub project_id: Uuid,
    pub mod_id: String,
    pub slug: String,
    pub name: String,
    pub version: String,
    pub description: String,
    pub author: String,
    pub source: ModSource,
    pub enabled: bool,
    pub added_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ModSource {
    Modrinth,
    CurseForge,
    Local,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModMetadata {
    pub mod_id: String,
    pub slug: String,
    pub name: String,
    pub description: String,
    pub author: String,
    pub categories: Vec<String>,
    pub dependencies: Vec<ModDependency>,
    pub supported_loaders: Vec<ModLoader>,
    pub supported_versions: Vec<String>,
    pub downloads: u64,
    pub source_url: Option<String>,
    pub issues_url: Option<String>,
    pub documentation_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModpackMetadata {
    pub project_id: String,
    pub slug: String,
    pub name: String,
    pub description: String,
    pub author: String,
    pub categories: Vec<String>,
    pub downloads: u64,
    pub versions: Vec<String>,
    pub project_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModDependency {
    pub mod_id: String,
    pub dependency_type: DependencyType,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum DependencyType {
    Required,
    Optional,
    Recommended,
    Incompatible,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CompatibilityResult {
    pub compatible: bool,
    pub issues: Vec<CompatibilityIssue>,
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CompatibilityIssue {
    pub severity: IssueSeverity,
    pub message: String,
    pub affected_mods: Vec<String>,
    pub affected_mod_names: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum IssueSeverity {
    Error,
    Warning,
    Info,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConfigEntry {
    pub key: String,
    pub value: serde_json::Value,
    pub config_type: ConfigType,
    pub description: Option<String>,
    pub default_value: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ConfigType {
    Boolean,
    Integer,
    Float,
    String,
    Enum(Vec<String>),
    List,
    Object,
}

// ── Prism Instance types (moved from minecraft.rs to break db → minecraft coupling) ──

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MinecraftInstance {
    pub id: String,
    pub name: String,
    pub mc_version: String,
    pub loader: String,
    pub loader_version: Option<String>,
    pub game_dir: String,
    pub status: InstanceStatus,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum InstanceStatus {
    Stopped,
    Installing,
    Running,
    Crashed,
    Unknown,
}

/// Recipe system types for visual recipe editor
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Recipe {
    pub id: String,
    pub name: String,
    pub r#type: RecipeType,
    pub group: Option<String>,
    pub pattern: Option<Vec<String>>,
    pub key: Option<HashMap<String, RecipeIngredient>>,
    pub ingredients: Option<Vec<RecipeIngredient>>,
    pub output: RecipeOutput,
    pub experience: Option<f32>,
    pub cooking_time: Option<i32>,
    pub category: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "lowercase")]
pub enum RecipeType {
    Shaped,
    Shapeless,
    Smithing,
    Stonecutting,
    Smelting,
    Blasting,
    Smoking,
    Campfire,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecipeIngredient {
    pub item: String,
    pub count: Option<i32>,
    pub tag: Option<bool>,
    pub nbt: Option<HashMap<String, serde_json::Value>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecipeOutput {
    pub item: String,
    pub count: i32,
    pub nbt: Option<HashMap<String, serde_json::Value>>,
}
