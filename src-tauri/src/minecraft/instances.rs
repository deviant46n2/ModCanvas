use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::launcher::LauncherDriver;
use crate::models::{InstanceStatus, MinecraftInstance};

use super::companion::deploy_companion_mod_to_dir;
use super::liveness::InstanceLiveness;
use super::prism::{generate_instance_cfg, generate_mmc_pack, sanitize_instance_name};

/// Instance scanning and metadata persistence (the `load_instances` /
/// `save_instance_metadata` halves of the manager).
mod scan;

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
    /// Real game-process liveness, used to derive truthful Running status at
    /// read time. The launch flow's stored status tracks the Prism wrapper,
    /// which can exit while the game keeps running — deriving from the
    /// process table fixes every consumer (pill, restart pre-check) at once.
    /// `pub(super)`: the sibling `launch` module reads it for the Prism-
    /// refusal check (s44); nothing outside `minecraft` touches it.
    pub(super) liveness: Arc<dyn InstanceLiveness>,
}

impl InstanceManager {
    pub fn new(
        base_dirs: Vec<PathBuf>,
        driver: Arc<dyn LauncherDriver>,
        liveness: Arc<dyn InstanceLiveness>,
    ) -> Self {
        eprintln!("[ModCanvas] InstanceManager::new() called with base_dirs: {:?}", base_dirs);
        let manager = Self {
            instances: std::sync::Arc::new(Mutex::new(Vec::new())),
            base_dirs,
            _driver: driver,
            liveness,
        };
        manager.load_instances();
        eprintln!("[ModCanvas] InstanceManager::new() completed, instances loaded: {}", manager.instances.lock().unwrap().len());
        manager
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
        let mut instances = self.instances.lock().unwrap().clone();
        // Derive truthful Running status from the process table at read time.
        // The launch flow stores wrapper-lifecycle status (Running at spawn,
        // Stopped at exit), but the wrapper can exit while the game keeps
        // running — the stored field then lies. The process table is the
        // truth: a live process whose cmdline contains this game_dir IS the
        // instance running. Every consumer (connection pill, restart
        // pre-check) reads through here, so fixing the source fixes all of
        // them at once — one fact, one source.
        for inst in instances.iter_mut() {
            if inst.status == InstanceStatus::Installing || inst.status == InstanceStatus::Crashed {
                continue; // transient/terminal states owned by the launch flow
            }
            // The game process's cmdline carries the instance ROOT (via
            // -Djava.library.path=.../natives), never the /minecraft subdir
            // that game_dir points at. Measured on a live game 2026-08-08:
            // the only instance-specific marker is the root path. Strip the
            // minecraft suffix so the scan matches what the process shows.
            // Separator-agnostic (s65): strip_suffix("/minecraft") never
            // matches a Windows "\minecraft" — the query would look for the
            // unstripped game_dir and liveness would always say Stopped.
            let root = {
                let game = std::path::Path::new(&inst.game_dir);
                match game.file_name().and_then(|n| n.to_str()) {
                    Some("minecraft") => game
                        .parent()
                        .map(|p| p.to_string_lossy().into_owned())
                        .unwrap_or_else(|| inst.game_dir.clone()),
                    _ => inst.game_dir.clone(),
                }
            };
            if self.liveness.is_running(&root) {
                inst.status = InstanceStatus::Running;
            } else if inst.status == InstanceStatus::Running {
                inst.status = InstanceStatus::Stopped;
            }
        }
        instances
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

    /// Byte length of `logs/latest.log` — the position pin for hotswap reload
    /// evidence. FTB's "Loading quests from" line fires on EVERY world load,
    /// so an unpinned whole-log grep false-passes (s42 probe); the pin makes
    /// the check "line landed AFTER I sent", not "line exists somewhere".
    pub fn log_pin(&self, id: &str) -> Result<u64, String> {
        let instances = self.instances.lock().unwrap();
        let instance = instances.iter().find(|i| i.id == id)
            .ok_or_else(|| "Instance not found".to_string())?;
        let log_file = PathBuf::from(&instance.game_dir).join("logs").join("latest.log");
        match std::fs::metadata(&log_file) {
            Ok(m) => Ok(m.len()),
            Err(_) => Ok(0),
        }
    }

    /// Read the log tail from a pinned offset. `rotated=true` when the file
    /// shrank or vanished since the pin (midnight rotation/truncation) — the
    /// check is then inconclusive and must be retried, never claimed as FAIL
    /// or PASS.
    pub fn read_log_since(&self, id: &str, offset: u64) -> Result<(String, bool), String> {
        let instances = self.instances.lock().unwrap();
        let instance = instances.iter().find(|i| i.id == id)
            .ok_or_else(|| "Instance not found".to_string())?;
        let log_file = PathBuf::from(&instance.game_dir).join("logs").join("latest.log");

        if !log_file.exists() {
            return Ok((String::new(), false));
        }
        let len = std::fs::metadata(&log_file).map_err(|e| e.to_string())?.len();
        if len < offset {
            return Ok((String::new(), true));
        }

        use std::io::{Read, Seek, SeekFrom};
        let mut f = std::fs::File::open(&log_file).map_err(|e| e.to_string())?;
        f.seek(SeekFrom::Start(offset)).map_err(|e| e.to_string())?;
        let mut tail = String::new();
        f.read_to_string(&mut tail).map_err(|e| e.to_string())?;
        Ok((tail, false))
    }
}
