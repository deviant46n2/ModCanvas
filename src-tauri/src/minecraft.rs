use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Mutex;
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
        _app: tauri::AppHandle,
        _id: &str,
        _username: &str,
        _min_mem: &str,
        _max_mem: &str,
    ) -> Result<(), String> {
        Err("Minecraft launcher not yet integrated. Install lighty-launcher to enable.".into())
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
            Ok("No logs yet.".to_string())
        }
    }
}
