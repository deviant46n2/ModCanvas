use std::fs;
use std::path::{Path, PathBuf};

use super::models::IngestCache;

/// Cache helpers for `VirtualAssetRegistry`
pub(crate) fn dirs_cache_dir() -> Option<PathBuf> {
    if let Ok(data) = std::env::var("XDG_CACHE_HOME") {
        return Some(PathBuf::from(data).join("modcanvas"));
    }
    if let Ok(home) = std::env::var("HOME") {
        return Some(PathBuf::from(home).join(".cache").join("modcanvas"));
    }
    None
}

pub(crate) fn cache_path(mods_dir: &Path) -> PathBuf {
    let hash = {
        use std::collections::hash_map::DefaultHasher;
        use std::hash::{Hash, Hasher};
        let mut h = DefaultHasher::new();
        // Normalize path: canonicalize to remove symlinks, trailing slashes, etc.
        let canonical = fs::canonicalize(mods_dir).unwrap_or_else(|_| mods_dir.to_path_buf());
        let normalized = canonical.to_string_lossy().replace('\\', "/");
        normalized.hash(&mut h);
        format!("{:016x}", h.finish())
    };
    let cache_dir = dirs_cache_dir().unwrap_or_else(|| std::env::temp_dir().join("modcanvas_cache"));
    let _ = fs::create_dir_all(&cache_dir);
    cache_dir.join(format!("ingest_{}.json", hash))
}

/// Load the ingest cache for a mods directory if it exists.
pub(crate) fn load_ingest_cache(mods_dir: &Path) -> Option<IngestCache> {
    let cache_path = cache_path(mods_dir);
    if !cache_path.exists() {
        return None;
    }
    let data = fs::read_to_string(&cache_path).ok()?;
    serde_json::from_str::<IngestCache>(&data).ok()
}
