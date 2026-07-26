use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::AppHandle;
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
                inst.status = InstanceStatus::Running;
            }
        }

        tokio::spawn(async move {
            let result = do_launch(
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

    let java_home = std::path::PathBuf::from("/usr/lib/jvm/java-21-openjdk");
    if !java_home.exists() {
        return;
    }

    let target_dir = jre_base.join("Temurin_21");
    if target_dir.exists() {
        return;
    }

    if let Err(e) = std::fs::create_dir_all(&jre_base) {
        eprintln!("[ModpackEngine] Failed to create JRE base dir: {e}");
        return;
    }

    match std::os::unix::fs::symlink(&java_home, &target_dir) {
        Ok(_) => eprintln!("[ModpackEngine] Symlinked system Java 21 for lighty"),
        Err(e) => eprintln!("[ModpackEngine] Failed to symlink Java: {e}"),
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
            let url = "https://maven.neoforged.net/releases/net/neoforged/neoforge/maven-metadata.xml";
            let resp = reqwest::get(url)
                .await
                .map_err(|e| format!("Failed to fetch NeoForge metadata: {e}"))?;
            let text = resp
                .text()
                .await
                .map_err(|e| format!("Failed to read NeoForge metadata: {e}"))?;

            let mut latest = String::new();
            let mut in_release = false;
            for line in text.lines() {
                let trimmed = line.trim();
                if trimmed == "<release>" || trimmed.starts_with("<release>") {
                    in_release = true;
                    if let Some(v) = trimmed
                        .strip_prefix("<release>")
                        .and_then(|s| s.strip_suffix("</release>"))
                    {
                        latest = v.to_string();
                        in_release = false;
                    }
                } else if in_release {
                    latest = trimmed
                        .strip_suffix("</release>")
                        .unwrap_or(trimmed)
                        .to_string();
                    in_release = false;
                }
            }

            if !latest.is_empty() {
                Ok(latest)
            } else {
                Err("No NeoForge versions found in metadata".to_string())
            }
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

    let mut auth = OfflineAuth::new(username);
    let profile = auth
        .authenticate()
        .await
        .map_err(|e| format!("Auth failed: {e}"))?;

    version
        .launch(&profile, JavaDistribution::Temurin)
        .with_jvm_options()
        .set("Xms", min_mem)
        .set("Xmx", max_mem)
        .done()
        .run()
        .await
        .map_err(|e| format!("Launch failed: {e}"))?;

    Ok(())
}
