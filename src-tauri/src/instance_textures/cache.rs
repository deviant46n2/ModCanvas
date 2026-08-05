// On-disk texture index cache serialization.
//
// The cache stores only compact source descriptors (jar paths + zip entries,
// absolute kubejs paths) and animation `.mcmeta` JSON — never image bytes. It
// is validated against the current layer metadata on every load so edits to
// jars/kubejs assets are picked up without a forced re-scan.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct CachedFile {
    pub name: String,
    pub size: u64,
    pub modified: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InstanceTextureCache {
    pub version: u32,
    pub layers: Vec<Vec<CachedFile>>,
    pub by_id: HashMap<String, String>,
    /// Texture key → raw `.mcmeta` JSON for textures that carry Minecraft
    /// animation metadata (`<texture>.png.mcmeta`). Keyed with the exact same
    /// key forms as `by_id` so lookups are mirror-image.
    pub animations: HashMap<String, String>,
}

pub fn file_meta(path: &Path) -> Option<CachedFile> {
    let meta = fs::metadata(path).ok()?;
    let modified = meta
        .modified()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_secs())
        .unwrap_or(0);
    Some(CachedFile {
        name: path.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default(),
        size: meta.len(),
        modified,
    })
}

pub fn dirs_cache_dir() -> Option<PathBuf> {
    if let Ok(data) = std::env::var("XDG_CACHE_HOME") {
        return Some(PathBuf::from(data).join("modcanvas"));
    }
    if let Ok(home) = std::env::var("HOME") {
        return Some(PathBuf::from(home).join(".cache").join("modcanvas"));
    }
    None
}

pub fn cache_path(instance_path: &Path) -> PathBuf {
    let hash = {
        use std::collections::hash_map::DefaultHasher;
        use std::hash::{Hash, Hasher};
        let mut h = DefaultHasher::new();
        let canonical = fs::canonicalize(instance_path).unwrap_or_else(|_| instance_path.to_path_buf());
        canonical.to_string_lossy().replace('\\', "/").hash(&mut h);
        format!("{:016x}", h.finish())
    };
    let cache_dir = dirs_cache_dir().unwrap_or_else(|| std::env::temp_dir().join("modcanvas_cache"));
    let _ = fs::create_dir_all(&cache_dir);
    cache_dir.join(format!("instance_textures_{}.json", hash))
}

/// Same per-path hash used by the item indexer and engine-render caches.
fn path_hash(instance_path: &Path) -> String {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};
    let mut h = DefaultHasher::new();
    let canonical = fs::canonicalize(instance_path).unwrap_or_else(|_| instance_path.to_path_buf());
    canonical.to_string_lossy().replace('\\', "/").hash(&mut h);
    format!("{:016x}", h.finish())
}

/// Delete cached index/registry files whose per-path hash is not among the
/// currently-known instances. Stale scans (deleted instances, re-ingests of
/// moved paths, tests) otherwise accumulate as junk — one user had 1,315
/// texture caches totalling ~4.9 GB for two real instances.
///
/// `cache_dir` is passed in (rather than re-deriving from the process-global
/// `XDG_CACHE_HOME`) so the prune test can isolate a temp dir without mutating
/// the env var — which would race every concurrently-running cache test.
pub fn prune_caches(
    known_instance_paths: &[PathBuf],
    known_mods_dirs: &[PathBuf],
    cache_dir: &std::path::Path,
) -> usize {
    let mut keep = std::collections::HashSet::new();
    for p in known_instance_paths {
        keep.insert(path_hash(p));
    }
    for m in known_mods_dirs {
        keep.insert(path_hash(m));
    }
    let mut removed = 0usize;
    let Ok(entries) = fs::read_dir(cache_dir) else {
        return 0;
    };
    let prefixes = ["instance_textures", "items", "engine_renders", "runtime_textures", "ingest", "textures"];
    for entry in entries.filter_map(|e| e.ok()) {
        let path = entry.path();
        let Some(name) = path.file_name().and_then(|n| n.to_str()) else {
            continue;
        };
        let Some(stripped) = name.strip_suffix(".json") else {
            continue;
        };
        let mut matched = false;
        for prefix in prefixes {
            if let Some(hash) = stripped.strip_prefix(prefix).and_then(|r| r.strip_prefix('_')) {
                matched = true;
                if !keep.contains(hash) && fs::remove_file(&path).is_ok() {
                    removed += 1;
                }
                break;
            }
        }
        let _ = matched;
    }
    removed
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn prune_removes_only_non_kept_hashes() {
        let dir = std::env::temp_dir().join(format!("modcanvas_prune_test_{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        let cache_dir = dir.join("cache");
        fs::create_dir_all(&cache_dir).unwrap();

        // A real (existing) known instance whose path-hash goes into the keep set.
        let known_instance = dir.join("instance_a");
        let known_mods = known_instance.join("mods");
        fs::create_dir_all(&known_mods).unwrap();

        // Junk files whose hashes will NOT match the known instance.
        fs::write(cache_dir.join("instance_textures_zz.json"), b"{}").unwrap();
        fs::write(cache_dir.join("items_zz.json"), b"{}").unwrap();
        fs::write(cache_dir.join("ingest_zz.json"), b"{}").unwrap();
        fs::write(cache_dir.join("engine_renders_zz.json"), b"{}").unwrap();
        fs::write(cache_dir.join("notacache_zz.json"), b"{}").unwrap();

        // A genuine cache file for the known instance (computed via the real hash).
        let keep_hash = path_hash(&known_instance);
        fs::write(cache_dir.join(format!("instance_textures_{}.json", keep_hash)), b"{}").unwrap();

        let removed = prune_caches(&[known_instance.clone()], &[known_mods], &cache_dir);

        // Multi-word prefixes must be pruned too (this is the bug regression).
        assert_eq!(removed, 4, "removed {removed}");
        assert!(!cache_dir.join("instance_textures_zz.json").exists());
        assert!(!cache_dir.join("items_zz.json").exists());
        assert!(!cache_dir.join("ingest_zz.json").exists());
        assert!(!cache_dir.join("engine_renders_zz.json").exists());
        // Unrelated files and the genuine kept cache survive.
        assert!(cache_dir.join("notacache_zz.json").exists());
        assert!(cache_dir.join(format!("instance_textures_{}.json", keep_hash)).exists());
        fs::remove_dir_all(&dir).ok();
    }
}

