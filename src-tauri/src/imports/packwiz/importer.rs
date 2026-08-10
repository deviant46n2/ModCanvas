//! The `PackwizImporter`, converting a packwiz workspace into the shared
//! `ImportResult` consumed by the import pipeline.

use crate::imports::{ConfigFile, ImportResult, ResolvedMod, UnresolvedMod};
use crate::models::{ModLoader, PackFormat, Project};
use super::types::{PackwizWorkspace};
use anyhow::Result;
use std::path::Path;
use uuid::Uuid;

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
