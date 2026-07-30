use crate::imports::{ConfigFile, ImportResult, UnresolvedMod};
use crate::models::{ModLoader, PackFormat, Project};
use anyhow::Result;
use std::path::Path;
use uuid::Uuid;
use walkdir::WalkDir;

pub struct InstanceImporter;

impl InstanceImporter {
    pub fn can_import(path: &Path) -> bool {
        path.join("instance.json").exists() 
            || path.join("mmc-pack.json").exists()
            || path.join("mods").exists()
    }
    
    pub fn import(path: &Path) -> Result<ImportResult> {
        let mc_version = detect_mc_version_from_instance(path);
        let loader = detect_loader_from_files(path);
        
        let project = Project {
            id: Uuid::new_v4(),
            name: path.file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("Imported Instance")
                .to_string(),
            description: String::new(),
            minecraft_version: mc_version.unwrap_or_else(|| "1.21.1".to_string()),
            mod_loader: loader,
            pack_format: PackFormat::Unknown,
            pack_version: "1.0.0".to_string(),
            author: String::new(),
            created_at: chrono::Utc::now(),
            updated_at: chrono::Utc::now(),
            path: path.to_string_lossy().to_string(),
        };
        
        let mut unresolved_mods = Vec::new();
        let mut config_files = Vec::new();
        
        let mods_dir = path.join("mods");
        if mods_dir.exists() {
            for entry in WalkDir::new(&mods_dir).into_iter().filter_map(|e| e.ok()) {
                let file_path = entry.path();
                if file_path.extension().map_or(false, |ext| ext == "jar") {
                    if let Some(mod_info) = crate::shared::extract_mod_info_from_jar(file_path)? {
                        unresolved_mods.push(UnresolvedMod {
                            file_name: file_path.strip_prefix(path).unwrap_or(file_path).to_string_lossy().to_string(),
                            mod_id: mod_info.mod_id,
                            version: mod_info.version,
                            loader: mod_info.loader.map(|l| l.to_string()),
                        });
                    } else {
                        unresolved_mods.push(UnresolvedMod {
                            file_name: file_path.strip_prefix(path).unwrap_or(file_path).to_string_lossy().to_string(),
                            mod_id: None,
                            version: None,
                            loader: None,
                        });
                    }
                }
            }
        }
        
        for config_dir_name in ["config", "defaultconfigs"] {
            let config_dir = path.join(config_dir_name);
            if config_dir.exists() {
                for entry in WalkDir::new(&config_dir).into_iter().filter_map(|e| e.ok()) {
                    let file_path = entry.path();
                    if file_path.is_file() {
                        let relative = file_path.strip_prefix(path).unwrap_or(file_path);
                        if let Ok(content) = std::fs::read_to_string(file_path) {
                            let format = crate::shared::detect_config_format(&relative.to_string_lossy());
                            config_files.push(ConfigFile {
                                path: relative.to_path_buf(),
                                content,
                                format,
                            });
                        }
                    }
                }
            }
        }
        
        Ok(ImportResult {
            project,
            mods: Vec::new(),
            unresolved_mods,
            config_files,
            progression_graph: {
                let progression_path = path.join("progression.json");
                if progression_path.exists() {
                    let content = std::fs::read_to_string(&progression_path).ok();
                    content.and_then(|c| serde_json::from_str(&c).ok())
                } else {
                    None
                }
            },
            quest_graph: {
                let quest_path = path.join("quests.json");
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

fn detect_loader_from_files(path: &Path) -> ModLoader {
    let neoforge = path.join(".neoforge").exists();
    let forge = path.join(".forge").exists();
    let fabric = path.join(".fabric").exists();
    let quilt = path.join(".quilt").exists();
    
    if neoforge { ModLoader::NeoForge }
    else if forge { ModLoader::Forge }
    else if fabric { ModLoader::Fabric }
    else if quilt { ModLoader::Quilt }
    else { ModLoader::Fabric }
}

fn detect_mc_version_from_instance(path: &Path) -> Option<String> {
    let instance_json = path.join("instance.json");
    if instance_json.exists() {
        if let Ok(content) = std::fs::read_to_string(&instance_json) {
            if let Ok(v) = serde_json::from_str::<serde_json::Value>(&content) {
                return v.get("minecraftVersion").and_then(|v| v.as_str()).map(|s| s.to_string());
            }
        }
    }
    
    let mmc_meta = path.join("mmc-pack.json");
    if mmc_meta.exists() {
        if let Ok(content) = std::fs::read_to_string(&mmc_meta) {
            if let Ok(v) = serde_json::from_str::<serde_json::Value>(&content) {
                return v.get("minecraftVersion").and_then(|v| v.as_str()).map(|s| s.to_string());
            }
        }
    }
    
    let libraries = path.join("libraries");
    if libraries.exists() {
        if let Ok(entries) = std::fs::read_dir(&libraries) {
            for entry in entries.flatten() {
                let name = entry.file_name().to_string_lossy().to_string();
                if name.contains("net.minecraft") || name.contains("minecraft") {
                    return extract_mc_version_from_lib(&name);
                }
            }
        }
    }
    
    None
}

fn extract_mc_version_from_lib(name: &str) -> Option<String> {
    let parts: Vec<&str> = name.split('-').collect();
    for part in parts {
        if part.starts_with("1.") && part.contains('.') {
            let version_parts: Vec<&str> = part.split('.').collect();
            if version_parts.len() >= 3 {
                return Some(format!("{}.{}.{}", version_parts[0], version_parts[1], version_parts[2]));
            }
        }
    }
    None
}