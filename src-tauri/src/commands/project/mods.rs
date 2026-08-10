//! Project mod-list commands: add a mod, list a project's mods, and the
//! atomic remove path (file delete before row delete).

use chrono::Utc;
use tauri::State;
use uuid::Uuid;

use crate::db::Database;
use crate::models::*;

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
