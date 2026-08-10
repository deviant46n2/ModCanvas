//! Project lifecycle commands: create/list/delete projects, CurseForge API
//! key persistence, and the explicit save point.

use chrono::Utc;
use tauri::State;
use uuid::Uuid;

use crate::db::Database;
use crate::minecraft::InstanceManager;
use crate::models::*;

use super::super::resolve_curseforge_api_key;

#[tauri::command]
pub fn create_project(
    db: State<'_, Database>,
    name: String,
    minecraft_version: String,
    mod_loader: String,
    path: String,
    template_id: Option<String>,
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

    // The First-Pack wizard (roadmap P0-WIZARD) passes a template id; the
    // classic new-project modal passes None. Scaffolding happens in the same
    // command as creation so there is never a "created but empty" state the
    // wizard could strand a beginner in. Unknown ids fail the whole create.
    if let Some(template_id) = template_id {
        crate::templates::scaffold_template(&path, &template_id)?;
    }

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

/// Template packages the First-Pack wizard can offer. Ids come from the Rust
/// registry (`crate::templates`), never from a hardcoded frontend list.
#[tauri::command]
pub fn list_project_templates() -> Result<Vec<crate::templates::TemplateMeta>, String> {
    Ok(crate::templates::list_templates())
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
pub async fn save_project(
    _db: State<'_, Database>,
    project_id: String,
) -> Result<(), String> {
    let _pid = Uuid::parse_str(&project_id).map_err(|e| e.to_string())?;
    // Project is already persisted in DB on creation/mod changes
    // This command exists as an explicit save point for the frontend
    Ok(())
}
