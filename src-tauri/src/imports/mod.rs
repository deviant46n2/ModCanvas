//! Pack importers and import-time helpers. Shared result types live here;
//! importer implementations live in their own modules (`mrpack`, `instance`,
//! `packwiz`, `curseforge`, `ftb_quests`), with instance detection in
//! `detect`, zip helpers in `zip`, and the legacy Modrinth resolver in
//! `resolve`. The public API of this module is unchanged by the split.

pub mod mrpack;
pub mod instance;
pub mod packwiz;
pub mod curseforge;
pub mod resolution;
pub mod quest_config;
pub mod snbt;
pub mod ftb_quests;

mod detect;
mod resolve;
mod zip;

pub use detect::{detect_loader_from_files, detect_mc_version_from_instance};
pub use resolve::resolve_mods;
pub use zip::{create_mrpack_zip, default_zip_options, extract_mrpack};

#[cfg(test)]
mod snbt_roundtrip;
#[cfg(test)]
mod curseforge_tests;

use crate::models::Project;
use crate::quest::QuestGraph;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportResult {
    pub project: Project,
    pub mods: Vec<ResolvedMod>,
    pub unresolved_mods: Vec<UnresolvedMod>,
    pub config_files: Vec<ConfigFile>,
    #[serde(default)]
    pub quest_graph: Option<QuestGraph>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResolvedMod {
    pub mod_id: String,
    pub slug: String,
    pub name: String,
    pub version: String,
    pub source: String,
    /// Bare jar file name carried from the on-disk / zip-internal path so the
    /// eventual `ModEntry.file_name` can point `remove_mod` at the file.
    #[serde(default)]
    pub file_name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UnresolvedMod {
    pub file_name: String,
    pub mod_id: Option<String>,
    pub version: Option<String>,
    pub loader: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConfigFile {
    pub path: PathBuf,
    pub content: String,
    pub format: ConfigFormat,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ConfigFormat {
    Toml,
    Json,
    Properties,
    Yaml,
    Hocon,
}
