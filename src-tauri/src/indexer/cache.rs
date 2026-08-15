use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::collections::hash_map::DefaultHasher;
use std::fs;
use std::hash::{Hash, Hasher};
use std::path::{Path, PathBuf};

use crate::indexer_kubejs::KubejsScriptMeta;

use super::ItemRegistryEntry;

/// Bump whenever the cache shape, key forms, or layer semantics change so
/// existing on-disk caches rescan once.
/// v3: `texture_data_url` now holds `jar:<abs>!<zip>` descriptors, not base64
/// data URLs (AGENTS.md enumeration-only scans) — old caches would serve the
/// banned format, so a bump forces one rescan.
/// v4: registry is now companion-authoritative (s59). The cache may carry
/// either a companion dump (`source: "companion"`) or the legacy lang-key
/// scan (`source: "scan"`); old v3 caches hold lang-key junk and are dropped.
const ITEM_CACHE_VERSION: u32 = 4;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub(super) struct JarMeta {
    file_name: String,
    size: u64,
    modified: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct ItemIndexerCache {
    version: u32,
    /// Where the item list came from: `companion` (authoritative game dump,
    /// s59) or `scan` (legacy lang-key scan, pre-first-launch fallback).
    #[serde(default = "default_source")]
    source: String,
    jars: Vec<JarMeta>,
    kubejs: Vec<KubejsScriptMeta>,
    items: Vec<ItemRegistryEntry>,
}

fn default_source() -> String {
    "scan".to_string()
}

fn dirs_cache_dir() -> Option<PathBuf> {
    if let Ok(data) = std::env::var("XDG_CACHE_HOME") {
        return Some(PathBuf::from(data).join("modcanvas"));
    }
    if let Ok(home) = std::env::var("HOME") {
        return Some(PathBuf::from(home).join(".cache").join("modcanvas"));
    }
    None
}

fn cache_path(instance_path: &Path) -> PathBuf {
    let mut h = DefaultHasher::new();
    let canonical = fs::canonicalize(instance_path).unwrap_or_else(|_| instance_path.to_path_buf());
    canonical.to_string_lossy().replace('\\', "/").hash(&mut h);
    let hash = format!("{:016x}", h.finish());
    let cache_dir = dirs_cache_dir().unwrap_or_else(|| std::env::temp_dir().join("modcanvas_cache"));
    let _ = fs::create_dir_all(&cache_dir);
    cache_dir.join(format!("items_{}.json", hash))
}

pub(super) fn get_jar_meta(path: &Path) -> Option<JarMeta> {
    let meta = fs::metadata(path).ok()?;
    let size = meta.len();
    let modified = meta
        .modified()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_secs())
        .unwrap_or(0);
    Some(JarMeta {
        file_name: path.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default(),
        size,
        modified,
    })
}

pub(super) fn load_cache(
    instance_path: &Path,
    current_jars: &[(PathBuf, JarMeta)],
    current_kubejs: &[(PathBuf, KubejsScriptMeta)],
) -> Option<Vec<ItemRegistryEntry>> {
    let cp = cache_path(instance_path);
    if !cp.exists() {
        return None;
    }
    let data = fs::read_to_string(&cp).ok()?;
    let cached: ItemIndexerCache = serde_json::from_str(&data).ok()?;

    if cached.version != ITEM_CACHE_VERSION {
        return None;
    }

    if current_jars.len() != cached.jars.len() {
        return None;
    }

    let cached_map: HashMap<&str, &JarMeta> = cached.jars.iter().map(|j| (j.file_name.as_str(), j)).collect();
    let all_match = current_jars.iter().all(|(_path, meta)| {
        cached_map.get(meta.file_name.as_str()).map_or(false, |cm| {
            cm.size == meta.size && cm.modified == meta.modified
        })
    });

    if !all_match {
        return None;
    }

    // KubeJS script fingerprints: any script add/remove/edit invalidates.
    if current_kubejs.len() != cached.kubejs.len() {
        return None;
    }
    let cached_ks: HashMap<&str, &KubejsScriptMeta> = cached.kubejs.iter().map(|k| (k.path.as_str(), k)).collect();
    let kubejs_match = current_kubejs.iter().all(|(_path, meta)| {
        cached_ks.get(meta.path.as_str()).map_or(false, |cm| {
            cm.size == meta.size && cm.modified == meta.modified
        })
    });

    if !kubejs_match {
        return None;
    }

    eprintln!("[Indexer] Cache hit: {} items (source {}) for {}", cached.items.len(), cached.source, instance_path.display());
    Some(cached.items)
}

pub(super) fn save_cache(
    instance_path: &Path,
    current_jars: &[(PathBuf, JarMeta)],
    current_kubejs: &[(PathBuf, KubejsScriptMeta)],
    items: &[ItemRegistryEntry],
    source: &str,
) {
    let jars: Vec<JarMeta> = current_jars.iter().map(|(_, meta)| meta.clone()).collect();
    let kubejs: Vec<KubejsScriptMeta> = current_kubejs.iter().map(|(_, meta)| meta.clone()).collect();
    let cache = ItemIndexerCache {
        version: ITEM_CACHE_VERSION,
        source: source.to_string(),
        jars,
        kubejs,
        items: items.to_vec(),
    };
    let cp = cache_path(instance_path);
    if let Ok(data) = serde_json::to_string(&cache) {
        let _ = fs::write(&cp, &data);
        eprintln!("[Indexer] Cache saved (source {}): {} items for {}", source, items.len(), instance_path.display());
    }
}
