use crate::imports::ConfigFormat;
use crate::models::ModLoader;
use anyhow::Result;
use serde::Deserialize;
use std::io::Read;
use std::path::Path;
use zip::ZipArchive;

// ── Shared Position type (used by the quest types) ──────────────────────────

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct Position {
    pub x: f64,
    pub y: f64,
}

// ── Shared EdgeType (used by the quest types) ───────────────────────────────

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
    pub description: Option<String>,
    pub icon_data_url: Option<String>,
}

fn read_jar_icon_data_url(archive: &mut ZipArchive<std::fs::File>, icon_path: &str) -> Option<String> {
    let path = icon_path.trim().trim_start_matches('/');
    for i in 0..archive.len() {
        let mut entry = archive.by_index(i).ok()?;
        let name = entry.name().replace('\\', "/");
        if name == path || name.ends_with(&format!("/{path}")) {
            let mut buf = Vec::new();
            if entry.read_to_end(&mut buf).ok().filter(|n| *n > 0).is_none() {
                return None;
            }
            let mime = if path.to_lowercase().ends_with(".png") {
                "image/png"
            } else if path.to_lowercase().ends_with(".jpg") || path.to_lowercase().ends_with(".jpeg") {
                "image/jpeg"
            } else if path.to_lowercase().ends_with(".gif") {
                "image/gif"
            } else {
                "image/png"
            };
            return Some(format!(
                "data:{};base64,{}",
                mime,
                base64::Engine::encode(&base64::engine::general_purpose::STANDARD, &buf)
            ));
        }
    }
    None
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
/// or mcmod.info inside the archive. Also pulls the human description and the
/// mod's own icon (from the jar, as a base64 data URL) when present.
pub fn extract_mod_info_from_jar(jar_path: &Path) -> Result<Option<ModJarInfo>> {
    let file = std::fs::File::open(jar_path)?;
    let mut archive = ZipArchive::new(file)?;

    // (info without icon data, icon path to read later)
    let mut found: Option<(ModJarInfo, Option<String>)> = None;

    for i in 0..archive.len() {
        let mut entry = match archive.by_index(i) {
            Ok(e) => e,
            Err(_) => continue,
        };
        let name = entry.name().to_string();

        if name == "fabric.mod.json" {
            let mut content = String::new();
            if entry.read_to_string(&mut content).is_err() {
                continue;
            }
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
                let icon = json
                    .get("icon")
                    .and_then(|v| match v {
                        serde_json::Value::String(s) => Some(s.clone()),
                        serde_json::Value::Object(o) => {
                            o.get("path").and_then(|p| p.as_str()).map(|s| s.to_string())
                        }
                        _ => None,
                    });
                let info = ModJarInfo {
                    mod_id: json.get("id").and_then(|v| v.as_str()).map(|s| s.to_string()),
                    version: json.get("version").and_then(|v| extract_version_string(v)),
                    loader: Some(ModLoader::Fabric),
                    description: json.get("description").and_then(|v| v.as_str()).map(|s| s.to_string()),
                    icon_data_url: None,
                };
                if info.mod_id.is_none() {
                    continue;
                }
                found = Some((info, icon));
                break;
            }
        } else if name == "quilt.mod.json" {
            let mut content = String::new();
            if entry.read_to_string(&mut content).is_err() {
                continue;
            }
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
                let mod_id = json
                    .pointer("/quilt_loader/entrypoints/main/0")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string());
                if mod_id.is_none() {
                    continue;
                }
                let info = ModJarInfo {
                    mod_id,
                    version: json.get("version").and_then(|v| extract_version_string(v)),
                    loader: Some(ModLoader::Quilt),
                    description: json.get("description").and_then(|v| v.as_str()).map(|s| s.to_string()),
                    icon_data_url: None,
                };
                let icon_path = json.get("icon").and_then(|v| v.as_str()).map(|s| s.to_string());
                found = Some((info, icon_path));
                break;
            }
        } else if name == "META-INF/mods.toml" || name == "META-INF/neoforge.mods.toml" {
            let mut content = String::new();
            if entry.read_to_string(&mut content).is_err() {
                continue;
            }
            if let Ok(doc) = content.parse::<toml_edit::DocumentMut>() {
                if let Some(mods) = doc.get("mods").and_then(|m| m.as_array_of_tables()) {
                    if let Some(first_mod) = mods.iter().next() {
                        let info = ModJarInfo {
                            mod_id: first_mod.get("modId").and_then(|v| v.as_str()).map(|s| s.to_string()),
                            version: first_mod.get("version").and_then(|v| v.as_str()).map(|s| s.to_string()),
                            loader: Some(if name.ends_with("neoforge.mods.toml") {
                                ModLoader::NeoForge
                            } else {
                                ModLoader::Forge
                            }),
                            description: first_mod
                                .get("description")
                                .and_then(|v| v.as_str())
                                .map(|s| s.to_string()),
                            icon_data_url: None,
                        };
                        let icon_path = first_mod.get("icon").and_then(|v| v.as_str()).map(|s| s.to_string());
                        found = Some((info, icon_path));
                        break;
                    }
                }
            }
        } else if name == "mcmod.info" {
            let mut content = String::new();
            if entry.read_to_string(&mut content).is_err() {
                continue;
            }
            if let Ok(info_list) = serde_json::from_str::<Vec<serde_json::Value>>(&content) {
                if let Some(first) = info_list.first() {
                    let info = ModJarInfo {
                        mod_id: first.get("modid").and_then(|v| v.as_str()).map(|s| s.to_string()),
                        version: first.get("version").and_then(|v| v.as_str()).map(|s| s.to_string()),
                        loader: Some(ModLoader::Forge),
                        description: first
                            .get("description")
                            .and_then(|v| v.as_str())
                            .map(|s| s.to_string()),
                        icon_data_url: None,
                    };
                    let logo = first.get("logoFile").and_then(|v| v.as_str()).map(|s| s.to_string());
                    found = Some((info, logo));
                    break;
                }
            }
        }
    }

    // Read the icon from the jar after the iteration borrow has ended.
    if let Some((mut info, icon_path)) = found {
        if let Some(path) = icon_path {
            info.icon_data_url = read_jar_icon_data_url(&mut archive, &path);
        }
        return Ok(Some(info));
    }
    Ok(None)
}

#[cfg(test)]
mod tests;
