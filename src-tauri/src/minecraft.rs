use std::sync::{Arc, Mutex};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use uuid::Uuid;

use crate::launcher::LauncherDriver;

/// Trait for emitting launch progress events, abstracting away Tauri's AppHandle.
/// The core layer uses this trait; the Tauri command layer provides the real implementation.
pub trait ProgressEmitter: Send + Sync {
    fn emit_progress(&self, progress: LaunchProgress);
}

/// No-op emitter for tests and contexts without a Tauri app handle.
pub struct NullProgressEmitter;

impl ProgressEmitter for NullProgressEmitter {
    fn emit_progress(&self, _progress: LaunchProgress) {}
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InstanceMetadata {
    pub id: String,
    pub name: String,
    pub mc_version: String,
    pub loader: String,
    pub loader_version: Option<String>,
}

/// Parse Prism's `instance.cfg` (INI-like) to extract the display name.
fn parse_prism_instance_cfg(path: &std::path::Path) -> Option<String> {
    let content = std::fs::read_to_string(path.join("instance.cfg")).ok()?;
    for line in content.lines() {
        let line = line.trim();
        if line.starts_with("name=") || line.starts_with("Name=") {
            let val = line.splitn(2, '=').nth(1)?.trim();
            // Strip surrounding quotes if present
            let val = val.trim_matches(|c| c == '"');
            return Some(val.to_string());
        }
    }
    None
}

/// Parse Prism's `mmc-pack.json` to extract MC version and loader info.
/// Returns (mc_version, loader_name, loader_version).
fn parse_prism_mmc_pack(path: &std::path::Path) -> (String, String, Option<String>) {
    let content = match std::fs::read_to_string(path.join("mmc-pack.json")) {
        Ok(c) => c,
        Err(_) => return ("Unknown".into(), "Unknown".into(), None),
    };

    let pack: serde_json::Value = match serde_json::from_str(&content) {
        Ok(v) => v,
        Err(_) => return ("Unknown".into(), "Unknown".into(), None),
    };

    let components = match pack.get("components").and_then(|c| c.as_array()) {
        Some(arr) => arr,
        None => return ("Unknown".into(), "Unknown".into(), None),
    };

    let mut mc_version = String::new();
    let mut loader_name = String::new();
    let mut loader_version = None;

    for comp in components {
        let uid = comp.get("uid").and_then(|u| u.as_str()).unwrap_or("");
        let version = comp.get("version").and_then(|v| v.as_str()).unwrap_or("");

        match uid {
            "net.minecraft" => {
                mc_version = version.to_string();
            }
            "net.neoforged" => {
                loader_name = "NeoForge".to_string();
                loader_version = Some(version.to_string());
            }
            "net.minecraftforge" => {
                loader_name = "Forge".to_string();
                loader_version = Some(version.to_string());
            }
            "net.fabricmc.fabric" => {
                loader_name = "Fabric".to_string();
                loader_version = Some(version.to_string());
            }
            "org.quiltmc.quilt-loader" => {
                loader_name = "Quilt".to_string();
                loader_version = Some(version.to_string());
            }
            _ => {}
        }
    }

    if mc_version.is_empty() {
        mc_version = "Unknown".into();
    }
    if loader_name.is_empty() {
        loader_name = "Unknown".into();
    }

    (mc_version, loader_name, loader_version)
}

/// Detect instance info from legacy directory markers (.forge/, .neoforge/, etc).
fn _detect_instance_info(path: &std::path::Path) -> (String, String, Option<String>) {
    // Check for NeoForge
    let neoforge_dir = path.join(".neoforge");
    if neoforge_dir.exists() {
        if let Ok(entries) = std::fs::read_dir(&neoforge_dir) {
            for entry in entries.flatten() {
                let file_name = entry.file_name().to_string_lossy().to_string();
                if file_name.starts_with("neoforge-") && file_name.ends_with("-installer.jar") {
                    let version = file_name
                        .strip_prefix("neoforge-")
                        .and_then(|s| s.strip_suffix("-installer.jar"))
                        .unwrap_or("Unknown");
                    return (_mc_version_from_neoforge(version).to_string(), "NeoForge".to_string(), Some(version.to_string()));
                }
            }
        }
    }

    // Check for Forge
    let forge_dir = path.join(".forge");
    if forge_dir.exists() {
        if let Ok(entries) = std::fs::read_dir(&forge_dir) {
            for entry in entries.flatten() {
                let file_name = entry.file_name().to_string_lossy().to_string();
                if file_name.starts_with("forge-") && file_name.ends_with("-installer.jar") {
                    let version = file_name
                        .strip_prefix("forge-")
                        .and_then(|s| s.strip_suffix("-installer.jar"))
                        .unwrap_or("Unknown");
                    return (_mc_version_from_forge(version).to_string(), "Forge".to_string(), Some(version.to_string()));
                }
            }
        }
    }

    // Check for Fabric
    let fabric_dir = path.join(".fabric");
    if fabric_dir.exists() {
        return ("Unknown".to_string(), "Fabric".to_string(), None);
    }

    // Check for Quilt
    let quilt_dir = path.join(".quilt");
    if quilt_dir.exists() {
        return ("Unknown".to_string(), "Quilt".to_string(), None);
    }

    ("Unknown".to_string(), "Unknown".to_string(), None)
}

fn _mc_version_from_neoforge(neoforge_version: &str) -> &str {
    if neoforge_version.starts_with("21.1.") {
        "1.21.1"
    } else if neoforge_version.starts_with("21.0.") {
        "1.21"
    } else if neoforge_version.starts_with("20.1.") {
        "1.20.1"
    } else if neoforge_version.starts_with("20.0.") {
        "1.20"
    } else if neoforge_version.starts_with("19.") {
        "1.19"
    } else {
        "Unknown"
    }
}

fn _mc_version_from_forge(forge_version: &str) -> &str {
    if let Some(mc_part) = forge_version.split('-').next() {
        mc_part
    } else {
        "Unknown"
    }
}

/// Sanitize an instance name to be safe for use as a directory name.
fn sanitize_instance_name(name: &str) -> String {
    let sanitized: String = name
        .chars()
        .map(|c| match c {
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '_',
            _ => c,
        })
        .collect();
    let trimmed = sanitized.trim().trim_matches('.');
    if trimmed.is_empty() {
        "Instance".to_string()
    } else {
        trimmed.to_string()
    }
}

/// Generate a Prism Launcher `instance.cfg` file content.
fn generate_instance_cfg(
    name: &str,
    mc_version: &str,
    loader: &str,
    loader_version: Option<&str>,
) -> String {
    let instance_type = match loader {
        "fabric" => "OneSix",
        "quilt" => "OneSix",
        "forge" => "OneSix",
        "neoforge" => "OneSix",
        _ => "OneSix",
    };

    let cfg = format!(
        r#"[General]
ConfigVersion=1.3
InstanceType={instance_type}
ManagedPack=false
Name={name}
"#,
        instance_type = instance_type,
        name = name,
    );

    // Prism stores the game version in the profile JSON, but instance.cfg
    // can reference it. For our purposes, the loader info goes into
    // patches/ which Prism reads on launch.
    let _ = (mc_version, loader, loader_version);

    cfg
}

fn generate_mmc_pack(
    mc_version: &str,
    loader: &str,
    loader_version: Option<&str>,
) -> String {
    let loader_uid = match loader.to_lowercase().as_str() {
        "fabric" => "net.fabricmc.fabric-loader",
        "quilt" => "org.quiltmc.quilt-loader",
        "forge" => "net.minecraftforge",
        "neoforge" => "net.neoforged",
        _ => "net.neoforged",
    };
    let loader_name = match loader.to_lowercase().as_str() {
        "fabric" => "Fabric",
        "quilt" => "Quilt",
        "forge" => "Forge",
        "neoforge" => "NeoForge",
        _ => "NeoForge",
    };
    let lv = loader_version.unwrap_or("0.0.0");

    format!(
        r#"{{
    "formatVersion": 1,
    "components": [
        {{
            "uid": "net.minecraft",
            "version": "{mc}",
            "important": true
        }},
        {{
            "uid": "{loader_uid}",
            "version": "{lv}",
            "cachedName": "{loader_name}",
            "cachedRequires": [
                {{ "equals": "{mc}", "uid": "net.minecraft" }}
            ]
        }}
    ]
}}"#,
        mc = mc_version,
        loader_uid = loader_uid,
        lv = lv,
        loader_name = loader_name,
    )
}

pub use crate::models::{MinecraftInstance, InstanceStatus};

pub struct InstanceManager {
    instances: std::sync::Arc<Mutex<Vec<MinecraftInstance>>>,
    /// All instance roots to scan, in priority order. `base_dirs[0]` is the
    /// primary root where new instances are created.
    base_dirs: Vec<PathBuf>,
    _driver: Arc<dyn LauncherDriver>,
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
    fn deploy_companion_mod(&self, game_dir: &PathBuf, loader: &str, mc_version: &str) -> Result<(), String> {
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

#[derive(Clone, Serialize)]
pub struct LaunchProgress {
    pub phase: String,
    pub message: String,
    pub bytes: Option<u64>,
    pub total: Option<u64>,
}

/// Deploy the Workbench Companion mod to a game directory.
/// Standalone function callable from anywhere (not tied to InstanceManager).
pub fn deploy_companion_mod_to_dir(game_dir: &PathBuf, loader: &str, _mc_version: &str) -> Result<(), String> {
    let mods_dir = game_dir.join("mods");
    std::fs::create_dir_all(&mods_dir).map_err(|e| e.to_string())?;

    let loader_lower = loader.to_lowercase();
    let companion_dirs: &[&str] = match loader_lower.as_str() {
        "neoforge" => &[
            "workbench-companion-neoforge-1.21",
            "workbench-companion-neoforge",
        ],
        "forge" => &["workbench-companion-forge"],
        "fabric" | "quilt" => &["workbench-companion"],
        other => return Err(format!("Unknown loader for companion mod: {other}")),
    };

    let project_root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../");
    let fallback_root = PathBuf::from("/home/deviant/Projects/ModCanvas");

    for dir in companion_dirs {
        for root in [&project_root, &fallback_root] {
            let candidate = root.join(dir).join("build/libs/workbench-companion-1.0.0.jar");
            if candidate.exists() {
                let dest_jar = mods_dir.join("workbench-companion-1.0.0.jar");
                std::fs::copy(&candidate, &dest_jar)
                    .map_err(|e| format!("Failed to copy companion mod: {e}"))?;
                eprintln!("[ModCanvas] Deployed companion mod ({}) from {:?}", loader_lower, candidate);
                return Ok(());
            }
        }
    }

    Err(format!(
        "Companion mod JAR for {loader} not found. Build one of: {}. Build it first.",
        companion_dirs.join(", ")
    ))
}

impl InstanceManager {
    pub fn launch_instance(
        &self,
        emitter: Box<dyn ProgressEmitter>,
        id: &str,
_username: &str,
        min_mem: &str,
        max_mem: &str,
    ) -> Result<(), String> {
        let instances = self.instances.lock().unwrap();
        let instance = instances.iter().find(|i| i.id == id)
            .ok_or_else(|| "Instance not found".to_string())?;

        let game_dir = PathBuf::from(&instance.game_dir);

        // Deploy companion mod to instance
        if let Err(e) = self.deploy_companion_mod(&game_dir, &instance.loader, &instance.mc_version) {
            eprintln!("[ModCanvas] Warning: Failed to deploy companion mod: {e}");
        }

        // Resolve the Prism-compatible folder name:
        // If game_dir ends with "minecraft", it's a Prism instance — parent is the folder name.
        // Otherwise (standalone), the last component of game_dir is the folder name.
        let prism_folder_name = if game_dir.file_name().and_then(|n| n.to_str()) == Some("minecraft") {
            game_dir
                .parent()
                .and_then(|p| p.file_name())
                .and_then(|n| n.to_str())
                .unwrap_or(&instance.name)
                .to_string()
        } else {
            game_dir
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or(&instance.name)
                .to_string()
        };

        let id_owned = id.to_string();
        drop(instances);

        let min_mem = min_mem.to_string();
        let max_mem = max_mem.to_string();

        {
            let mut instances = self.instances.lock().unwrap();
            if let Some(inst) = instances.iter_mut().find(|i| i.id == id_owned) {
                inst.status = InstanceStatus::Installing;
            }
        }

        // Clone the Arc for the spawned task so it can update instance status
        let instances_arc = self.instances.clone();

        let driver = self._driver.clone();
        tokio::spawn(async move {
            let result = do_launch(
                &*emitter,
                driver.as_ref(),
                &prism_folder_name,
                &min_mem,
                &max_mem,
            )
            .await;

            let success = result.is_ok();
            match &result {
                Ok(_) => eprintln!("[ModCanvas] Launch finished for {}", id_owned),
                Err(e) => eprintln!("[ModCanvas] Launch failed for {}: {e}", id_owned),
            }

            // Update status via the shared instances list
            if let Ok(mut insts) = instances_arc.lock() {
                if let Some(inst) = insts.iter_mut().find(|i| i.id == id_owned) {
                    if success {
                        inst.status = InstanceStatus::Stopped;
                    } else {
                        inst.status = InstanceStatus::Crashed;
                    }
                }
            }
        });

        Ok(())
    }
}

async fn do_launch(
    emitter: &dyn ProgressEmitter,
    driver: &dyn LauncherDriver,
    prism_folder_name: &str,
    min_mem: &str,
    max_mem: &str,
) -> Result<(), String> {
    eprintln!(
        "[ModCanvas] Launching '{}' via Prism Launcher",
        prism_folder_name
    );
    eprintln!("[ModCanvas] Memory: min={}, max={}", min_mem, max_mem);

    // Emit: preparing
    emitter.emit_progress(LaunchProgress {
        phase: "preparing".into(),
        message: format!("Preparing to launch '{}'...", prism_folder_name),
        bytes: None,
        total: None,
    });

    // Emit: spawning
    emitter.emit_progress(LaunchProgress {
        phase: "launching".into(),
        message: format!("Launching '{}' via Prism...", prism_folder_name),
        bytes: None,
        total: None,
    });

    // Spawn the Prism Launcher process — no working_dir needed,
    // Prism finds the instance by name in its instances directory
    let mut child = driver.spawn_launch(prism_folder_name, None)?;
    let pid = child.id().unwrap_or(0);

    eprintln!("[ModCanvas] Prism Launcher spawned with PID {}", pid);

    emitter.emit_progress(LaunchProgress {
        phase: "running".into(),
        message: format!("Game running (PID {})", pid),
        bytes: None,
        total: None,
    });

    // Wait for the child process to exit (non-blocking)
    let exit_status = child.wait().await.map_err(|e| format!("Process error: {e}"))?;

    let msg = match exit_status.code() {
        Some(code) => format!("Game exited (code {})", code),
        None => "Game exited".into(),
    };
    eprintln!("[ModCanvas] {}", msg);

    emitter.emit_progress(LaunchProgress {
        phase: "done".into(),
        message: msg,
        bytes: None,
        total: None,
    });

    Ok(())
}

pub async fn resolve_loader_version(
    loader: &str,
    mc_version: &str,
    requested_version: Option<&str>,
) -> Result<String, String> {
    if let Some(v) = requested_version {
        if !v.is_empty() && v != "latest" {
            return Ok(v.to_string());
        }
    }

    let parts: Vec<&str> = mc_version.split('.').collect();

    match loader {
        "fabric" => {
            let url = format!(
                "https://meta.fabricmc.net/v2/versions/loader/{}",
                mc_version
            );
            let resp = reqwest::get(&url)
                .await
                .map_err(|e| format!("Failed to fetch Fabric versions: {e}"))?;
            let versions: Vec<serde_json::Value> = resp
                .json()
                .await
                .map_err(|e| format!("Failed to parse Fabric versions: {e}"))?;
            versions
                .first()
                .and_then(|v| v.get("loader"))
                .and_then(|l| l.get("version"))
                .and_then(|v| v.as_str())
                .map(|s| s.to_string())
                .ok_or_else(|| "No Fabric loader versions found".to_string())
        }
        "quilt" => {
            let url = format!(
                "https://meta.quiltmc.org/v3/versions/loader/{}",
                mc_version
            );
            let resp = reqwest::get(&url)
                .await
                .map_err(|e| format!("Failed to fetch Quilt versions: {e}"))?;
            let versions: Vec<serde_json::Value> = resp
                .json()
                .await
                .map_err(|e| format!("Failed to parse Quilt versions: {e}"))?;
            versions
                .first()
                .and_then(|v| v.get("loader"))
                .and_then(|l| l.get("version"))
                .and_then(|v| v.as_str())
                .map(|s| s.to_string())
                .ok_or_else(|| "No Quilt loader versions found".to_string())
        }
        "neoforge" => {
            let prefix = format!("{}.{}", parts[1], parts[2]);
            let prefix_with_dot = format!("{}.", prefix);

            let url = "https://maven.neoforged.net/releases/net/neoforged/neoforge/maven-metadata.xml";
            let resp = reqwest::get(url)
                .await
                .map_err(|e| format!("Failed to fetch NeoForge metadata: {e}"))?;
            let text = resp
                .text()
                .await
                .map_err(|e| format!("Failed to read NeoForge metadata: {e}"))?;

            let mut candidates: Vec<String> = Vec::new();
            for line in text.lines() {
                let trimmed = line.trim();
                if let Some(v) = trimmed
                    .strip_prefix("<version>")
                    .and_then(|s| s.strip_suffix("</version>"))
                {
                    if v.starts_with(&prefix_with_dot) && !v.contains("beta") && !v.contains("alpha") {
                        candidates.push(v.to_string());
                    }
                }
            }

            candidates.sort();
            candidates
                .into_iter()
                .next_back()
                .ok_or_else(|| format!("No NeoForge versions found for MC {mc_version} (prefix: {prefix})"))
        }
        "forge" => {
            let url = "https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json";
            let resp = reqwest::get(url)
                .await
                .map_err(|e| format!("Failed to fetch Forge promotions: {e}"))?;
            let data: serde_json::Value = resp
                .json()
                .await
                .map_err(|e| format!("Failed to parse Forge promotions: {e}"))?;

            let mc_promos = data.get("promos")
                .and_then(|p| p.as_object())
                .ok_or_else(|| "No Forge promos found".to_string())?;

            let key = format!("{mc_version}-latest");
            mc_promos
                .get(&key)
                .and_then(|v| v.as_str())
                .map(|s| s.to_string())
                .ok_or_else(|| format!("No Forge latest version for {mc_version}"))
        }
        _ => Ok("".to_string()),
    }
}

/// KubeJS script directory structure
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct KubeJSScriptDir {
    pub path: PathBuf,
    pub script_type: String, // "startup", "server", "client", "legacy"
    pub scripts: Vec<KubeJSScript>,
}

/// Individual KubeJS script file
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct KubeJSScript {
    pub name: String,
    pub path: PathBuf,
    pub content: String,
    pub size: u64,
}

/// Detect KubeJS script directories in an instance
pub fn detect_kubejs_scripts(game_dir: &PathBuf) -> Vec<KubeJSScriptDir> {
    let mut script_dirs = Vec::new();
    let kubejs_root = game_dir.join("kubejs");
    
    if !kubejs_root.exists() {
        return script_dirs;
    }
    
    // KubeJS script directories and their types
    let script_types = [
        ("startup_scripts", "startup"),
        ("server_scripts", "server"),
        ("client_scripts", "client"),
        ("scripts", "legacy"), // Old KubeJS 5.x style
    ];
    
    for (dir_name, script_type) in script_types {
        let script_dir = kubejs_root.join(dir_name);
        if script_dir.exists() && script_dir.is_dir() {
            let mut scripts = Vec::new();
            
            // Recursively find all .js files
            for entry in walkdir::WalkDir::new(&script_dir).into_iter().filter_map(|e| e.ok()) {
                let path = entry.path();
                if path.extension().map_or(false, |ext| ext == "js") {
                    if let Ok(content) = std::fs::read_to_string(path) {
                        let name = path.strip_prefix(&script_dir).unwrap_or(path).to_string_lossy().to_string();
                        scripts.push(KubeJSScript {
                            name,
                            path: path.to_path_buf(),
                            content,
                            size: entry.metadata().map(|m| m.len()).unwrap_or(0),
                        });
                    }
                }
            }
            
            if !scripts.is_empty() {
                script_dirs.push(KubeJSScriptDir {
                    path: script_dir,
                    script_type: script_type.to_string(),
                    scripts,
                });
            }
        }
    }
    
    script_dirs
}

/// Get all KubeJS scripts across all script directories
pub fn get_all_kubejs_scripts(game_dir: &PathBuf) -> Vec<KubeJSScript> {
    detect_kubejs_scripts(game_dir)
        .into_iter()
        .flat_map(|dir| dir.scripts)
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn write_prism_instance(root: &std::path::Path, name: &str, mc: &str, loader: &str) {
        let dir = root.join(name);
        std::fs::create_dir_all(dir.join("minecraft")).unwrap();
        std::fs::write(
            dir.join("instance.cfg"),
            format!("InstanceType=OneSix\nname={name}\n"),
        )
        .unwrap();
        std::fs::write(
            dir.join("mmc-pack.json"),
            format!(
                r#"{{"components":[
                    {{"uid":"net.minecraft","version":"{mc}"}},
                    {{"uid":"{loader}","version":"9.9.9"}}
                ]}}"#
            ),
        )
        .unwrap();
    }

    /// Instances spread across several roots (native + Flatpak Prism) must
    /// all be discovered and merged, not just the ones in one root.
    #[test]
    fn scans_all_instance_roots() {
        let temp = std::env::temp_dir().join(format!("modcanvas_inst_{}", Uuid::new_v4()));
        let root_a = temp.join("a");
        let root_b = temp.join("b");
        std::fs::create_dir_all(&root_a).unwrap();
        std::fs::create_dir_all(&root_b).unwrap();

        write_prism_instance(&root_a, "Pack A", "1.20.1", "net.minecraftforge");
        write_prism_instance(&root_a, "Pack B", "1.21.1", "net.fabricmc.fabric");
        write_prism_instance(&root_b, "Pack C", "26.2", "net.fabricmc.fabric-loader");

        let driver: Arc<dyn LauncherDriver> = Arc::new(crate::launcher::PrismLauncherDriver::new());
        let manager = InstanceManager::new(vec![root_a, root_b], driver);

        let mut names: Vec<String> = manager
            .list_instances()
            .into_iter()
            .map(|i| i.name)
            .collect();
        names.sort();
        assert_eq!(names, vec!["Pack A", "Pack B", "Pack C"]);

        let _ = std::fs::remove_dir_all(&temp);
    }

    /// The primary (first) root is used when creating new instances.
    #[test]
    fn create_instance_uses_primary_root() {
        let temp = std::env::temp_dir().join(format!("modcanvas_inst_{}", Uuid::new_v4()));
        let root_a = temp.join("a");
        let root_b = temp.join("b");
        std::fs::create_dir_all(&root_a).unwrap();
        std::fs::create_dir_all(&root_b).unwrap();

        let driver: Arc<dyn LauncherDriver> = Arc::new(crate::launcher::PrismLauncherDriver::new());
        let manager = InstanceManager::new(vec![root_a.clone(), root_b.clone()], driver);

        manager
            .create_instance("My New Pack", "1.20.1", "Forge", Some("47.0.0"))
            .unwrap();

        assert!(root_a.join("My New Pack").exists(), "instance created under primary root");
        assert!(!root_b.join("My New Pack").exists(), "instance NOT created under secondary root");

        let _ = std::fs::remove_dir_all(&temp);
    }
}
