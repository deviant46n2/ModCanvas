// On-disk cache for the pack recipe scan. Keyed on a fingerprint of every
// recipe-bearing file (jar/data/scripts) so reloads are instant when nothing
// changed, and invalidated automatically when any file is added/removed/edited.
//
// Mirrors the instance_textures/icons cache discipline: the cache stores the
// scan result (descriptors only — never image bytes), validated against the
// current file set on every load.

use crate::recipes::DiscoveredRecipe;
use serde::{Deserialize, Serialize};
use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use std::path::{Path, PathBuf};

const CACHE_VERSION: u32 = 1;

#[derive(Debug, Clone, Serialize, Deserialize)]
struct FileMeta {
    path: String,
    len: u64,
    mtime: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct RecipeCache {
    version: u32,
    fingerprint: u64,
    recipes: Vec<DiscoveredRecipe>,
}

fn cache_dir() -> PathBuf {
    if let Ok(data) = std::env::var("XDG_CACHE_HOME") {
        return PathBuf::from(data).join("modcanvas");
    }
    if let Ok(home) = std::env::var("HOME") {
        return PathBuf::from(home).join(".cache").join("modcanvas");
    }
    std::env::temp_dir().join("modcanvas_cache")
}

fn cache_path(project_path: &Path) -> PathBuf {
    let mut h = DefaultHasher::new();
    project_path.to_string_lossy().replace('\\', "/").hash(&mut h);
    cache_dir().join(format!("recipes_{:016x}.json", h.finish()))
}

/// Walk a directory for files matching one of the extensions, collecting
/// (path, len, mtime) metadata. Skips unreadable entries.
fn collect_files(dir: &Path, exts: &[&str], out: &mut Vec<FileMeta>) {
    let Ok(entries) = std::fs::read_dir(dir) else { return };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            collect_files(&path, exts, out);
            continue;
        }
        let ext_matches = path
            .extension()
            .and_then(|e| e.to_str())
            .map(|e| exts.contains(&e))
            .unwrap_or(false);
        if !ext_matches {
            continue;
        }
        if let Ok(meta) = entry.metadata() {
            out.push(FileMeta {
                path: path.to_string_lossy().to_string(),
                len: meta.len(),
                mtime: meta
                    .modified()
                    .map(|m| m.duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs() as i64).unwrap_or(0))
                    .unwrap_or(0),
            });
        }
    }
}

/// Compute the fingerprint of every recipe-bearing file under a project.
fn fingerprint(project_path: &Path) -> u64 {
    let mut metas = Vec::new();
    collect_files(&project_path.join("mods"), &["jar", "zip"], &mut metas);
    collect_files(&project_path.join("data"), &["json"], &mut metas);
    collect_files(&project_path.join("kubejs").join("server_scripts"), &["js"], &mut metas);
    collect_files(&project_path.join("scripts"), &["zs"], &mut metas);
    metas.sort_by(|a, b| a.path.cmp(&b.path));

    let mut h = DefaultHasher::new();
    for m in &metas {
        m.path.hash(&mut h);
        m.len.hash(&mut h);
        m.mtime.hash(&mut h);
    }
    // Include CACHE_VERSION so schema changes invalidate old caches.
    CACHE_VERSION.hash(&mut h);
    h.finish()
}

/// Try to load the cached scan for this project. Returns `None` when the
/// cache is missing, stale, or unreadable.
pub fn load(project_path: &Path) -> Option<Vec<DiscoveredRecipe>> {
    let path = cache_path(project_path);
    let data = std::fs::read_to_string(&path).ok()?;
    let cached: RecipeCache = serde_json::from_str(&data).ok()?;
    if cached.version != CACHE_VERSION {
        return None;
    }
    if cached.fingerprint != fingerprint(project_path) {
        return None;
    }
    Some(cached.recipes)
}

/// Persist a fresh scan. Best-effort; failures are ignored.
pub fn save(project_path: &Path, recipes: &[DiscoveredRecipe]) {
    let cache = RecipeCache {
        version: CACHE_VERSION,
        fingerprint: fingerprint(project_path),
        recipes: recipes.to_vec(),
    };
    let path = cache_path(project_path);
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    if let Ok(data) = serde_json::to_string(&cache) {
        let _ = crate::path_safety::atomic_write_str(&path, &data);
    }
}

/// Force-invalidate the cache for a project (used after manual edits).
pub fn invalidate(project_path: &Path) {
    let path = cache_path(project_path);
    let _ = std::fs::remove_file(path);
}
