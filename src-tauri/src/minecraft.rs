use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::AppHandle;
use tauri::Emitter;
use tauri::Manager;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MinecraftInstance {
    pub id: String,
    pub name: String,
    pub mc_version: String,
    pub loader: String,
    pub loader_version: Option<String>,
    pub game_dir: String,
    pub status: InstanceStatus,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum InstanceStatus {
    Stopped,
    Installing,
    Running,
    Crashed,
    Unknown,
}

pub struct InstanceManager {
    instances: Mutex<Vec<MinecraftInstance>>,
    base_dir: PathBuf,
}

impl InstanceManager {
    pub fn new(base_dir: PathBuf) -> Self {
        Self {
            instances: Mutex::new(Vec::new()),
            base_dir,
        }
    }

    pub fn create_instance(
        &self,
        name: &str,
        mc_version: &str,
        loader: &str,
        loader_version: Option<&str>,
    ) -> Result<MinecraftInstance, String> {
        let id = Uuid::new_v4().to_string();
        let game_dir = self.base_dir.join(&id);

        std::fs::create_dir_all(&game_dir).map_err(|e| e.to_string())?;

        let instance = MinecraftInstance {
            id,
            name: name.to_string(),
            mc_version: mc_version.to_string(),
            loader: loader.to_string(),
            loader_version: loader_version.map(|s| s.to_string()),
            game_dir: game_dir.to_str().unwrap_or("").to_string(),
            status: InstanceStatus::Stopped,
        };

        self.instances.lock().unwrap().push(instance.clone());
        Ok(instance)
    }

    pub fn list_instances(&self) -> Vec<MinecraftInstance> {
        self.instances.lock().unwrap().clone()
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

impl InstanceManager {
    pub fn launch_instance(
        &self,
        app: AppHandle,
        id: &str,
        username: &str,
        min_mem: &str,
        max_mem: &str,
    ) -> Result<(), String> {
        let instances = self.instances.lock().unwrap();
        let instance = instances.iter().find(|i| i.id == id)
            .ok_or_else(|| "Instance not found".to_string())?;

        let mc_version = instance.mc_version.clone();
        let loader = instance.loader.clone();
        let loader_version = instance.loader_version.clone();
        let id_owned = id.to_string();
        let name = instance.name.clone();
        drop(instances);

        let app_handle = app.clone();
        let username = username.to_string();
        let min_mem = min_mem.to_string();
        let max_mem = max_mem.to_string();

        {
            let mut instances = self.instances.lock().unwrap();
            if let Some(inst) = instances.iter_mut().find(|i| i.id == id_owned) {
                inst.status = InstanceStatus::Installing;
            }
        }

        tokio::spawn(async move {
            let result = do_launch(
                &app_handle,
                &name,
                &mc_version,
                &loader,
                loader_version.as_deref(),
                &username,
                &min_mem,
                &max_mem,
            )
            .await;

            let state = app_handle.state::<InstanceManager>();
            let mut instances = state.instances.lock().unwrap();
            if let Some(inst) = instances.iter_mut().find(|i| i.id == id_owned) {
                match result {
                    Ok(_) => {
                        eprintln!("[ModpackEngine] Launch finished for {}", id_owned);
                        inst.status = InstanceStatus::Stopped;
                    }
                    Err(e) => {
                        eprintln!("[ModpackEngine] Launch failed for {}: {e}", id_owned);
                        inst.status = InstanceStatus::Crashed;
                    }
                }
            }
        });

        Ok(())
    }
}

fn ensure_lighty_init() -> Result<(), String> {
    use std::sync::atomic::{AtomicBool, Ordering};
    static INIT: AtomicBool = AtomicBool::new(false);

    if INIT.load(Ordering::SeqCst) {
        return Ok(());
    }

    let result = std::panic::catch_unwind(|| lighty_launcher::core::AppState::init("ModpackEngine"));

    match result {
        Ok(Ok(_)) => {
            INIT.store(true, Ordering::SeqCst);
            eprintln!("[ModpackEngine] lighty-launcher initialized");
            ensure_system_java_symlinked();
            Ok(())
        }
        Ok(Err(e)) => Err(format!("lighty-launcher init error: {e}")),
        Err(_) => Err("lighty-launcher init panicked".to_string()),
    }
}

fn ensure_system_java_symlinked() {
    use lighty_launcher::core::AppState;

    let jre_base = AppState::config_dir().join("jre");

    let java_versions: &[(u8, &str)] = &[
        (17, "/usr/lib/jvm/java-17-openjdk"),
        (21, "/usr/lib/jvm/java-21-openjdk"),
    ];

    if let Err(e) = std::fs::create_dir_all(&jre_base) {
        eprintln!("[ModpackEngine] Failed to create JRE base dir: {e}");
        return;
    }

    for (version, java_home) in java_versions {
        let java_path = std::path::Path::new(java_home);
        if !java_path.exists() {
            continue;
        }

        let target_dir = jre_base.join(format!("Temurin_{version}"));
        if target_dir.exists() {
            continue;
        }

        match std::os::unix::fs::symlink(java_path, &target_dir) {
            Ok(_) => eprintln!("[ModpackEngine] Symlinked system Java {version} for lighty"),
            Err(e) => eprintln!("[ModpackEngine] Failed to symlink Java {version}: {e}"),
        }
    }
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
            if v.starts_with(&prefix) && !v.contains("beta") && !v.contains("alpha") {
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

async fn do_launch(
    app: &AppHandle,
    name: &str,
    mc_version: &str,
    loader: &str,
    loader_version: Option<&str>,
    username: &str,
    min_mem: &str,
    max_mem: &str,
) -> Result<(), String> {
    ensure_lighty_init()?;

    use lighty_launcher::auth::Authenticator;
    use lighty_launcher::auth::OfflineAuth;
    use lighty_launcher::event::EventBus;
    use lighty_launcher::java::JavaDistribution;
    use lighty_launcher::launch::Launch;
    use lighty_launcher::loaders::Loader;
    use lighty_launcher::version::VersionBuilder;

    let loader_enum = match loader {
        "fabric" => Loader::Fabric,
        "quilt" => Loader::Quilt,
        "forge" => Loader::Forge,
        "neoforge" => Loader::NeoForge,
        _ => Loader::Vanilla,
    };

    let resolved_version = resolve_loader_version(loader, mc_version, loader_version).await?;
    eprintln!(
        "[ModpackEngine] Launching {} with {} {} (MC {})",
        name, loader, resolved_version, mc_version
    );

    let mut version = VersionBuilder::new(name, loader_enum, &resolved_version, mc_version);

    let event_bus = EventBus::new(1000);
    let mut receiver = event_bus.subscribe();

    let mut auth = OfflineAuth::new(username);
    eprintln!("[ModpackEngine] Authenticating...");
    let profile = auth
        .authenticate(Some(&event_bus))
        .await
        .map_err(|e| format!("Auth failed: {e}"))?;
    eprintln!("[ModpackEngine] Auth OK, starting event forwarder...");

    let app_clone = app.clone();
    tokio::spawn(async move {
        use lighty_launcher::event::Event;
        eprintln!("[ModpackEngine] Event forwarder task started");
        loop {
            match receiver.next().await {
                Ok(event) => {
                    eprintln!("[ModpackEngine] Event: {:?}", std::mem::discriminant(&event));
                    let progress = match &event {
                        Event::Java(lighty_launcher::event::JavaEvent::JavaNotFound {
                            distribution,
                            version,
                        }) => Some(LaunchProgress {
                            phase: "java_download".into(),
                            message: format!("Downloading Java {version} ({distribution})..."),
                            bytes: None,
                            total: None,
                        }),
                        Event::Java(lighty_launcher::event::JavaEvent::JavaAlreadyInstalled {
                            binary_path,
                            ..
                        }) => Some(LaunchProgress {
                            phase: "java_ready".into(),
                            message: format!("Java found: {binary_path}"),
                            bytes: None,
                            total: None,
                        }),
                        Event::Java(lighty_launcher::event::JavaEvent::JavaDownloadStarted {
                            total_bytes,
                            ..
                        }) => Some(LaunchProgress {
                            phase: "java_download".into(),
                            message: "Downloading Java...".into(),
                            bytes: Some(0),
                            total: Some(*total_bytes),
                        }),
                        Event::Java(lighty_launcher::event::JavaEvent::JavaDownloadProgress {
                            bytes,
                        }) => Some(LaunchProgress {
                            phase: "java_download".into(),
                            message: "Downloading Java...".into(),
                            bytes: Some(*bytes),
                            total: None,
                        }),
                        Event::Java(
                            lighty_launcher::event::JavaEvent::JavaDownloadCompleted { .. },
                        ) => Some(LaunchProgress {
                            phase: "java_extract".into(),
                            message: "Extracting Java...".into(),
                            bytes: None,
                            total: None,
                        }),
                        Event::Java(
                            lighty_launcher::event::JavaEvent::JavaExtractionCompleted {
                                binary_path,
                                ..
                            },
                        ) => Some(LaunchProgress {
                            phase: "java_ready".into(),
                            message: format!("Java ready: {binary_path}"),
                            bytes: None,
                            total: None,
                        }),
                        Event::Launch(lighty_launcher::event::LaunchEvent::InstallStarted {
                            version,
                            total_bytes,
                        }) => Some(LaunchProgress {
                            phase: "game_install".into(),
                            message: format!("Downloading Minecraft {version}..."),
                            bytes: Some(0),
                            total: Some(*total_bytes),
                        }),
                        Event::Launch(lighty_launcher::event::LaunchEvent::InstallProgress {
                            bytes,
                        }) => Some(LaunchProgress {
                            phase: "game_install".into(),
                            message: "Downloading Minecraft...".into(),
                            bytes: Some(*bytes),
                            total: None,
                        }),
                        Event::Launch(lighty_launcher::event::LaunchEvent::InstallCompleted {
                            version,
                            ..
                        }) => Some(LaunchProgress {
                            phase: "game_ready".into(),
                            message: format!("Minecraft {version} ready"),
                            bytes: None,
                            total: None,
                        }),
                        Event::Launch(lighty_launcher::event::LaunchEvent::Launching {
                            version,
                        }) => Some(LaunchProgress {
                            phase: "launching".into(),
                            message: format!("Launching Minecraft {version}..."),
                            bytes: None,
                            total: None,
                        }),
                        Event::Launch(lighty_launcher::event::LaunchEvent::Launched {
                            pid,
                            ..
                        }) => Some(LaunchProgress {
                            phase: "running".into(),
                            message: format!("Game running (PID {pid})"),
                            bytes: None,
                            total: None,
                        }),
                        Event::Launch(lighty_launcher::event::LaunchEvent::NotLaunched {
                            error, ..
                        }) => Some(LaunchProgress {
                            phase: "error".into(),
                            message: format!("Launch failed: {error}"),
                            bytes: None,
                            total: None,
                        }),
                        Event::InstanceExited(exit) => {
                            let msg = match exit.exit_code {
                                Some(code) => format!("Game exited (code {code})"),
                                None => "Game exited".into(),
                            };
                            Some(LaunchProgress {
                                phase: "done".into(),
                                message: msg,
                                bytes: None,
                                total: None,
                            })
                        }
                        _ => None,
                    };

                    if let Some(p) = progress {
                        if let Err(e) = app_clone.emit("mc-launch-progress", &p) {
                            eprintln!("[ModpackEngine] Emit error: {e}");
                        }
                    }
                }
                Err(e) => {
                    eprintln!("[ModpackEngine] Event receiver error: {e}");
                    break;
                }
            }
        }
    });

    eprintln!("[ModpackEngine] Starting launch pipeline...");
    version
        .launch(&profile, JavaDistribution::Temurin)
        .with_event_bus(&event_bus)
        .with_jvm_options()
        .set("Xms", min_mem)
        .set("Xmx", max_mem)
        .done()
        .run()
        .await
        .map_err(|e| format!("Launch failed: {e}"))?;
    eprintln!("[ModpackEngine] Launch pipeline completed");

    Ok(())
}
