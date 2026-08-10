use chrono::Utc;
use tauri::{AppHandle, State};
use uuid::Uuid;

use crate::db::Database;
use crate::minecraft::InstanceManager;
use crate::models::*;
use super::resolve_curseforge_api_key;

#[tauri::command]
pub fn create_project(
    db: State<'_, Database>,
    name: String,
    minecraft_version: String,
    mod_loader: String,
    path: String,
) -> Result<Project, String> {
    let name = crate::path_safety::sanitize_project_name(&name)?;
    let loader = match mod_loader.as_str() {
        "Fabric" => ModLoader::Fabric,
        "Quilt" => ModLoader::Quilt,
        "NeoForge" => ModLoader::NeoForge,
        _ => ModLoader::Forge,
    };

    // The frontend sends `~/modpacks/<name>`; POSIX fs calls never expand
    // `~`, so resolve it here (the path-ownership boundary) and make the
    // pack root exist — the load pipeline reads files from it immediately.
    let path = crate::path_safety::expand_home(&path);
    std::fs::create_dir_all(&path)
        .map_err(|e| format!("Failed to create project directory {:?}: {e}", path))?;

    let now = Utc::now();
    let project = Project {
        id: Uuid::new_v4(),
        name,
        description: String::new(),
        minecraft_version,
        mod_loader: loader,
        pack_format: PackFormat::Unknown,
        pack_version: "1.0.0".to_string(),
        author: String::new(),
        created_at: now,
        updated_at: now,
        path: path.display().to_string(),
        source: "modcanvas".to_string(),
    };

    db.create_project(&project).map_err(|e| e.to_string())?;
    Ok(project)
}

#[tauri::command]
pub fn list_projects(
    db: State<'_, Database>,
    manager: State<'_, InstanceManager>,
) -> Result<Vec<Project>, String> {
    let instances = manager.reload_instances();
    db.sync_prism_instances(&instances)
        .map_err(|e| format!("Failed to sync instances: {e}"))?;
    db.list_projects().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_project(db: State<'_, Database>, project_id: String) -> Result<bool, String> {
    let id = Uuid::parse_str(&project_id).map_err(|e| e.to_string())?;

    // Look up the project's path so we can remove its files on disk.
    if let Ok(Some(project)) = db.get_project(&id) {
        let game_dir = std::path::PathBuf::from(&project.path);
        // Imported mrpacks live in their own top-level dir under the imports
        // root — delete the pack dir itself. Prism/attached instances point at
        // `<instance>/minecraft`, so deleting the parent removes the instance.
        if project.pack_format == PackFormat::ModrinthMrpack {
            if game_dir.exists() {
                let _ = std::fs::remove_dir_all(&game_dir);
            }
        } else if let Some(instance_dir) = game_dir.parent() {
            if instance_dir.exists() {
                let _ = std::fs::remove_dir_all(instance_dir);
            }
        }
    }

    db.delete_project(&id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_curseforge_api_key(db: State<'_, Database>) -> Result<Option<String>, String> {
    resolve_curseforge_api_key(&db)
}

#[tauri::command]
pub fn set_curseforge_api_key(db: State<'_, Database>, key: String) -> Result<(), String> {
    db.set_curseforge_api_key(&key).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn add_mod(
    db: State<'_, Database>,
    project_id: String,
    mod_id: String,
    slug: String,
    name: String,
    version: String,
    description: String,
    author: String,
    source: String,
    enabled: Option<bool>,
) -> Result<ModEntry, String> {
    let entry = ModEntry {
        id: Uuid::new_v4(),
        project_id: Uuid::parse_str(&project_id).map_err(|e| e.to_string())?,
        mod_id,
        slug,
        name,
        version,
        description,
        author,
        source: match source.as_str() {
            "Modrinth" => ModSource::Modrinth,
            "CurseForge" => ModSource::CurseForge,
            _ => ModSource::Local,
        },
        enabled: enabled.unwrap_or(true),
        added_at: Utc::now(),
        icon: None,
        // add_mod is the toggle-as-add path (no file handle) — see debt note
        // in db.rs add_mod: DO UPDATE deliberately omits file_name so toggling
        // preserves any stored name instead of wiping it.
        file_name: None,
    };

    db.add_mod(&entry).map_err(|e| e.to_string())?;
    Ok(entry)
}

/// Outcome of a mod removal, distinct from `Err`: the frontend surfaces
/// `file_missing` as a warning toast (row removed, file was already gone) and
/// `file_removed`/row-only as success. `Err` means the removal aborted with the
/// row intact (file delete failed — atomic contract).
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoveModResult {
    pub row_removed: bool,
    pub file_removed: bool,
    /// The stored `file_name` pointed at a jar that was already gone from disk
    /// (deleted externally). The row was still removed.
    pub file_missing: bool,
    pub message: String,
}

#[tauri::command]
pub fn remove_mod(
    db: State<'_, Database>,
    project_id: String,
    mod_id: String,
) -> Result<RemoveModResult, String> {
    let pid = Uuid::parse_str(&project_id).map_err(|e| e.to_string())?;

    // Fetch the row first: its file_name decides whether there is a file to
    // delete at all, and we must not delete the row before the file is gone.
    let rows = db.get_project_mods(&pid).map_err(|e| e.to_string())?;
    let row = rows
        .iter()
        .find(|m| m.mod_id == mod_id)
        .ok_or_else(|| format!("Mod '{mod_id}' not found in this project"))?;

    let mut file_removed = false;
    let mut file_missing = false;

    if let Some(ref name) = row.file_name {
        // Defense in depth: stored file_name must be a bare component (no path
        // separators, no traversal). remove_file on a symlink removes the link,
        // not its target, so a malicious symlink inside mods/ cannot redirect
        // the delete outside the instance.
        if name.is_empty()
            || name == "."
            || name == ".."
            || name.contains('/')
            || name.contains('\\')
        {
            return Err(format!(
                "Refusing to remove mod with unsafe file name '{name}'"
            ));
        }

        let project = db
            .get_project(&pid)
            .map_err(|e| e.to_string())?
            .ok_or_else(|| "Project not found".to_string())?;
        let game_dir = std::path::Path::new(&project.path);

        if game_dir.is_dir() {
            let mods_dir = crate::path_safety::validate_under_root(game_dir, "mods")
                .map_err(|e| format!("Invalid mods directory: {e}"))?;
            if mods_dir.exists() {
                let mods_canonical = mods_dir
                    .canonicalize()
                    .map_err(|e| format!("Mods directory resolution failed: {e}"))?;
                let candidate = mods_canonical.join(name);

                match std::fs::remove_file(&candidate) {
                    Ok(()) => file_removed = true,
                    Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
                        // Already gone (deleted externally). The row's claim is
                        // void; removing the row completes the truth.
                        file_missing = true;
                    }
                    Err(e) => {
                        // Atomic contract: file could not be removed (permissions,
                        // Windows JVM lock EBUSY). Keep the row so the mods list
                        // never claims a mod whose file is still present.
                        return Err(format!(
                            "Failed to delete mod file '{name}': {e}. The mod row was kept."
                        ));
                    }
                }
            } else {
                file_missing = true;
            }
        } else {
            // Instance dir missing entirely — the row's file claim is void.
            file_missing = true;
        }
    }
    // else: file_name is None (legacy row / toggle-as-add / placeholder) —
    // there is no file to delete; row-only removal.

    let row_removed = db.remove_mod(&pid, &mod_id).map_err(|e| e.to_string())?;
    let message = if file_removed {
        format!("Removed {} from the pack", row.name)
    } else if file_missing {
        format!("Removed {} — its jar was already missing from the instance", row.name)
    } else {
        format!("Removed {} from the mod list", row.name)
    };

    Ok(RemoveModResult {
        row_removed,
        file_removed,
        file_missing,
        message,
    })
}

#[tauri::command]
pub fn get_project_mods(
    db: State<'_, Database>,
    project_id: String,
) -> Result<Vec<ModEntry>, String> {
    let pid = Uuid::parse_str(&project_id).map_err(|e| e.to_string())?;
    db.get_project_mods(&pid).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn save_project(
    _db: State<'_, Database>,
    project_id: String,
) -> Result<(), String> {
    let _pid = Uuid::parse_str(&project_id).map_err(|e| e.to_string())?;
    // Project is already persisted in DB on creation/mod changes
    // This command exists as an explicit save point for the frontend
    Ok(())
}

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
        Box::new(super::TauriProgressEmitter(app)),
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
