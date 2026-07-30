use crate::imports::ConfigFormat;
use crate::models::ModLoader;
use anyhow::Result;
use serde::Deserialize;
use std::io::Read;
use std::path::Path;
use zip::ZipArchive;

// ── Shared Position type (used by both progression.rs and quest.rs) ──────────

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct Position {
    pub x: f64,
    pub y: f64,
}

// ── Shared EdgeType (superset of both progression.rs and quest.rs variants) ──

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum EdgeType {
    Prerequisite,
    Optional,
    Alternative,
    Inverted,
}

impl EdgeType {
    pub fn to_string(&self) -> String {
        match self {
            EdgeType::Prerequisite => "prerequisite".to_string(),
            EdgeType::Optional => "optional".to_string(),
            EdgeType::Alternative => "alternative".to_string(),
            EdgeType::Inverted => "inverted".to_string(),
        }
    }

    pub fn from_string(s: &str) -> Self {
        match s.to_lowercase().as_str() {
            "optional" => EdgeType::Optional,
            "alternative" => EdgeType::Alternative,
            "inverted" | "inverted_requirement" => EdgeType::Inverted,
            _ => EdgeType::Prerequisite,
        }
    }

    pub fn display_name(&self) -> &str {
        match self {
            EdgeType::Prerequisite => "Prerequisite",
            EdgeType::Optional => "Optional",
            EdgeType::Alternative => "Alternative",
            EdgeType::Inverted => "Inverted (requires NOT complete)",
        }
    }
}

// ── Config format detection (was duplicated 4x across import modules) ────────

pub fn detect_config_format(path: &str) -> ConfigFormat {
    if path.ends_with(".toml") {
        ConfigFormat::Toml
    } else if path.ends_with(".json") {
        ConfigFormat::Json
    } else if path.ends_with(".cfg") || path.ends_with(".properties") {
        ConfigFormat::Properties
    } else if path.ends_with(".yaml") || path.ends_with(".yml") {
        ConfigFormat::Yaml
    } else if path.ends_with(".hocon") {
        ConfigFormat::Hocon
    } else {
        ConfigFormat::Toml
    }
}

// ── Mod jar metadata extraction (was duplicated 3x across import modules) ────

#[derive(Debug)]
pub struct ModJarInfo {
    pub mod_id: Option<String>,
    pub version: Option<String>,
    pub loader: Option<ModLoader>,
}

#[derive(Debug, Deserialize)]
struct FabricModJson {
    id: String,
    version: serde_json::Value,
}

#[derive(Debug, Deserialize)]
struct QuiltModJson {
    version: serde_json::Value,
    quilt_loader: QuiltLoader,
}

#[derive(Debug, Deserialize)]
struct QuiltLoader {
    entrypoints: QuiltEntrypoints,
}

#[derive(Debug, Deserialize)]
struct QuiltEntrypoints {
    main: Vec<String>,
}

#[derive(Debug, Deserialize)]
struct McmodInfo {
    modid: String,
    version: String,
}

fn extract_version_string(val: &serde_json::Value) -> Option<String> {
    match val {
        serde_json::Value::String(s) => Some(s.clone()),
        serde_json::Value::Object(obj) => obj
            .get("range")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string())
            .or_else(|| {
                obj.get("requires")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string())
            }),
        _ => None,
    }
}

/// Extract mod metadata from a JAR file by inspecting fabric.mod.json,
/// quilt.mod.json, META-INF/mods.toml, META-INF/neoforge.mods.toml,
/// or mcmod.info inside the archive.
pub fn extract_mod_info_from_jar(jar_path: &Path) -> Result<Option<ModJarInfo>> {
    let file = std::fs::File::open(jar_path)?;
    let mut archive = ZipArchive::new(file)?;

    for i in 0..archive.len() {
        let mut entry = archive.by_index(i)?;
        let name = entry.name();

        if name == "fabric.mod.json" {
            let mut content = String::new();
            entry.read_to_string(&mut content)?;
            // Try typed deserialization first
            if let Ok(fabric_mod) = serde_json::from_str::<FabricModJson>(&content) {
                return Ok(Some(ModJarInfo {
                    mod_id: Some(fabric_mod.id),
                    version: extract_version_string(&fabric_mod.version),
                    loader: Some(ModLoader::Fabric),
                }));
            }
            // Fallback: raw JSON traversal
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
                let mod_id = json
                    .get("id")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string());
                let version = json
                    .get("version")
                    .and_then(|v| extract_version_string(v));
                if mod_id.is_some() {
                    return Ok(Some(ModJarInfo {
                        mod_id,
                        version,
                        loader: Some(ModLoader::Fabric),
                    }));
                }
            }
        } else if name == "quilt.mod.json" {
            let mut content = String::new();
            entry.read_to_string(&mut content)?;
            // Try typed deserialization first
            if let Ok(quilt_mod) = serde_json::from_str::<QuiltModJson>(&content) {
                let mod_id = quilt_mod
                    .quilt_loader
                    .entrypoints
                    .main
                    .first()
                    .cloned()
                    .unwrap_or_default();
                return Ok(Some(ModJarInfo {
                    mod_id: Some(mod_id),
                    version: extract_version_string(&quilt_mod.version),
                    loader: Some(ModLoader::Quilt),
                }));
            }
            // Fallback: raw JSON traversal
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
                let mod_id = json
                    .pointer("/quilt_loader/entrypoints/main/0")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string());
                let version = json
                    .get("version")
                    .and_then(|v| extract_version_string(v));
                if mod_id.is_some() {
                    return Ok(Some(ModJarInfo {
                        mod_id,
                        version,
                        loader: Some(ModLoader::Quilt),
                    }));
                }
            }
        } else if name == "META-INF/mods.toml" {
            let mut content = String::new();
            entry.read_to_string(&mut content)?;
            if let Ok(doc) = content.parse::<toml_edit::DocumentMut>() {
                if let Some(mods) = doc.get("mods").and_then(|m| m.as_array_of_tables()) {
                    if let Some(first_mod) = mods.iter().next() {
                        return Ok(Some(ModJarInfo {
                            mod_id: first_mod
                                .get("modId")
                                .and_then(|v| v.as_str())
                                .map(|s| s.to_string()),
                            version: first_mod
                                .get("version")
                                .and_then(|v| v.as_str())
                                .map(|s| s.to_string()),
                            loader: Some(ModLoader::Forge),
                        }));
                    }
                }
            }
        } else if name == "META-INF/neoforge.mods.toml" {
            let mut content = String::new();
            entry.read_to_string(&mut content)?;
            if let Ok(doc) = content.parse::<toml_edit::DocumentMut>() {
                if let Some(mods) = doc.get("mods").and_then(|m| m.as_array_of_tables()) {
                    if let Some(first_mod) = mods.iter().next() {
                        return Ok(Some(ModJarInfo {
                            mod_id: first_mod
                                .get("modId")
                                .and_then(|v| v.as_str())
                                .map(|s| s.to_string()),
                            version: first_mod
                                .get("version")
                                .and_then(|v| v.as_str())
                                .map(|s| s.to_string()),
                            loader: Some(ModLoader::NeoForge),
                        }));
                    }
                }
            }
        } else if name == "mcmod.info" {
            let mut content = String::new();
            entry.read_to_string(&mut content)?;
            if let Ok(info) = serde_json::from_str::<Vec<McmodInfo>>(&content) {
                if let Some(first) = info.first() {
                    return Ok(Some(ModJarInfo {
                        mod_id: Some(first.modid.clone()),
                        version: Some(first.version.clone()),
                        loader: Some(ModLoader::Forge),
                    }));
                }
            }
        }
    }

    Ok(None)
}
