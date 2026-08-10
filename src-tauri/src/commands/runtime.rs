use tauri::{AppHandle, State};

use crate::minecraft::{InstanceManager, MinecraftInstance};

/// Diagnostic: return raw scan info about all instance roots.

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

/// Latest stable loader version for an MC version + loader, from the loaders'
/// own official endpoints. None = unresolvable (offline / unknown series) —
/// callers must fail loudly, never write a guessed version.
#[tauri::command]
pub async fn resolve_loader_version(
    mc_version: String,
    loader: String,
) -> Result<Option<String>, String> {
    crate::commands::modpack::loader_version::resolve_loader_version(&mc_version, &loader).await
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
