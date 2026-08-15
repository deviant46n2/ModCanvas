use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::indexer_kubejs::collect_kubejs_scripts;

mod cache;
mod jar;
mod kubejs;
mod vanilla;

use cache::{get_jar_meta, load_cache, save_cache, JarMeta};
pub(crate) use vanilla::find_vanilla_jars;

#[cfg(test)]
mod tests;
#[cfg(test)]
mod tests_e2e;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ItemRegistryEntry {
    pub id: String,
    pub name: String,
    pub mod_id: String,
    /// Compact texture descriptor (`jar:<abs>!<zip>`) when the scan could map
    /// the item to a texture. NEVER image bytes — displayable data URLs are
    /// materialized lazily on demand (AGENTS.md: scans are enumeration-only).
    /// Consumers must only treat this as a URL when it passes
    /// `isUsableTextureValue`; otherwise resolve through the texture index.
    pub texture_data_url: Option<String>,
}

pub fn scan_instance_items(instance_path: &Path, kubejs_namespace: &str) -> Result<Vec<ItemRegistryEntry>, String> {
    let mods_dir = instance_path.join("mods");

    // 1. Collect JARs from mods/
    let mut all_jars: Vec<PathBuf> = Vec::new();
    if mods_dir.exists() {
        if let Ok(entries) = fs::read_dir(&mods_dir) {
            for entry in entries.filter_map(|e| e.ok()) {
                let path = entry.path();
                if path.extension().map_or(false, |ext| ext == "jar") {
                    all_jars.push(path);
                }
            }
        }
    }

    // 2. Collect extra JARs (vanilla minecraft, libraries)
    let extra_jars = find_vanilla_jars(instance_path);
    for jar in extra_jars {
        if !all_jars.iter().any(|p| {
            fs::canonicalize(p).ok() == fs::canonicalize(&jar).ok()
        }) {
            all_jars.push(jar);
        }
    }

    // 3. Build metadata for cache check (jars + KubeJS scripts)
    let current_jars: Vec<(PathBuf, JarMeta)> = all_jars.iter()
        .filter_map(|p| {
            let meta = get_jar_meta(p)?;
            Some((p.clone(), meta))
        })
        .collect();
    let current_kubejs = collect_kubejs_scripts(instance_path);

    if current_jars.is_empty() && current_kubejs.is_empty() {
        return Ok(Vec::new());
    }

    // 4. The item registry is now COMPANION-AUTHORITATIVE (s59): the game's
    //    BuiltInRegistries.ITEM dump (via `save_item_registry_cmd`) is the
    //    source of truth — lang keys lie (potion.effect.* floods, banner
    //    pattern keys, FTB GUI keys; 1087/2411 entries on the monster pack
    //    were fake). The cache is served as-is when present; before the first
    //    companion connect there is no cache and the registry is empty
    //    (blank-first-run is the agreed UX — Pack Health's registryDegraded
    //    guard keeps that from becoming a false "all items missing" storm).
    //    The legacy lang-key scan path is PARKED (see git history / handoff
    //    s59): deleting it is a separate evidence-backed pass.
    if let Some(cached) = load_cache(instance_path, &current_jars, &current_kubejs) {
        return Ok(cached);
    }

    Ok(Vec::new())
}

/// Persist the companion's authoritative item registry (BuiltInRegistries.ITEM
/// dump) to the per-instance cache. The frontend calls this when
/// `ITEM_REGISTRY_RESULT` lands; offline sessions after the first launch read
/// the cached registry via `scan_instance_items`.
pub fn save_item_registry(
    instance_path: &Path,
    items: Vec<ItemRegistryEntry>,
) -> Result<(), String> {
    // Same jar/kubejs metadata collection as the scan path, so the cache
    // validates on later loads and invalidates when the pack changes (a
    // changed pack needs a game relaunch anyway — mods load at startup — and
    // the next connect re-dumps the real registry).
    let mods_dir = instance_path.join("mods");
    let mut all_jars: Vec<PathBuf> = Vec::new();
    if mods_dir.exists() {
        if let Ok(entries) = fs::read_dir(&mods_dir) {
            for entry in entries.filter_map(|e| e.ok()) {
                let path = entry.path();
                if path.extension().map_or(false, |ext| ext == "jar") {
                    all_jars.push(path);
                }
            }
        }
    }
    for jar in find_vanilla_jars(instance_path) {
        if !all_jars.iter().any(|p| fs::canonicalize(p).ok() == fs::canonicalize(&jar).ok()) {
            all_jars.push(jar);
        }
    }
    let current_jars: Vec<(PathBuf, JarMeta)> = all_jars.iter()
        .filter_map(|p| get_jar_meta(p).map(|meta| (p.clone(), meta)))
        .collect();
    let current_kubejs = collect_kubejs_scripts(instance_path);

    // Canonical order for display: mod_id, then id — the same sort the lang
    // scan applied. The game registry comes in registration order, which reads
    // as random in the item browser ("blocks have no sense of organization").
    let mut sorted = items;
    sorted.sort_by(|a, b| a.mod_id.cmp(&b.mod_id).then(a.id.cmp(&b.id)));

    save_cache(instance_path, &current_jars, &current_kubejs, &sorted, "companion");
    Ok(())
}

#[tauri::command]
pub async fn save_item_registry_cmd(
    instance_path: String,
    items: Vec<ItemRegistryEntry>,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        save_item_registry(Path::new(&instance_path), items)
    })
    .await
    .map_err(|e| format!("Item registry save task failed: {e}"))?
}

#[tauri::command]
pub async fn scan_instance_items_cmd(
    instance_path: String,
    kubejs_namespace: Option<String>,
) -> Result<Vec<ItemRegistryEntry>, String> {
    // Jar walk + lang/model parsing can take a while on a large pack; run off
    // the main thread so the webview stays responsive.
    tauri::async_runtime::spawn_blocking(move || {
        let path = Path::new(&instance_path);
        scan_instance_items(path, kubejs_namespace.as_deref().unwrap_or("kubejs"))
    })
    .await
    .map_err(|e| format!("Item scan task failed: {e}"))?
}
