//! Packwiz workspace loading and query helpers (the `PackwizWorkspace` impl
//! plus the free `parse_packwiz_workspace` entry point).

use super::types::{PackwizIndexEntry, PackwizModMeta, PackwizModUiInfo, PackwizPack, PackwizWorkspace};
use anyhow::Result;
use std::collections::HashMap;
use std::path::{Path, PathBuf};

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

/// Parse a Packwiz workspace and return structured data for the UI
pub fn parse_packwiz_workspace(path: &str) -> Result<PackwizWorkspace> {
    PackwizWorkspace::load(Path::new(path))
}
