use uuid::Uuid;

use crate::imports::{ConfigFile, ConfigFormat};
use crate::models::Project;

#[derive(serde::Serialize)]
pub struct ConfigFileInfo {
    pub path: String,
    pub name: String,
    pub format: String,
    pub size: u64,
}

pub(super) fn list_config_files_internal(project: &Project) -> Result<Vec<ConfigFile>, String> {
    let config_dir = std::env::temp_dir()
        .join("modcanvas_configs")
        .join(project.id.to_string());

    if !config_dir.exists() {
        return Ok(Vec::new());
    }

    let mut files = Vec::new();
    for entry in walkdir::WalkDir::new(&config_dir)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        let path = entry.path();
        if path.is_file() {
            let relative = path
                .strip_prefix(&config_dir)
                .map_err(|e| e.to_string())?;
            if let Ok(content) = std::fs::read_to_string(path) {
                let format = match path.extension().and_then(|e| e.to_str()) {
                    Some("toml") => ConfigFormat::Toml,
                    Some("json") => ConfigFormat::Json,
                    Some("cfg") | Some("properties") => ConfigFormat::Properties,
                    Some("yaml") | Some("yml") => ConfigFormat::Yaml,
                    Some("hocon") => ConfigFormat::Hocon,
                    _ => ConfigFormat::Toml,
                };
                files.push(ConfigFile {
                    path: relative.into(),
                    content,
                    format,
                });
            }
        }
    }

    Ok(files)
}

#[tauri::command]
pub fn get_config(path: String) -> Result<serde_json::Value, String> {
    let safe_path = crate::path_safety::validate_config_read(&path)?;
    let content = std::fs::read_to_string(&safe_path).map_err(|e| e.to_string())?;

    if safe_path.extension().and_then(|e| e.to_str()) == Some("toml")
        || safe_path.extension().and_then(|e| e.to_str()) == Some("cfg")
    {
        // Parse TOML directly into serde_json::Value via toml_edit
        let val: serde_json::Value = toml_edit::de::from_str(&content).map_err(|e| e.to_string())?;
        Ok(val)
    } else {
        serde_json::from_str(&content).map_err(|e| e.to_string())
    }
}

#[tauri::command]
pub fn save_config(path: String, content: String) -> Result<(), String> {
    let safe_path = crate::path_safety::validate_config_write(&path)?;
    crate::path_safety::atomic_write_str(&safe_path, &content).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_config_files(project_id: String) -> Result<Vec<ConfigFileInfo>, String> {
    let pid = Uuid::parse_str(&project_id).map_err(|e| e.to_string())?;
    let config_dir = std::env::temp_dir().join("modcanvas_configs").join(pid.to_string());

    if !config_dir.exists() {
        return Ok(Vec::new());
    }

    let mut files = Vec::new();
    for entry in walkdir::WalkDir::new(&config_dir).into_iter().filter_map(|e| e.ok()) {
        let path = entry.path();
        if path.is_file() {
            let relative = path.strip_prefix(&config_dir).map_err(|e| e.to_string())?;
            let name = relative.to_string_lossy().to_string();
            let format = match path.extension().and_then(|e| e.to_str()) {
                Some("toml") => "TOML".to_string(),
                Some("json") => "JSON".to_string(),
                Some("cfg") | Some("properties") => "Properties".to_string(),
                Some("yaml") | Some("yml") => "YAML".to_string(),
                Some("hocon") => "HOCON".to_string(),
                _ => "Unknown".to_string(),
            };
            let size = std::fs::metadata(path).map(|m| m.len()).unwrap_or(0);
            files.push(ConfigFileInfo {
                path: path.to_string_lossy().to_string(),
                name,
                format,
                size,
            });
        }
    }

    files.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(files)
}

#[tauri::command]
pub fn read_config_file(path: String) -> Result<String, String> {
    let safe_path = crate::path_safety::validate_config_read(&path)?;
    std::fs::read_to_string(&safe_path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn write_config_file(path: String, content: String) -> Result<(), String> {
    let safe_path = crate::path_safety::validate_config_write(&path)?;
    if let Some(parent) = safe_path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    crate::path_safety::atomic_write_str(&safe_path, &content).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn parse_config_file(path: String) -> Result<crate::config_parser::ParsedConfig, String> {
    let safe_path = crate::path_safety::validate_config_read(&path)?;
    let content = std::fs::read_to_string(&safe_path).map_err(|e| e.to_string())?;
    let format = safe_path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("toml");
    crate::config_parser::parse_config(&content, format)
}

#[tauri::command]
pub fn save_structured_config(
    path: String,
    config: crate::config_parser::ConfigValue,
) -> Result<(), String> {
    let safe_path = crate::path_safety::validate_config_write(&path)?;
    let format = safe_path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("toml");
    let content = crate::config_parser::config_value_to_string(&config, format);
    if let Some(parent) = safe_path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    crate::path_safety::atomic_write_str(&safe_path, &content).map_err(|e| e.to_string())
}
