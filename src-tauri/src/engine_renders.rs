// Engine-rendered icon cache (companion mod).
//
// Stores base64 PNG data URLs produced by the in-game companion mod's real
// Minecraft item renderer for items ModCanvas's software rasterizer cannot
// bake. This is a separate, versioned disk cache per instance — distinct from
// the compact texture index (which must never hold image bytes). Writes are
// atomic (`.tmp` + rename) per AGENTS.md.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::hash::{DefaultHasher, Hash, Hasher};
use std::path::{Path, PathBuf};

use crate::indexer::find_vanilla_jars;

// s14: bump 2→3 — the s12 per-face shading fix changed renderer semantics;
// a stale cache would serve pre-fix renders.
// s14: bump 3→4 — the s12 GUI_LIGHT_0/1 constants were wrong (mis-transcribed
// setupGui3DDiffuseLighting); the corrected constants + game-pose normal
// matrix change renderer semantics again.
const CACHE_VERSION: u32 = 4;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
struct JarMeta {
    file_name: String,
    size: u64,
    modified: u64,
}

#[derive(Debug, Serialize, Deserialize)]
struct EngineRenderCache {
    version: u32,
    saved_at: u64,
    /// Jar signature at save time. On load, a mismatch means the pack's files
    /// changed, so the cache is discarded and icons are re-rendered once.
    jars: Vec<JarMeta>,
    rendered: HashMap<String, String>,
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

fn cache_path(instance_path: &str) -> PathBuf {
    let mut h = DefaultHasher::new();
    fs::canonicalize(instance_path)
        .unwrap_or_else(|_| PathBuf::from(instance_path))
        .to_string_lossy()
        .replace('\\', "/")
        .hash(&mut h);
    let hash = format!("{:016x}", h.finish());
    let cache_dir = dirs_cache_dir().unwrap_or_else(|| std::env::temp_dir().join("modcanvas_cache"));
    let _ = fs::create_dir_all(&cache_dir);
    cache_dir.join(format!("engine_renders_{}.json", hash))
}

fn now() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

fn jar_meta(path: &Path) -> Option<JarMeta> {
    let meta = fs::metadata(path).ok()?;
    Some(JarMeta {
        file_name: path.file_name()?.to_string_lossy().to_string(),
        size: meta.len(),
        modified: meta
            .modified()
            .ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_secs())
            .unwrap_or_default(),
    })
}

/// Signature of the instance's mod/vanilla jars (name + size + mtime). Used to
/// invalidate the engine-render cache when pack files change, so icons are only
/// re-rendered in-game after a real change.
fn instance_jar_signature(instance_path: &str) -> Vec<JarMeta> {
    let mut jars: Vec<JarMeta> = Vec::new();
    let instance = Path::new(instance_path);

    let mods_dir = instance.join("mods");
    if let Ok(entries) = fs::read_dir(&mods_dir) {
        for entry in entries.filter_map(|e| e.ok()) {
            let path = entry.path();
            if path.extension().map_or(false, |ext| ext == "jar") {
                if let Some(meta) = jar_meta(&path) {
                    jars.push(meta);
                }
            }
        }
    }
    for jar in find_vanilla_jars(instance) {
        if let Some(meta) = jar_meta(&jar) {
            if !jars.contains(&meta) {
                jars.push(meta);
            }
        }
    }
    jars.sort_by(|a, b| a.file_name.cmp(&b.file_name).then(a.size.cmp(&b.size)));
    jars
}

fn read_cache(instance_path: &str) -> HashMap<String, String> {
    let cp = cache_path(instance_path);
    let Ok(data) = fs::read_to_string(&cp) else {
        return HashMap::new();
    };
    let Ok(cached) = serde_json::from_str::<EngineRenderCache>(&data) else {
        return HashMap::new();
    };
    if cached.version != CACHE_VERSION {
        return HashMap::new();
    }
    if cached.jars != instance_jar_signature(instance_path) {
        return HashMap::new();
    }
    cached.rendered
}

fn write_cache(instance_path: &str, rendered: &HashMap<String, String>) {
    let cp = cache_path(instance_path);
    let cache = EngineRenderCache {
        version: CACHE_VERSION,
        saved_at: now(),
        jars: instance_jar_signature(instance_path),
        rendered: rendered.clone(),
    };
    let Ok(json) = serde_json::to_string(&cache) else {
        return;
    };
    let tmp = cp.with_extension("json.tmp");
    if fs::write(&tmp, &json).is_ok() {
        let _ = fs::rename(&tmp, &cp);
    }
}

/// Load the cached engine-rendered icons for an instance (item id → data URL).
#[tauri::command]
pub fn get_engine_renders_cmd(instance_path: String) -> Result<HashMap<String, String>, String> {
    Ok(read_cache(&instance_path))
}

/// Merge freshly-rendered icons into the instance's engine-render cache and
/// persist atomically. Existing entries are kept; new ones win.
#[tauri::command]
pub fn save_engine_renders_cmd(
    instance_path: String,
    rendered: HashMap<String, String>,
) -> Result<usize, String> {
    let mut all = read_cache(&instance_path);
    let mut added = 0usize;
    for (id, url) in rendered {
        if url.is_empty() {
            continue;
        }
        all.insert(id, url);
        added += 1;
    }
    write_cache(&instance_path, &all);
    Ok(added)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn save_then_load_roundtrip() {
        let dir = std::env::temp_dir().join(format!("modcanvas_engine_renders_test_{}", std::process::id()));
        let instance = dir.join("instance").to_string_lossy().to_string();
        fs::create_dir_all(&dir).unwrap();

        let mut rendered = HashMap::new();
        rendered.insert("minecraft:diamond".to_string(), "data:image/png;base64,AAAA".to_string());
        rendered.insert("modid:item".to_string(), "data:image/png;base64,BBBB".to_string());

        let added = save_engine_renders_cmd(instance.clone(), rendered).unwrap();
        assert_eq!(added, 2);

        let loaded = get_engine_renders_cmd(instance.clone()).unwrap();
        assert_eq!(loaded.get("minecraft:diamond").map(String::as_str), Some("data:image/png;base64,AAAA"));
        assert_eq!(loaded.get("modid:item").map(String::as_str), Some("data:image/png;base64,BBBB"));

        // Merge keeps existing entries and overwrites known keys.
        let mut more = HashMap::new();
        more.insert("minecraft:iron_ingot".to_string(), "data:image/png;base64,CCCC".to_string());
        more.insert("minecraft:diamond".to_string(), "data:image/png;base64,DDDD".to_string());
        let added2 = save_engine_renders_cmd(instance.clone(), more).unwrap();
        assert_eq!(added2, 2);
        let loaded2 = get_engine_renders_cmd(instance.clone()).unwrap();
        assert_eq!(loaded2.len(), 3);
        assert_eq!(loaded2.get("minecraft:diamond").map(String::as_str), Some("data:image/png;base64,DDDD"));

        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn empty_and_missing_instance_are_tolerated() {
        let dir = std::env::temp_dir().join(format!("modcanvas_engine_renders_missing_{}", std::process::id()));
        let instance = dir.join("nope").to_string_lossy().to_string();
        let loaded = get_engine_renders_cmd(instance).unwrap();
        assert!(loaded.is_empty());
    }

    #[test]
    fn cache_version_mismatch_ignores_stale_data() {
        let dir = std::env::temp_dir().join(format!("modcanvas_engine_renders_ver_{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        let instance = dir.join("instance").to_string_lossy().to_string();

        let cp = cache_path(&instance);
        let stale = EngineRenderCache {
            version: CACHE_VERSION + 99,
            saved_at: 0,
            jars: instance_jar_signature(&instance),
            rendered: HashMap::from([("minecraft:dirt".to_string(), "data:image/png;base64,ZZ".to_string())]),
        };
        fs::write(&cp, serde_json::to_string(&stale).unwrap()).unwrap();

        let loaded = get_engine_renders_cmd(instance).unwrap();
        assert!(loaded.is_empty());
        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn jar_change_invalidates_cache() {
        let dir = std::env::temp_dir().join(format!("modcanvas_engine_renders_jar_{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        fs::create_dir_all(dir.join("instance").join("mods")).unwrap();
        let instance = dir.join("instance").to_string_lossy().to_string();

        // Seed a cache for the (empty) current jar set.
        let mut rendered = HashMap::new();
        rendered.insert("minecraft:stone".to_string(), "data:image/png;base64,SS".to_string());
        save_engine_renders_cmd(instance.clone(), rendered).unwrap();

        // Add a mod jar -> signature changes -> cache must be discarded.
        let jar = dir.join("instance").join("mods").join("mymod.jar");
        fs::write(&jar, b"fake jar contents").unwrap();

        let loaded = get_engine_renders_cmd(instance).unwrap();
        assert!(loaded.is_empty());
        fs::remove_dir_all(&dir).ok();
    }
}
