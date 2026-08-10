//! CurseForge `manifest.json` data structures.

use serde::{Deserialize, Serialize};

/// CurseForge manifest.json format
#[derive(Debug, Deserialize, Serialize)]
pub struct CurseForgeManifest {
    #[serde(rename = "minecraft")]
    pub minecraft: CurseForgeMinecraft,

    #[serde(rename = "manifestType", default)]
    pub manifest_type: Option<String>,

    #[serde(rename = "manifestVersion", default)]
    pub manifest_version: Option<u32>,

    #[serde(default)]
    pub name: Option<String>,

    #[serde(default)]
    pub author: Option<String>,

    #[serde(default)]
    pub description: Option<String>,

    #[serde(default)]
    pub version: Option<String>,

    #[serde(default)]
    pub files: Vec<CurseForgeFile>,

    #[serde(rename = "overrides", default)]
    pub overrides: Option<String>,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct CurseForgeMinecraft {
    pub version: String,

    #[serde(rename = "modLoaders")]
    pub mod_loaders: Vec<CurseForgeModLoader>,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct CurseForgeModLoader {
    pub id: String,

    #[serde(rename = "primary", default)]
    pub primary: bool,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct CurseForgeFile {
    #[serde(rename = "projectID")]
    pub project_id: u64,

    #[serde(rename = "fileID")]
    pub file_id: u64,

    #[serde(rename = "required", default = "default_true")]
    pub required: bool,
}

fn default_true() -> bool {
    true
}
