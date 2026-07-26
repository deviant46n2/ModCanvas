use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use tauri::AppHandle;
use tauri::Manager;
use uuid::Uuid;

static LIGHTY_INIT: AtomicBool = AtomicBool::new(false);

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
    ) -> Result<MinecraftInstance> {
        let id = Uuid::new_v4().to_string();
        let game_dir = self.base_dir.join(&id);

        std::fs::create_dir_all(&game_dir)?;

        let instance = MinecraftInstance {
            id: id.clone(),
            name: name.to_string(),
            mc_version: mc_version.to_string(),
            loader: loader.to_string(),
            loader_version: loader_version.map(|s| s.to_string()),
            game_dir: game_dir.to_str().unwrap_or("").to_string(),
            status: InstanceStatus::Stopped,
        };

        let mut instances = self.instances.lock().unwrap();
        instances.push(instance.clone());

        Ok(instance)
    }

    pub fn list_instances(&self) -> Vec<MinecraftInstance> {
        self.instances.lock().unwrap().clone()
    }

    pub fn remove_instance(&self, id: &str) -> Result<bool> {
        let mut instances = self.instances.lock().unwrap();
        let pos = instances.iter().position(|i| i.id == id);

        if let Some(pos) = pos {
            let instance = instances.remove(pos);
            let game_dir = PathBuf::from(&instance.game_dir);
            if game_dir.exists() {
                std::fs::remove_dir_all(&game_dir)?;
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
    ) -> Result<()> {
        let instances = self.instances.lock().unwrap();
        let instance = instances.iter().find(|i| i.id == id)
            .ok_or_else(|| anyhow::anyhow!("Instance not found"))?;

        let mc_version = instance.mc_version.clone();
        let loader = instance.loader.clone();
        let loader_version = instance.loader_version.clone();
        let game_dir = instance.game_dir.clone();
        let id_owned = id.to_string();
        drop(instances);

        let app_handle = app.clone();
        let username = username.to_string();
        let min_mem = min_mem.to_string();
        let max_mem = max_mem.to_string();

        tokio::spawn(async move {
            let result = do_launch(
                &id_owned,
                &mc_version,
                &loader,
                loader_version.as_deref(),
                &game_dir,
                &username,
                &min_mem,
                &max_mem,
            ).await;

            let state = app_handle.state::<InstanceManager>();
            let mut instances = state.instances.lock().unwrap();
            if let Some(inst) = instances.iter_mut().find(|i| i.id == id_owned) {
                match result {
                    Ok(_) => inst.status = InstanceStatus::Stopped,
                    Err(e) => {
                        eprintln!("[ModpackEngine] Launch failed for {}: {e}", id_owned);
                        inst.status = InstanceStatus::Crashed;
                    }
                }
            }
        });

        let mut instances = self.instances.lock().unwrap();
        if let Some(inst) = instances.iter_mut().find(|i| i.id == id) {
            inst.status = InstanceStatus::Running;
        }

        Ok(())
    }

    pub fn stop_instance(&self, id: &str) -> Result<bool> {
        let mut instances = self.instances.lock().unwrap();
        if let Some(inst) = instances.iter_mut().find(|i| i.id == id) {
            inst.status = InstanceStatus::Stopped;
            Ok(true)
        } else {
            Ok(false)
        }
    }

    pub fn get_logs(&self, id: &str) -> Result<String> {
        let instances = self.instances.lock().unwrap();
        let instance = instances.iter().find(|i| i.id == id)
            .ok_or_else(|| anyhow::anyhow!("Instance not found"))?;

        let log_file = PathBuf::from(&instance.game_dir)
            .join("logs")
            .join("latest.log");

        if log_file.exists() {
            Ok(std::fs::read_to_string(&log_file)?)
        } else {
            Ok("No logs yet. Launch the instance first.".to_string())
        }
    }
}

fn ensure_lighty_init() {
    if !LIGHTY_INIT.load(Ordering::SeqCst) {
        let _ = lighty_launcher::prelude::AppState::init("ModpackEngine");
        LIGHTY_INIT.store(true, Ordering::SeqCst);
    }
}

async fn do_launch(
    id: &str,
    mc_version: &str,
    loader: &str,
    loader_version: Option<&str>,
    game_dir: &str,
    username: &str,
    min_mem: &str,
    max_mem: &str,
) -> Result<()> {
    use lighty_launcher::prelude::*;

    ensure_lighty_init();

    let loader_enum = match loader {
        "fabric" => Loader::Fabric,
        "quilt" => Loader::Quilt,
        "forge" => Loader::Forge,
        "neoforge" => Loader::NeoForge,
        _ => Loader::Vanilla,
    };

    let loader_version_str = loader_version.unwrap_or("latest");

    let mut version = VersionBuilder::new(id, loader_enum, loader_version_str, mc_version);

    let mut auth = OfflineAuth::new(username);
    let profile = auth.authenticate(None).await?;

    version
        .launch(&profile, JavaDistribution::Temurin)
        .with_jvm_options()
        .set("Xms", min_mem)
        .set("Xmx", max_mem)
        .done()
        .with_arguments()
        .set(KEY_GAME_DIRECTORY, game_dir)
        .done()
        .run()
        .await?;

    Ok(())
}
