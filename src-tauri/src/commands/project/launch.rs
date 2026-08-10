//! Launch and companion-deploy commands for a project: run the matching Prism
//! instance, deploy the companion mod to it, and report its deploy status.

use tauri::{AppHandle, State};
use uuid::Uuid;

use crate::db::Database;
use crate::minecraft::InstanceManager;

#[tauri::command]
pub async fn test_project(
    app: AppHandle,
    db: State<'_, Database>,
    manager: State<'_, InstanceManager>,
    project_id: String,
    username: String,
    min_mem: Option<String>,
    max_mem: Option<String>,
) -> Result<(), String> {
    eprintln!("[ModCanvas] test_project CALLED with project_id={}", project_id);
    let pid = Uuid::parse_str(&project_id).map_err(|e| e.to_string())?;

    // Get project
    let projects = db.list_projects().map_err(|e| e.to_string())?;
    let project = projects.into_iter()
        .find(|p| p.id == pid)
        .ok_or_else(|| "Project not found".to_string())?;

    eprintln!("[ModCanvas] test_project: {} (path={})", project.name, project.path);

    // Find the matching Prism instance by game_dir path
    let instances = manager.list_instances();
    let instance = instances.iter()
        .find(|i| i.game_dir == project.path)
        .ok_or_else(|| format!("No Prism instance found for '{}' (path={})", project.name, project.path))?;

    eprintln!("[ModCanvas] Launching existing instance: {} (id={})", instance.name, instance.id);

    let min_mem = min_mem.unwrap_or_else(|| "2G".to_string());
    let max_mem = max_mem.unwrap_or_else(|| "4G".to_string());
    manager.launch_instance(
        Box::new(super::super::TauriProgressEmitter(app)),
        &instance.id,
        &username,
        &min_mem,
        &max_mem,
    )?;

    Ok(())
}

#[tauri::command]
pub fn deploy_companion_mod_for_project(
    db: State<'_, Database>,
    manager: State<'_, InstanceManager>,
    project_id: String,
) -> Result<(), String> {
    let pid = Uuid::parse_str(&project_id).map_err(|e| e.to_string())?;
    let project = db.get_project(&pid).map_err(|e| e.to_string())?
        .ok_or_else(|| "Project not found".to_string())?;

    let instances = manager.list_instances();
    let instance = instances.iter()
        .find(|i| i.game_dir == project.path)
        .ok_or_else(|| format!("No Prism instance found for '{}'", project.name))?;

    manager.deploy_companion_mod_by_id(&instance.id)
}

#[tauri::command]
pub fn get_project_companion_status(
    db: State<'_, Database>,
    manager: State<'_, InstanceManager>,
    project_id: String,
) -> Result<crate::minecraft::CompanionDeployStatus, String> {
    let pid = Uuid::parse_str(&project_id).map_err(|e| e.to_string())?;
    let project = db.get_project(&pid).map_err(|e| e.to_string())?
        .ok_or_else(|| "Project not found".to_string())?;

    let instances = manager.list_instances();
    let instance = instances.iter()
        .find(|i| i.game_dir == project.path)
        .ok_or_else(|| format!("No Prism instance found for '{}'", project.name))?;

    let source_jar = crate::minecraft::resolve_companion_source_jar(&instance.loader);
    Ok(crate::minecraft::companion_deploy_status(
        std::path::Path::new(&instance.game_dir),
        source_jar.as_deref(),
    ))
}
