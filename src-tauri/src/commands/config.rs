use std::path::PathBuf;

use uuid::Uuid;

use crate::db::Database;
use crate::imports::{ConfigFile, ConfigFormat};
use crate::models::Project;
use crate::path_safety;

#[derive(serde::Serialize)]
pub struct ConfigFileInfo {
    pub path: String,
    pub name: String,
    pub format: String,
    pub size: u64,
}

/// `config/` directory inside an instance, resolved from the project.
fn config_root(project_path: &str) -> PathBuf {
    path_safety::project_config_root(project_path)
}

fn resolve_project(db: &Database, project_id: &str) -> Result<Project, String> {
    let pid = Uuid::parse_str(project_id).map_err(|e| e.to_string())?;
    db.get_project(&pid)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Project not found".to_string())
}

/// Recursively list editable config files under a directory.
fn list_files_under(root: &PathBuf) -> Vec<ConfigFileInfo> {
    let mut files = Vec::new();
    let iter = walkdir::WalkDir::new(root);
    for entry in iter.into_iter().filter_map(|e| e.ok()) {
        let path = entry.path();
        if path.is_file() {
            let relative = path
                .strip_prefix(root)
                .map(|p| p.to_string_lossy().to_string())
                .unwrap_or_default();
            let format = match path.extension().and_then(|e| e.to_str()) {
                Some("toml") => "TOML".to_string(),
                Some("json") => "JSON".to_string(),
                // Forge .cfg files are NOT Java properties (they use `section {
                // S:Key <…> }` blocks): the parser treats them as raw text, so
                // the label must not claim a structure the parse won't give.
                Some("properties") => "Properties".to_string(),
                Some("yaml") | Some("yml") => "YAML".to_string(),
                Some("hocon") => "HOCON".to_string(),
                _ => "Unknown".to_string(),
            };
            let size = std::fs::metadata(path).map(|m| m.len()).unwrap_or(0);
            files.push(ConfigFileInfo {
                path: path.to_string_lossy().to_string(),
                name: relative,
                format,
                size,
            });
        }
    }
    files.sort_by(|a, b| a.name.cmp(&b.name));
    files
}

#[tauri::command]
pub fn list_config_files(project_id: String, db: tauri::State<'_, Database>) -> Result<Vec<ConfigFileInfo>, String> {
    let project = resolve_project(&db, &project_id)?;
    let root = config_root(&project.path);
    if !root.exists() {
        return Ok(Vec::new());
    }
    Ok(list_files_under(&root))
}

/// Used by export: list the instance's real config files (relative paths).
pub(super) fn list_config_files_internal(project: &Project) -> Result<Vec<ConfigFile>, String> {
    let root = config_root(&project.path);
    if !root.exists() {
        return Ok(Vec::new());
    }
    let mut files = Vec::new();
    for entry in walkdir::WalkDir::new(&root)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let relative = path
            .strip_prefix(&root)
            .map_err(|e| e.to_string())?
            .to_path_buf();
        let content = std::fs::read_to_string(path).map_err(|e| e.to_string())?;
        let format = match path.extension().and_then(|e| e.to_str()) {
            Some("toml") => ConfigFormat::Toml,
            Some("json") => ConfigFormat::Json,
            Some("cfg") | Some("properties") => ConfigFormat::Properties,
            Some("yaml") | Some("yml") => ConfigFormat::Yaml,
            Some("hocon") => ConfigFormat::Hocon,
            _ => ConfigFormat::Toml,
        };
        files.push(ConfigFile {
            path: relative,
            content,
            format,
        });
    }
    Ok(files)
}

#[tauri::command]
pub fn read_config_file(project_id: String, path: String, db: tauri::State<'_, Database>) -> Result<String, String> {
    let project = resolve_project(&db, &project_id)?;
    let safe_path = path_safety::validate_project_read(&project.path, &path)?;
    std::fs::read_to_string(&safe_path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn write_config_file(project_id: String, path: String, content: String, db: tauri::State<'_, Database>) -> Result<(), String> {
    let project = resolve_project(&db, &project_id)?;
    let safe_path = path_safety::validate_project_write(&project.path, &path)?;
    if let Some(parent) = safe_path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    path_safety::atomic_write_str(&safe_path, &content).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn parse_config_file(project_id: String, path: String, db: tauri::State<'_, Database>) -> Result<crate::config_parser::ParsedConfig, String> {
    let project = resolve_project(&db, &project_id)?;
    let safe_path = path_safety::validate_project_read(&project.path, &path)?;
    let content = std::fs::read_to_string(&safe_path).map_err(|e| e.to_string())?;
    let format = safe_path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("toml");
    crate::config_parser::parse_config(&content, format)
}

#[tauri::command]
pub fn save_structured_config(
    project_id: String,
    path: String,
    config: crate::config_parser::ConfigValue,
    db: tauri::State<'_, Database>,
) -> Result<(), String> {
    let project = resolve_project(&db, &project_id)?;
    let safe_path = path_safety::validate_project_write(&project.path, &path)?;
    let format = safe_path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("toml");
    // For TOML, update the existing file in place so table headers, block
    // comments, ordering, and layout survive for keys the editor didn't touch.
    let content = if format.eq_ignore_ascii_case("toml") {
        match std::fs::read_to_string(&safe_path) {
            Ok(existing) => crate::config_parser::apply_config_to_toml(&existing, &config),
            Err(_) => crate::config_parser::config_value_to_string(&config, format),
        }
    } else {
        crate::config_parser::config_value_to_string(&config, format)
    };
    if let Some(parent) = safe_path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    path_safety::atomic_write_str(&safe_path, &content).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn list_files_under_labels_cfg_as_unknown_not_properties() {
        let tmp = tempfile::tempdir().unwrap();
        std::fs::write(tmp.path().join("mod.toml"), "key = 1").unwrap();
        std::fs::write(tmp.path().join("forge.cfg"), "general {\n  B:enabled = true\n}").unwrap();
        std::fs::write(tmp.path().join("app.properties"), "a = b").unwrap();

        let files = list_files_under(&tmp.path().to_path_buf());
        let by_name: std::collections::HashMap<&str, &str> = files
            .iter()
            .map(|f| (f.name.as_str(), f.format.as_str()))
            .collect();
        assert_eq!(by_name.get("mod.toml"), Some(&"TOML"));
        // The parser cannot structure Forge .cfg — the label must not claim it can.
        assert_eq!(by_name.get("forge.cfg"), Some(&"Unknown"));
        assert_eq!(by_name.get("app.properties"), Some(&"Properties"));
    }
}
