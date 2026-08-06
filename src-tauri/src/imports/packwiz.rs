use anyhow::Result;
use crate::imports::{ConfigFile, ImportResult, UnresolvedMod, ResolvedMod};
use crate::models::{ModLoader, PackFormat, Project};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use uuid::Uuid;

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

impl PackwizWorkspace {
    /// Load a Packwiz workspace from a directory
    pub fn load(workspace_dir: &Path) -> Result<Self> {
        let pack_path = workspace_dir.join("pack.toml");
        let index_path = workspace_dir.join("index.toml");
        let mods_dir = workspace_dir.join("mods");

        if !pack_path.exists() {
            return Err(anyhow::anyhow!("pack.toml not found in {}", workspace_dir.display()));
        }
        if !index_path.exists() {
            return Err(anyhow::anyhow!("index.toml not found in {}", workspace_dir.display()));
        }

        let pack_content = std::fs::read_to_string(&pack_path)?;
        let pack: PackwizPack = toml_edit::de::from_str(&pack_content)?;

        let index_content = std::fs::read_to_string(&index_path)?;
        let index: HashMap<String, PackwizIndexEntry> = toml_edit::de::from_str(&index_content)?;

        // Load individual mod metadata from .pw.toml files
        let mut mod_metadata = HashMap::new();
        if mods_dir.exists() {
            for entry in std::fs::read_dir(&mods_dir)? {
                let entry = entry?;
                let path = entry.path();
                if path.extension().map_or(false, |ext| ext == "toml") {
                    if let Ok(content) = std::fs::read_to_string(&path) {
                        if let Ok(meta) = toml_edit::de::from_str::<PackwizModMeta>(&content) {
                            mod_metadata.insert(meta.filename.clone(), meta);
                        }
                    }
                }
            }
        }

        Ok(Self {
            pack,
            index,
            mods_dir,
            mod_metadata,
        })
    }

    /// Get all mod IDs from the index
    pub fn get_mod_ids(&self) -> Vec<String> {
        self.index.keys().cloned().collect()
    }

    /// Get mod metadata by filename
    pub fn get_mod_meta(&self, filename: &str) -> Option<&PackwizModMeta> {
        self.mod_metadata.get(filename)
    }

    /// Get the download URL for a mod if available
    pub fn get_mod_url(&self, mod_id: &str) -> Option<String> {
        self.index.get(mod_id).and_then(|e| e.url.clone())
    }

    /// Check if mod is client-side only
    pub fn is_client_only(&self, mod_id: &str) -> bool {
        self.index.get(mod_id)
            .and_then(|e| e.side.as_deref())
            .map(|s| s == "client")
            .unwrap_or(false)
    }

    /// Check if mod is server-side only
    pub fn is_server_only(&self, mod_id: &str) -> bool {
        self.index.get(mod_id)
            .and_then(|e| e.side.as_deref())
            .map(|s| s == "server")
            .unwrap_or(false)
    }

    /// Get the full path to a mod file
    pub fn get_mod_path(&self, mod_id: &str) -> Option<PathBuf> {
        self.index.get(mod_id).map(|e| self.mods_dir.join(&e.file))
    }

    /// Get all mods with their display info for UI
    pub fn get_mods_for_ui(&self) -> Vec<PackwizModUiInfo> {
        self.index.iter().map(|(id, entry)| {
            // Try to get metadata - entry.file might have "mods/" prefix
            let meta = self.mod_metadata.get(&entry.file)
                .or_else(|| {
                    // Try without "mods/" prefix
                    let filename = entry.file.strip_prefix("mods/").unwrap_or(&entry.file);
                    self.mod_metadata.get(filename)
                });
            PackwizModUiInfo {
                id: id.clone(),
                filename: entry.file.clone(),
                name: meta.as_ref().map(|m| m.name.clone()).unwrap_or_else(|| entry.file.clone()),
                version: meta.as_ref().and_then(|m| m.extra.get("version-id").and_then(|v| v.as_str())).unwrap_or("unknown").to_string(),
                url: entry.url.clone(),
                side: entry.side.clone().unwrap_or_else(|| "both".to_string()),
                update_info: entry.update.clone(),
                requires: entry.requires.clone().unwrap_or_default(),
            }
        }).collect()
    }
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

/// Parse a Packwiz workspace and return structured data for the UI
pub fn parse_packwiz_workspace(path: &str) -> Result<PackwizWorkspace> {
    PackwizWorkspace::load(Path::new(path))
}

/// Packwiz importer compatible with the existing import system
pub struct PackwizImporter;

impl PackwizImporter {
    /// Check if this is a packwiz workspace (has pack.toml and index.toml)
    pub fn can_import(path: &Path) -> bool {
        path.join("pack.toml").exists() && path.join("index.toml").exists()
    }

    /// Import a packwiz workspace
    pub fn import(path: &Path) -> Result<ImportResult> {
        let workspace = PackwizWorkspace::load(path)?;

        // Determine loader from pack.toml
        let loader = match workspace.pack.loader.to_lowercase().as_str() {
            "forge" => ModLoader::Forge,
            "neoforge" => ModLoader::NeoForge,
            "fabric" => ModLoader::Fabric,
            "quilt" => ModLoader::Quilt,
            _ => ModLoader::Fabric,
        };

        let project = Project {
            id: Uuid::new_v4(),
            name: workspace.pack.name,
            description: workspace.pack.description.unwrap_or_default(),
            minecraft_version: workspace.pack.minecraft,
            mod_loader: loader,
            pack_format: PackFormat::Packwiz,
            pack_version: workspace.pack.version,
            author: workspace.pack.author.unwrap_or_default(),
            created_at: chrono::Utc::now(),
            updated_at: chrono::Utc::now(),
            path: path.to_string_lossy().to_string(),
            source: "modcanvas".to_string(),
        };

        let mut mods = Vec::new();
        let mut unresolved_mods = Vec::new();

        for (id, entry) in workspace.index {
            let meta = workspace.mod_metadata.get(&entry.file);
            
            // Try to extract mod info from the JAR if it exists
            let mod_path = path.join("mods").join(&entry.file);
            let jar_info = if mod_path.exists() {
                crate::shared::extract_mod_info_from_jar(&mod_path).ok().flatten()
            } else {
                None
            };
            
            // Extract modrinth ID from URL
            let url_mod_id = entry.url.as_ref().and_then(|u| extract_modrinth_id_from_url(u));
            
            let mod_id = meta.as_ref().and_then(|m| m.extra.get("modrinth-id").and_then(|v| v.as_str()))
                .or_else(|| entry.extra.get("modrinth-id").and_then(|v| v.as_str()))
                .or_else(|| url_mod_id.as_deref())
                .or_else(|| jar_info.as_ref().and_then(|i| i.mod_id.as_deref()));

            let version = meta.as_ref().and_then(|m| m.extra.get("version-id").and_then(|v| v.as_str()))
                .or_else(|| entry.extra.get("version-id").and_then(|v| v.as_str()))
                .or_else(|| jar_info.as_ref().and_then(|i| i.version.as_deref()))
                .unwrap_or("unknown").to_string();

            let loader = jar_info.as_ref().and_then(|i| i.loader.as_ref().map(|l| l.to_string()))
                .or_else(|| meta.as_ref().and_then(|m| m.side.clone()));

            if let Some(mod_id) = mod_id {
                mods.push(ResolvedMod {
                    mod_id: mod_id.to_string(),
                    slug: meta.as_ref().map(|m| m.name.clone()).unwrap_or_else(|| entry.file.clone()),
                    name: meta.as_ref().map(|m| m.name.clone()).unwrap_or_else(|| entry.file.clone()),
                    version: version.clone(),
                    source: "Modrinth".to_string(),
                    file_name: entry.file.clone(),
                });
            } else {
                unresolved_mods.push(UnresolvedMod {
                    file_name: entry.file,
                    mod_id: mod_id.map(|s| s.to_string()),
                    version: Some(version),
                    loader,
                });
            }
        }

        // Scan for config files
        let mut config_files = Vec::new();
        let config_dir = path.join("config");
        if config_dir.exists() {
            for entry in walkdir::WalkDir::new(&config_dir).into_iter().filter_map(|e| e.ok()) {
                if entry.path().is_file() {
                    if let Ok(content) = std::fs::read_to_string(entry.path()) {
                        let format = crate::shared::detect_config_format(entry.path().to_str().unwrap_or(""));
                        let rel_path = entry.path().strip_prefix(path).unwrap_or(entry.path()).to_path_buf();
                        config_files.push(ConfigFile {
                            path: rel_path,
                            content,
                            format,
                        });
                    }
                }
            }
        }

        Ok(ImportResult {
            project,
            mods,
            unresolved_mods,
            config_files,
            progression_graph: None,
            quest_graph: None,
        })
    }
}

fn extract_modrinth_id_from_url(url: &str) -> Option<String> {
    // URLs like: https://cdn.modrinth.com/data/P7dR8mSH/version/abc123/file.jar
    let parts: Vec<&str> = url.split('/').collect();
    if let Some(pos) = parts.iter().position(|&s| s == "data") {
        if let Some(id) = parts.get(pos + 1) {
            let id = id.trim_end_matches('/');
            if !id.is_empty() {
                return Some(id.to_string());
            }
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;
    use std::fs;

    #[test]
    fn test_packwiz_parse() {
        let dir = tempdir().unwrap();
        let workspace = dir.path();

        // Create pack.toml
        let pack_toml = r#"
name = "Test Pack"
version = "1.0.0"
minecraft = "1.20.1"
loader = "neoforge"
"#;
        fs::write(workspace.join("pack.toml"), pack_toml).unwrap();

        // Create index.toml
        let index_toml = r#"
["mods/jei-1.20.1-15.0.0.1.jar"]
file = "mods/jei-1.20.1-15.0.0.1.jar"
hash = "abc123"
url = "https://example.com/jei.jar"

["mods/create-1.20.1-0.5.1.jar"]
file = "mods/create-1.20.1-0.5.1.jar"
hash = "def456"
url = "https://example.com/create.jar"
side = "both"
"#;
        fs::write(workspace.join("index.toml"), index_toml).unwrap();

        // Create mods dir and .pw.toml
        let mods_dir = workspace.join("mods");
        fs::create_dir_all(&mods_dir).unwrap();

        let jei_meta = r#"
name = "Just Enough Items"
filename = "jei-1.20.1-15.0.0.1.jar"
side = "both"
"#;
        fs::write(mods_dir.join("jei-1.20.1-15.0.0.1.pw.toml"), jei_meta).unwrap();

        // Parse
        let ws = PackwizWorkspace::load(workspace).unwrap();
        assert_eq!(ws.pack.name, "Test Pack");
        assert_eq!(ws.index.len(), 2);
        assert!(ws.mod_metadata.contains_key("jei-1.20.1-15.0.0.1.jar"));

        let ui_mods = ws.get_mods_for_ui();
        assert_eq!(ui_mods.len(), 2);
        let jei = ui_mods.iter().find(|m| m.id.contains("jei")).unwrap();
        assert_eq!(jei.name, "Just Enough Items");
    }
}
