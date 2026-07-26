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
                &id_owned,
                &mc_version,
                &loader,
                loader_version.as_deref(),
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

    let result = std::panic::catch_unwind(|| {
        lighty_launcher::core::AppState::init("ModpackEngine")
    });

    match result {
        Ok(Ok(_)) => {
            INIT.store(true, Ordering::SeqCst);
            eprintln!("[ModpackEngine] lighty-launcher initialized");
            Ok(())
        }
        Ok(Err(e)) => {
            Err(format!("lighty-launcher init error: {e}"))
        }
        Err(_) => {
            Err("lighty-launcher init panicked".to_string())
        }
    }
}

async fn do_launch(
    id: &str,
    mc_version: &str,
    loader: &str,
    loader_version: Option<&str>,
    username: &str,
    min_mem: &str,
    max_mem: &str,
) -> Result<(), String> {
    ensure_lighty_init()?;

    use lighty_launcher::auth::OfflineAuth;
    use lighty_launcher::auth::Authenticator;
    use lighty_launcher::java::JavaDistribution;
    use lighty_launcher::launch::Launch;
    use lighty_launcher::launch::keys::KEY_GAME_DIRECTORY;
    use lighty_launcher::loaders::Loader;
    use lighty_launcher::version::VersionBuilder;

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
    let profile = auth.authenticate()
        .await
        .map_err(|e| format!("Auth failed: {e}"))?;

    let game_dir_str = version.game_dirs.to_string_lossy().to_string();

    version
        .launch(&profile, JavaDistribution::Temurin)
        .with_jvm_options()
        .set("Xms", min_mem)
        .set("Xmx", max_mem)
        .done()
        .with_arguments()
        .set(KEY_GAME_DIRECTORY, &game_dir_str)
        .done()
        .run()
        .await
        .map_err(|e| format!("Launch failed: {e}"))?;

    Ok(())
}
