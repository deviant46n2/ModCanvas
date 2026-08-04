use tauri::{AppHandle, State};

use crate::minecraft::{InstanceManager, MinecraftInstance};

/// Diagnostic: return raw scan info about all instance roots.
#[tauri::command]
pub fn debug_instance_scan(manager: State<'_, InstanceManager>) -> String {
    let instances = manager.reload_instances();
    let mut out = String::new();
    for base in manager.base_dirs() {
        out.push_str(&format!("base_dir: {:?}\n", base));
        if let Ok(entries) = std::fs::read_dir(base) {
            for entry in entries.flatten() {
                let p = entry.path();
                let is_dir = p.is_dir();
                out.push_str(&format!("  raw dir entry: [{} dir={}]", p.display(), is_dir));
                out.push('\n');
            }
        }
    }
    out.push_str(&format!("instances found: {}\n", instances.len()));
    for inst in &instances {
        out.push_str(&format!(
            "  - name={}, mc_version={}, loader={}, loader_version={:?}, game_dir={}\n",
            inst.name, inst.mc_version, inst.loader, inst.loader_version, inst.game_dir
        ));
    }
    out
}

#[tauri::command]
pub fn create_mc_instance(
    manager: State<'_, InstanceManager>,
    name: String,
    mc_version: String,
    loader: String,
    loader_version: Option<String>,
) -> Result<MinecraftInstance, String> {
    manager
        .create_instance(&name, &mc_version, &loader, loader_version.as_deref())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_mc_instances(manager: State<'_, InstanceManager>) -> Vec<MinecraftInstance> {
    manager.list_instances()
}

#[tauri::command]
pub async fn launch_mc_instance(
    manager: State<'_, InstanceManager>,
    app: AppHandle,
    instance_id: String,
    username: String,
    _java_path: Option<String>,
    min_mem: Option<String>,
    max_mem: Option<String>,
) -> Result<(), String> {
    eprintln!("[ModCanvas] launch_mc_instance called for instance_id={} username={} min_mem={:?} max_mem={:?}", instance_id, username, min_mem, max_mem);
    let emitter = Box::new(super::TauriProgressEmitter(app));
    manager
        .launch_instance(
            emitter,
            &instance_id,
            &username,
            min_mem.as_deref().unwrap_or("2G"),
            max_mem.as_deref().unwrap_or("4G"),
        )
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn stop_mc_instance(
    manager: State<'_, InstanceManager>,
    instance_id: String,
) -> Result<bool, String> {
    manager
        .stop_instance(&instance_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn remove_mc_instance(
    manager: State<'_, InstanceManager>,
    instance_id: String,
) -> Result<bool, String> {
    manager
        .remove_instance(&instance_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_mc_logs(
    manager: State<'_, InstanceManager>,
    instance_id: String,
) -> Result<String, String> {
    manager
        .get_logs(&instance_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn resolve_mc_loader_version(
    loader: String,
    mc_version: String,
    requested_version: Option<String>,
) -> Result<String, String> {
    crate::minecraft::resolve_loader_version(&loader, &mc_version, requested_version.as_deref()).await
}
