//! Instance discovery and persistence: scan the manager's base dirs for Prism
//! instances and write per-instance `instance.json` metadata. Split out of
//! `instances.rs` so the lifecycle methods stay under the line limit.

use std::path::PathBuf;

use uuid::Uuid;

use crate::models::{InstanceStatus, MinecraftInstance};

use crate::minecraft::prism::{parse_prism_instance_cfg, parse_prism_mmc_pack};
use super::{InstanceManager, InstanceMetadata};

impl InstanceManager {
    pub(super) fn load_instances(&self) {
        let mut instances = self.instances.lock().unwrap();
        instances.clear();

        for base_dir in &self.base_dirs {
            eprintln!("[ModCanvas] load_instances() reading dir: {:?}", base_dir);
            if let Ok(entries) = std::fs::read_dir(base_dir) {
                let entries: Vec<_> = entries.flatten().collect();
                eprintln!("[ModCanvas] load_instances() found {} entries", entries.len());
                for entry in entries {
                    let path = entry.path();
                    if !path.is_dir() {
                        continue;
                    }
                    if let Some(dir_name) = path.file_name().and_then(|n| n.to_str()) {
                        // Skip Prism internal directories
                        if dir_name.starts_with('.') || dir_name == "instgroups.json" {
                            continue;
                        }

                        // Prism instances have a minecraft/ subdirectory
                        let minecraft_dir = path.join("minecraft");
                        let game_dir = if minecraft_dir.exists() {
                            minecraft_dir.to_str().unwrap_or(path.to_str().unwrap_or("")).to_string()
                        } else {
                            path.to_str().unwrap_or("").to_string()
                        };

                        // Try to parse our own instance.json first
                        let metadata_path = path.join("instance.json");
                        let instance = if metadata_path.exists() {
                            if let Ok(content) = std::fs::read_to_string(&metadata_path) {
                                if let Ok(meta) = serde_json::from_str::<InstanceMetadata>(&content) {
                                    MinecraftInstance {
                                        id: meta.id,
                                        name: meta.name,
                                        mc_version: meta.mc_version,
                                        loader: meta.loader,
                                        loader_version: meta.loader_version,
                                        game_dir: game_dir.clone(),
                                        status: InstanceStatus::Stopped,
                                    }
                                } else {
                                    MinecraftInstance {
                                        id: Uuid::new_v4().to_string(),
                                        name: dir_name.to_string(),
                                        mc_version: "Unknown".to_string(),
                                        loader: "Unknown".to_string(),
                                        loader_version: None,
                                        game_dir: game_dir.clone(),
                                        status: InstanceStatus::Stopped,
                                    }
                                }
                            } else {
                                MinecraftInstance {
                                    id: Uuid::new_v4().to_string(),
                                    name: dir_name.to_string(),
                                    mc_version: "Unknown".to_string(),
                                    loader: "Unknown".to_string(),
                                    loader_version: None,
                                    game_dir: game_dir.clone(),
                                    status: InstanceStatus::Stopped,
                                }
                            }
                        } else {
                            // Native Prism instance — read from instance.cfg + mmc-pack.json
                            let display_name = parse_prism_instance_cfg(&path)
                                .unwrap_or_else(|| dir_name.to_string());
                            let (mc_version, loader, loader_version) = parse_prism_mmc_pack(&path);
                            MinecraftInstance {
                                id: Uuid::new_v4().to_string(),
                                name: display_name,
                                mc_version,
                                loader,
                                loader_version,
                                game_dir: game_dir.clone(),
                                status: InstanceStatus::Stopped,
                            }
                        };
                        instances.push(instance);
                        eprintln!("[ModCanvas] Loaded instance: {}", dir_name);
                    }
                }
            } else {
                eprintln!("[ModCanvas] load_instances() failed to read directory");
            }
        }
    }

    pub(super) fn save_instance_metadata(&self, instance: &MinecraftInstance) {
        let meta = InstanceMetadata {
            id: instance.id.clone(),
            name: instance.name.clone(),
            mc_version: instance.mc_version.clone(),
            loader: instance.loader.clone(),
            loader_version: instance.loader_version.clone(),
        };

        let game_dir = PathBuf::from(&instance.game_dir);
        let metadata_path = game_dir.join("instance.json");

        if let Ok(content) = serde_json::to_string_pretty(&meta) {
            let _ = crate::path_safety::atomic_write_str(&metadata_path, &content);
        }
    }
}
