use std::collections::HashMap;
use std::path::Path;

use super::cache::load_ingest_cache;
use super::models::{IngestProgress, IngestResult};
use super::resolve::{fallback_kubejs_texture, texture_data_url_for_key};
use super::ingest_active_instance_with_progress;

/// Emit an `IngestProgress` event to the frontend window.
fn emit_ingest(app: &tauri::AppHandle, progress: &IngestProgress) {
    use tauri::Emitter;
    let _ = app.emit("modcanvas-load-pack-progress", progress);
}

// ── Tauri command ──────────────────────────────────────────────────────────

#[tauri::command]
pub async fn ingest_active_instance_cmd(
    app: tauri::AppHandle,
    instance_path: String,
    force: Option<bool>,
) -> Result<IngestResult, String> {
    // Heavy scan: run off the main thread so the webview stays responsive and
    // per-jar progress events can actually reach the frontend while it runs.
    tauri::async_runtime::spawn_blocking(move || {
        let path = std::path::Path::new(&instance_path);
        let force = force.unwrap_or(false);
        let mut emit = |p: &IngestProgress| emit_ingest(&app, p);
        Ok(ingest_active_instance_with_progress(path, force, &mut emit))
    })
    .await
    .map_err(|e| format!("Ingest task failed: {e}"))?
}

/// Serve a texture file on-demand by key.
/// Extracts the texture from the JAR file or reads from filesystem.
#[tauri::command]
pub async fn get_texture_file(texture_key: String, instance_path: String) -> Result<String, String> {
    let instance_path = Path::new(&instance_path);
    if let Some(url) = load_ingest_cache(&instance_path.join("mods"))
        .and_then(|c| texture_data_url_for_key(&c, &texture_key))
    {
        return Ok(url);
    }
    if let Some(url) = fallback_kubejs_texture(&texture_key, instance_path) {
        return Ok(url);
    }
    Err("Texture not found".to_string())
}

/// Batch variant of `get_texture_file`: resolve many texture keys in a single
/// IPC round-trip. Returns a map of key → data URL (or `None` when a texture
/// could not be resolved).
#[tauri::command]
pub async fn get_texture_files(
    texture_keys: Vec<String>,
    instance_path: String,
) -> HashMap<String, Option<String>> {
    let instance_path = Path::new(&instance_path);
    let mut out = crate::instance_textures::resolve_texture_urls(instance_path, &texture_keys);
    for key in &texture_keys {
        if out.get(key).map_or(true, |u| u.is_none()) {
            if let Some(url) = fallback_kubejs_texture(key, instance_path) {
                out.insert(key.clone(), Some(url));
            }
        }
    }
    out
}
