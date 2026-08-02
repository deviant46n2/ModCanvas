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
