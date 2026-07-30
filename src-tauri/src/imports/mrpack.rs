use crate::imports::{ConfigFile, ImportResult, UnresolvedMod, extract_mrpack};
use crate::models::{ModLoader, PackFormat};
use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::Path;
use uuid::Uuid;

#[derive(Debug, Deserialize, Serialize)]
pub struct MrPackIndex {
    #[serde(rename = "formatVersion")]
    pub format_version: u32,
    pub game: String,
    #[serde(rename = "versionId")]
    pub version_id: String,
    pub name: String,
    pub summary: Option<String>,
    pub files: Vec<MrPackFile>,
    pub dependencies: MrPackDependencies,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct MrPackFile {
    pub path: String,
    pub hashes: HashMap<String, String>,
    pub env: MrPackFileEnv,
    pub downloads: Vec<String>,
    #[serde(rename = "fileSize")]
    pub file_size: u64,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct MrPackFileEnv {
    pub client: String,
    pub server: String,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct MrPackDependencies {
    pub minecraft: String,
    #[serde(rename = "forge", default)]
    pub forge: Option<String>,
    #[serde(rename = "neoforge", default)]
    pub neoforge: Option<String>,
    #[serde(rename = "fabric", default)]
    pub fabric: Option<String>,
    #[serde(rename = "quilt", default)]
    pub quilt: Option<String>,
    #[serde(default)]
    pub loaders: Vec<MrPackLoaderDependency>,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct MrPackLoaderDependency {
    pub id: String,
    pub version: String,
}

impl MrPackIndex {
    pub fn load(path: &Path) -> Result<Self> {
        let content = std::fs::read_to_string(path)
            .with_context(|| format!("Failed to read modrinth.index.json at {}", path.display()))?;
        
        let index: MrPackIndex = serde_json::from_str(&content)
            .with_context(|| "Failed to parse modrinth.index.json")?;
        
        if index.format_version != 1 {
            anyhow::bail!("Unsupported mrpack format version: {}", index.format_version);
        }
        
        Ok(index)
    }
    
    pub fn get_loader(&self) -> ModLoader {
        if let Some(_fabric) = &self.dependencies.fabric {
            return ModLoader::Fabric;
        }
        if let Some(_quilt) = &self.dependencies.quilt {
            return ModLoader::Quilt;
        }
        if let Some(_neoforge) = &self.dependencies.neoforge {
            return ModLoader::NeoForge;
        }
        if let Some(_forge) = &self.dependencies.forge {
            return ModLoader::Forge;
        }
        ModLoader::Vanilla
    }
    
    pub fn get_loader_version(&self) -> Option<String> {
        if let Some(fabric) = &self.dependencies.fabric {
            return Some(fabric.clone());
        }
        if let Some(quilt) = &self.dependencies.quilt {
            return Some(quilt.clone());
        }
        if let Some(neoforge) = &self.dependencies.neoforge {
            return Some(neoforge.clone());
        }
        if let Some(forge) = &self.dependencies.forge {
            return Some(forge.clone());
        }
        self.dependencies.loaders.first().map(|l| l.version.clone())
    }
}

pub struct MrPackImporter;

impl MrPackImporter {
    pub fn can_import(path: &Path) -> bool {
        path.join("modrinth.index.json").exists()
            || path.extension().map_or(false, |ext| ext == "mrpack")
    }
    
    pub fn import(path: &Path) -> Result<ImportResult> {
        let _temp;
        let temp_dir = if path.extension().map_or(false, |ext| ext == "mrpack") {
            _temp = tempfile::tempdir()?;
            eprintln!("[ModCanvas] Extracting mrpack to {}", _temp.path().display());
            extract_mrpack(path, _temp.path())?;
            eprintln!("[ModCanvas] Extraction complete, listing contents recursively...");
            for entry in walkdir::WalkDir::new(_temp.path()).into_iter().filter_map(|e| e.ok()) {
                let path = entry.path();
                if path.is_file() {
                    eprintln!("[ModCanvas]   {}", path.display());
                }
            }
            _temp.path().to_path_buf()
        } else {
            path.to_path_buf()
        };
        
        let index_path = temp_dir.join("modrinth.index.json");
        let index = MrPackIndex::load(&index_path)?;
        
        let loader = index.get_loader();
        let _loader_version = index.get_loader_version();
        
        let project = crate::models::Project {
            id: Uuid::new_v4(),
            name: index.name.clone(),
            description: index.summary.unwrap_or_default(),
            minecraft_version: index.dependencies.minecraft.clone(),
            mod_loader: loader,
            pack_format: PackFormat::ModrinthMrpack,
            pack_version: index.version_id.clone(),
            author: String::new(),
            created_at: chrono::Utc::now(),
            updated_at: chrono::Utc::now(),
            path: temp_dir.to_string_lossy().to_string(),
        };
        
        let mods = Vec::new();
        let mut unresolved_mods = Vec::new();
        let mut config_files = Vec::new();
        
        for file in &index.files {
            let safe_rel_path = crate::path_safety::sanitize_zip_entry_path(&file.path)
                .map_err(|e| anyhow::anyhow!("{e}"))?;
            let file_path = temp_dir.join(&safe_rel_path);
            
            if file.path.starts_with("mods/") && file.path.ends_with(".jar") {
                // Try to extract Modrinth project ID from download URLs
                let modrinth_id = file.downloads.iter()
                    .filter_map(|url| extract_modrinth_id_from_url(url))
                    .next();
                
                if let Some(mod_id) = &modrinth_id {
                    eprintln!("[ModCanvas] Found Modrinth ID '{}' from URL for {}", mod_id, file.path);
                }
                
                // Try to read jar metadata if it was extracted (unlikely in mrpack)
                let jar_info = if file_path.exists() {
                    match crate::shared::extract_mod_info_from_jar(&file_path) {
                        Ok(info) => info,
                        Err(e) => {
                            eprintln!("[ModCanvas] Failed to read jar {}: {}", file.path, e);
                            None
                        }
                    }
                } else {
                    None
                };
                
                unresolved_mods.push(UnresolvedMod {
                    file_name: file.path.clone(),
                    mod_id: modrinth_id.or_else(|| jar_info.as_ref().and_then(|i| i.mod_id.clone())),
                    version: jar_info.as_ref().and_then(|i| i.version.clone()),
                    loader: jar_info.as_ref().and_then(|i| i.loader.as_ref().map(|l| l.to_string())),
                });
            } else if file.path.starts_with("config/") {
                if let Ok(content) = std::fs::read_to_string(&file_path) {
                    let format = crate::shared::detect_config_format(&file.path);
                    config_files.push(ConfigFile {
                        path: file.path.clone().into(),
                        content,
                        format,
                    });
                }
            } else if file.path.starts_with("defaultconfigs/") {
                if let Ok(content) = std::fs::read_to_string(&file_path) {
                    let format = crate::shared::detect_config_format(&file.path);
                    config_files.push(ConfigFile {
                        path: file.path.clone().into(),
                        content,
                        format,
                    });
                }
            }
        }
        
        Ok(ImportResult {
            project,
            mods,
            unresolved_mods,
            config_files,
            progression_graph: {
                let progression_path = temp_dir.join("progression.json");
                if progression_path.exists() {
                    let content = std::fs::read_to_string(&progression_path).ok();
                    content.and_then(|c| serde_json::from_str(&c).ok())
                } else {
                    None
                }
            },
            quest_graph: {
                let quest_path = temp_dir.join("quests.json");
                if quest_path.exists() {
                    let content = std::fs::read_to_string(&quest_path).ok();
                    content.and_then(|c| serde_json::from_str(&c).ok())
                } else {
                    None
                }
            },
        })
    }
}

fn extract_modrinth_id_from_url(url: &str) -> Option<String> {
    // URLs like: https://cdn.modrinth.com/data/P7dR8mSH/version/abc123/file.jar
    // or: https://cdn.modrinth.com/data/<hash>/versions/<hash>/<filename>
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