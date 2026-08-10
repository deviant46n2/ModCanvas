//! Packwiz pack.toml / index.toml / `.pw.toml` data structures.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;

/// Packwiz pack.toml structure
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PackwizPack {
    pub name: String,
    pub version: String,
    pub minecraft: String,
    pub loader: String,
    pub license: Option<String>,
    pub author: Option<String>,
    pub description: Option<String>,
    pub project_url: Option<String>,
    pub icon: Option<String>,
    pub pack_format: Option<String>,
}

/// Packwiz index.toml entry
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PackwizIndexEntry {
    pub file: String,
    pub hash: String,
    pub url: Option<String>,
    pub filename: Option<String>,
    pub side: Option<String>,
    #[serde(rename = "download-mode")]
    pub download_mode: Option<String>,
    pub update: Option<PackwizUpdateInfo>,
    pub requires: Option<Vec<String>>,
    pub recommended: Option<Vec<String>>,
    pub conflicting: Option<Vec<String>>,
    #[serde(flatten)]
    pub extra: HashMap<String, serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PackwizUpdateInfo {
    pub curseforge: Option<PackwizCurseForgeInfo>,
    pub modrinth: Option<PackwizModrinthInfo>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PackwizCurseForgeInfo {
    #[serde(rename = "project-id")]
    pub project_id: u32,
    #[serde(rename = "file-id")]
    pub file_id: u32,
    pub signature: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PackwizModrinthInfo {
    #[serde(rename = "project-id")]
    pub project_id: String,
    #[serde(rename = "version-id")]
    pub version_id: String,
    pub file: Option<String>,
    pub hashes: Option<Vec<String>>,
}

/// Packwiz mod metadata (from the .pw.toml file for each mod)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PackwizModMeta {
    pub name: String,
    pub filename: String,
    pub side: Option<String>,
    #[serde(rename = "download-mode")]
    pub download_mode: Option<String>,
    pub update: Option<PackwizUpdateInfo>,
    pub requires: Option<Vec<String>>,
    pub recommended: Option<Vec<String>>,
    pub conflicting: Option<Vec<String>>,
    #[serde(flatten)]
    pub extra: HashMap<String, serde_json::Value>,
}

/// Packwiz workspace representation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PackwizWorkspace {
    pub pack: PackwizPack,
    pub index: HashMap<String, PackwizIndexEntry>,
    pub mods_dir: PathBuf,
    /// Map of mod_id -> PackwizModMeta (from individual .pw.toml files)
    pub mod_metadata: HashMap<String, PackwizModMeta>,
}

/// Simplified mod info for UI display
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PackwizModUiInfo {
    pub id: String,
    pub filename: String,
    pub name: String,
    pub version: String,
    pub url: Option<String>,
    pub side: String,
    pub update_info: Option<PackwizUpdateInfo>,
    pub requires: Vec<String>,
}
