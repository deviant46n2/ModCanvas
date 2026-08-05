use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::launcher::LauncherDriver;
use crate::models::{InstanceStatus, MinecraftInstance};

use super::companion::deploy_companion_mod_to_dir;
use super::prism::{
    generate_instance_cfg, generate_mmc_pack, parse_prism_instance_cfg, parse_prism_mmc_pack,
    sanitize_instance_name,
};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InstanceMetadata {
    pub id: String,
    pub name: String,
    pub mc_version: String,
    pub loader: String,
    pub loader_version: Option<String>,
}

pub struct InstanceManager {
    pub(super) instances: std::sync::Arc<Mutex<Vec<MinecraftInstance>>>,
    /// All instance roots to scan, in priority order. `base_dirs[0]` is the
    /// primary root where new instances are created.
    base_dirs: Vec<PathBuf>,
    pub(super) _driver: Arc<dyn LauncherDriver>,
}

impl InstanceManager {
    pub fn new(base_dirs: Vec<PathBuf>, driver: Arc<dyn LauncherDriver>) -> Self {
        eprintln!("[ModCanvas] InstanceManager::new() called with base_dirs: {:?}", base_dirs);
        let manager = Self {
            instances: std::sync::Arc::new(Mutex::new(Vec::new())),
            base_dirs,
            _driver: driver,
        };
        manager.load_instances();
        eprintln!("[ModCanvas] InstanceManager::new() completed, instances loaded: {}", manager.instances.lock().unwrap().len());
        manager
    }

    fn load_instances(&self) {
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

    fn save_instance_metadata(&self, instance: &MinecraftInstance) {
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

    /// Deploy the Workbench Companion mod to an instance's mods folder.
    pub(super) fn deploy_companion_mod(&self, game_dir: &PathBuf, loader: &str, mc_version: &str) -> Result<(), String> {
        deploy_companion_mod_to_dir(game_dir, loader, mc_version)
    }

    /// Find an instance by ID and deploy the companion mod to it.
    pub fn deploy_companion_mod_by_id(&self, instance_id: &str) -> Result<(), String> {
        let instances = self.instances.lock().unwrap();
        let instance = instances.iter().find(|i| i.id == instance_id)
            .ok_or_else(|| format!("Instance not found: {instance_id}"))?;
        let game_dir = PathBuf::from(&instance.game_dir);
        deploy_companion_mod_to_dir(&game_dir, &instance.loader, &instance.mc_version)
    }

    pub fn create_instance(
        &self,
        name: &str,
        mc_version: &str,
        loader: &str,
        loader_version: Option<&str>,
    ) -> Result<MinecraftInstance, String> {
        let id = Uuid::new_v4().to_string();

        // Use a sanitized version of the name as the folder name
        let folder_name = sanitize_instance_name(name);
        let primary_dir = self.base_dirs.first().cloned().unwrap_or_else(|| PathBuf::from("."));
        let mut instance_dir = primary_dir.join(&folder_name);

        // Handle name collisions by appending a number
        if instance_dir.exists() {
            for i in 2..1000 {
                let candidate = primary_dir.join(format!("{} ({})", folder_name, i));
                if !candidate.exists() {
                    instance_dir = candidate;
                    break;
                }
            }
        }

        // Create Prism-compatible instance structure
        let minecraft_dir = instance_dir.join("minecraft");
        std::fs::create_dir_all(&minecraft_dir).map_err(|e| e.to_string())?;
        std::fs::create_dir_all(instance_dir.join("patches")).map_err(|e| e.to_string())?;

        // Write instance.cfg (Prism's instance metadata format)
        let instance_cfg = generate_instance_cfg(name, mc_version, loader, loader_version);
        crate::path_safety::atomic_write_str(&instance_dir.join("instance.cfg"), &instance_cfg)
            .map_err(|e| format!("Failed to write instance.cfg: {e}"))?;

        // Write mmc-pack.json (required by Prism to know MC version + loader)
        let mmc_pack = generate_mmc_pack(mc_version, loader, loader_version);
        crate::path_safety::atomic_write_str(&instance_dir.join("mmc-pack.json"), &mmc_pack)
            .map_err(|e| format!("Failed to write mmc-pack.json: {e}"))?;

        // Write our own metadata for tracking
        let instance = MinecraftInstance {
            id,
            name: name.to_string(),
            mc_version: mc_version.to_string(),
            loader: loader.to_string(),
            loader_version: loader_version.map(|s| s.to_string()),
            game_dir: minecraft_dir.to_str().unwrap_or("").to_string(),
            status: InstanceStatus::Stopped,
        };

        self.instances.lock().unwrap().push(instance.clone());
        self.save_instance_metadata(&instance);
        
        // Deploy companion mod to the new instance
        if let Err(e) = self.deploy_companion_mod(&PathBuf::from(&instance.game_dir), loader, mc_version) {
            eprintln!("[ModCanvas] Warning: Failed to deploy companion mod to new instance: {e}");
        }
        
        Ok(instance)
    }

    pub fn list_instances(&self) -> Vec<MinecraftInstance> {
        self.instances.lock().unwrap().clone()
    }

    pub fn reload_instances(&self) -> Vec<MinecraftInstance> {
        self.load_instances();
        self.instances.lock().unwrap().clone()
    }

    pub fn base_dir(&self) -> &std::path::Path {
        self.base_dirs
            .first()
            .map(|p| p.as_path())
            .unwrap_or_else(|| std::path::Path::new("."))
    }

    /// All instance roots scanned by this manager (primary first).
    pub fn base_dirs(&self) -> &[PathBuf] {
        &self.base_dirs
    }

    pub fn remove_instance(&self, id: &str) -> Result<bool, String> {
        let mut instances = self.instances.lock().unwrap();
        if let Some(pos) = instances.iter().position(|i| i.id == id) {
            let instance = instances.remove(pos);
            let game_dir = PathBuf::from(&instance.game_dir);
            if game_dir.exists() {
                std::fs::remove_dir_all(&game_dir).map_err(|e| e.to_string())?;
            }
            Ok(true)
        } else {
            Ok(false)
        }
    }

    pub fn stop_instance(&self, id: &str) -> Result<bool, String> {
        let mut instances = self.instances.lock().unwrap();
        if let Some(inst) = instances.iter_mut().find(|i| i.id == id) {
            inst.status = InstanceStatus::Stopped;
            Ok(true)
        } else {
            Ok(false)
        }
    }

    pub fn get_logs(&self, id: &str) -> Result<String, String> {
        let instances = self.instances.lock().unwrap();
        let instance = instances.iter().find(|i| i.id == id)
            .ok_or_else(|| "Instance not found".to_string())?;

        let log_file = PathBuf::from(&instance.game_dir)
            .join("logs")
            .join("latest.log");

        if log_file.exists() {
            std::fs::read_to_string(&log_file).map_err(|e| e.to_string())
        } else {
            Ok("No logs yet. Launch the instance first.".to_string())
        }
    }
}
