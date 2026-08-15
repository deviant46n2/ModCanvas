use std::collections::HashMap;
use std::path::PathBuf;

const CACHE_VERSION: u32 = 9;

mod cache;
mod index;
mod layers;
mod materialize;
mod models;
mod pixels;
mod tags;

pub(crate) use cache::dirs_cache_dir;
pub(crate) use index::build_animation_index;
pub(crate) use index::build_engine_upgrade_set;
pub use index::scan_instance_textures;
pub use materialize::resolve_texture_urls;
#[tauri::command]
pub async fn scan_instance_textures_cmd(
    instance_path: String,
) -> Result<HashMap<String, String>, String> {
    // First scan of an instance does a full jar + model pass (tens of seconds
    // on a large pack). Run it off the main thread so the UI stays responsive.
    tauri::async_runtime::spawn_blocking(move || {
        let path = std::path::Path::new(&instance_path);
        Ok(scan_instance_textures(path))
    })
    .await
    .map_err(|e| format!("Texture scan task failed: {e}"))?
}

/// Item ids (`ns:id`) that resolve FLAT offline but whose model chain reaches
/// 3D block geometry — the companion's engine render should replace the flat
/// stand-in when connected (s58). Rides the same disk cache as the texture
/// index, so this is cheap after the first scan.
#[tauri::command]
pub async fn scan_engine_upgrade_cmd(
    instance_path: String,
) -> Result<Vec<String>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let path = std::path::Path::new(&instance_path);
        let mut set: Vec<String> = build_engine_upgrade_set(path).iter().cloned().collect();
        set.sort();
        Ok(set)
    })
    .await
    .map_err(|e| format!("Engine-upgrade scan task failed: {e}"))?
}

/// Delete stale per-instance cache files (texture/items/engine-render/ingest)
/// that no longer match any known instance. Pass the live instance paths and
/// their `mods/` dirs to keep; everything else is junk from old scans.
#[tauri::command]
pub fn prune_caches_cmd(
    instance_paths: Vec<String>,
    mods_dirs: Vec<String>,
) -> Result<usize, String> {
    let keep_instances: Vec<PathBuf> = instance_paths.into_iter().map(PathBuf::from).collect();
    let keep_mods: Vec<PathBuf> = mods_dirs.into_iter().map(PathBuf::from).collect();
    let Some(cache_dir) = crate::instance_textures::cache::dirs_cache_dir() else {
        return Ok(0);
    };
    Ok(crate::instance_textures::cache::prune_caches(&keep_instances, &keep_mods, &cache_dir))
}

/// Return the per-instance animation metadata map: texture key → raw `.mcmeta`
/// JSON for every animated texture (adjacent `<texture>.png.mcmeta` files).
#[tauri::command]
pub async fn scan_instance_animations_cmd(
    instance_path: String,
) -> Result<HashMap<String, String>, String> {
    // Shares the same heavy first scan as the texture index; keep it off the
    // main thread (the disk cache makes repeat calls fast).
    tauri::async_runtime::spawn_blocking(move || {
        let path = std::path::Path::new(&instance_path);
        Ok(build_animation_index(path).as_ref().clone())
    })
    .await
    .map_err(|e| format!("Animation scan task failed: {e}"))?
}

#[tauri::command]
pub fn resolve_item_tags_cmd(
    instance_path: String,
    tags: Vec<String>,
) -> Result<HashMap<String, Vec<String>>, String> {
    let path = std::path::Path::new(&instance_path);
    Ok(tags::resolve_item_tags(path, &tags))
}

/// List every item tag in the instance (id + expanded member count), sorted by
/// id. Backs the Tags palette tab's local catalog.
#[tauri::command]
pub fn list_item_tags_cmd(
    instance_path: String,
) -> Result<Vec<tags::ItemTagInfo>, String> {
    let path = std::path::Path::new(&instance_path);
    Ok(tags::list_item_tags(path))
}

#[cfg(test)]
mod tests;
