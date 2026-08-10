//! Per-instance texture index: scan jar/kubejs/assets sources into a compact
//! key → descriptor map, backed by an on-disk cache validated against layer
//! metadata. Animation `.mcmeta` metadata is merged in the same pass.

use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, OnceLock};

use super::cache::{cache_path, file_meta, CachedFile, InstanceTextureCache};
use super::layers::{jars_under, resource_pack_order, vanilla_jars};
use super::models;
use super::pixels;
use super::CACHE_VERSION;

/// In-memory memo of the compact per-instance index so repeated scan/materialize
/// commands don't re-read the disk cache (10-20 MB) on every call.
static INDEX_MEMO: OnceLock<Mutex<HashMap<String, Arc<HashMap<String, String>>>>> = OnceLock::new();

/// Same-purpose memo for the per-instance animation metadata map. Kept
/// separate from [`INDEX_MEMO`] (like the tag index) so batch materialization
/// never has to re-scan for animation data.
static ANIM_MEMO: OnceLock<Mutex<HashMap<String, Arc<HashMap<String, String>>>>> = OnceLock::new();

/// Memo of the per-instance merged item/block model set, used to classify item
/// ids as flat textures vs `bake:` (needs in-game render) at scan time.
/// Populated by the cache-miss scan.
static MODEL_MEMO: OnceLock<Mutex<HashMap<String, Arc<models::Models>>>> = OnceLock::new();

fn memo_cache() -> &'static Mutex<HashMap<String, Arc<HashMap<String, String>>>> {
    INDEX_MEMO.get_or_init(|| Mutex::new(HashMap::new()))
}

fn anim_memo_cache() -> &'static Mutex<HashMap<String, Arc<HashMap<String, String>>>> {
    ANIM_MEMO.get_or_init(|| Mutex::new(HashMap::new()))
}

fn model_memo_cache() -> &'static Mutex<HashMap<String, Arc<models::Models>>> {
    MODEL_MEMO.get_or_init(|| Mutex::new(HashMap::new()))
}

pub fn scan_instance_textures(instance_path: &Path) -> HashMap<String, String> {
    // Always validate the on-disk cache (jar/kubejs changes must be picked up);
    // memoize afterwards so batch materialization reuses the same index.
    let (by_id, _) = build_index_maps(instance_path);
    let arc = Arc::new(by_id);
    let key = instance_path.to_string_lossy().to_string();
    if let Ok(mut g) = memo_cache().lock() {
        g.insert(key, arc.clone());
    }
    arc.as_ref().clone()
}

/// Compact per-instance texture index: key → source descriptor (`jar:<path>!<zip>`
/// or an absolute kubejs file path). Loaded from the on-disk cache when valid,
/// otherwise built by enumerating archive entries (no bytes read) and cached.
pub(super) fn compact_index(instance_path: &Path) -> Arc<HashMap<String, String>> {
    let key = instance_path.to_string_lossy().to_string();
    if let Some(arc) = memo_cache().lock().ok().and_then(|g| g.get(&key).cloned()) {
        return arc;
    }
    let (by_id, _) = build_index_maps(instance_path);
    let arc = Arc::new(by_id);
    if let Ok(mut g) = memo_cache().lock() {
        g.insert(key, arc.clone());
    }
    arc
}

/// Per-instance merged item/block model set (memoized per instance path).
/// Used to classify item ids into flat textures vs `bake:` descriptors during
/// the scan; scanned once per process per instance.
fn models_for(instance_path: &Path) -> Arc<models::Models> {
    let key = instance_path.to_string_lossy().to_string();
    if let Some(arc) = model_memo_cache().lock().ok().and_then(|g| g.get(&key).cloned()) {
        return arc;
    }
    let vanilla = vanilla_jars(instance_path);
    let mods = jars_under(&instance_path.join("mods"));
    let packs: Vec<PathBuf> = resource_pack_order(instance_path)
        .iter()
        .filter_map(|name| {
            let p = instance_path.join("resourcepacks").join(name);
            if p.exists() { Some(p) } else { None }
        })
        .collect();
    let m = models::Models::scan(instance_path, &vanilla, &mods, &packs);
    let arc = Arc::new(m);
    if let Ok(mut g) = model_memo_cache().lock() {
        g.insert(key, arc.clone());
    }
    arc
}

/// Per-instance animation metadata index (texture key → `.mcmeta` JSON).
pub fn build_animation_index(instance_path: &Path) -> Arc<HashMap<String, String>> {
    let key = instance_path.to_string_lossy().to_string();
    if let Some(arc) = anim_memo_cache().lock().ok().and_then(|g| g.get(&key).cloned()) {
        return arc;
    }
    let (_, animations) = build_index_maps(instance_path);
    let arc = Arc::new(animations);
    if let Ok(mut g) = anim_memo_cache().lock() {
        g.insert(key, arc.clone());
    }
    arc
}

/// Build (texture index, animation metadata map) for an instance in one scan.
/// The two share the same on-disk cache file and layer validation, so they are
/// always produced from the same archive state.
fn build_index_maps(instance_path: &Path) -> (HashMap<String, String>, HashMap<String, String>) {
    let mut layers: Vec<Vec<CachedFile>> = Vec::new();

    let vanilla: Vec<PathBuf> = vanilla_jars(instance_path);
    layers.push(vanilla.iter().filter_map(|p| file_meta(p)).collect());

    let mods: Vec<PathBuf> = jars_under(&instance_path.join("mods"));
    layers.push(mods.iter().filter_map(|p| file_meta(p)).collect());

    let pack_order = resource_pack_order(instance_path);
    let packs: Vec<PathBuf> = pack_order
        .iter()
        .filter_map(|name| {
            let p = instance_path.join("resourcepacks").join(name);
            if p.exists() { Some(p) } else { None }
        })
        .collect();
    layers.push(packs.iter().filter_map(|p| file_meta(p)).collect());

    let kubejs = instance_path.join("kubejs").join("assets");
    let mut kubejs_metas: Vec<CachedFile> = Vec::new();
    if kubejs.exists() {
        let mut stack = vec![kubejs.clone()];
        while let Some(dir) = stack.pop() {
            for entry in fs::read_dir(&dir).ok().into_iter().flatten().flatten() {
                let path = entry.path();
                if path.is_dir() {
                    stack.push(path);
                } else {
                    let is_png = path.extension().map_or(false, |e| e == "png");
                    let rel = path.strip_prefix(&kubejs).unwrap_or(&path).to_string_lossy().replace('\\', "/");
                    let is_model = path.extension().map_or(false, |e| e == "json") && rel.contains("/models/");
                    if !is_png && !is_model {
                        continue;
                    }
                    if let Ok(meta) = fs::metadata(&path) {
                        let modified = meta
                            .modified()
                            .ok()
                            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                            .map(|d| d.as_secs())
                            .unwrap_or(0);
                        kubejs_metas.push(CachedFile {
                            name: rel,
                            size: meta.len(),
                            modified,
                        });
                    }
                }
            }
        }
    }
    kubejs_metas.sort_by(|a, b| a.name.cmp(&b.name));
    layers.push(kubejs_metas.clone());

    let cp = cache_path(instance_path);
    if cp.exists() {
        if let Ok(data) = fs::read_to_string(&cp) {
            if let Ok(cached) = serde_json::from_str::<InstanceTextureCache>(&data) {
                if cached.version == CACHE_VERSION && cached.layers == layers {
                    return (cached.by_id, cached.animations);
                }
            }
        }
    }

    // Cache miss: drop any memoized model set for this instance so the fresh
    // scan below re-resolves model files (a stale MODEL_MEMO would keep baking
    // with pre-edit model JSON after a kubejs/jar model change).
    let memo_key = instance_path.to_string_lossy().to_string();
    if let Ok(mut g) = model_memo_cache().lock() {
        g.remove(&memo_key);
    }

    let mut by_id: HashMap<String, pixels::Winner> = HashMap::new();
    let mut mcmeta: HashMap<String, String> = HashMap::new();
    for jar in &vanilla {
        pixels::merge_archive_ex(&mut by_id, 0, jar, Some(&mut mcmeta));
    }
    for jar in &mods {
        pixels::merge_archive_ex(&mut by_id, 1, jar, Some(&mut mcmeta));
    }
    for pack in &packs {
        pixels::merge_archive_ex(&mut by_id, 2, pack, Some(&mut mcmeta));
    }
    if kubejs.exists() {
        pixels::merge_dir_ex(&mut by_id, 3, &kubejs, Some(&mut mcmeta));
    }

    let mut out: HashMap<String, String> = by_id.into_iter().map(|(k, w)| (k, w.source)).collect();

    // Resolve item ids that only exist as JSON models (apotheosis gems, seeds,
    // tools, block-parented items) into bare keys so direct lookups hit.
    // Block/3D items resolve to `bake:` descriptors that signal the companion
    // engine-render pipeline (they are never materialized offline).
    let models = models_for(instance_path);
    for (key, url) in models.resolve_bare_keys(&out) {
        out.insert(key, url);
    }

    // Attach animation metadata to every texture key whose winning source has
    // an adjacent `.png.mcmeta` (the mcmeta from the same archive that won the
    // PNG, so layer priority is respected automatically).
    let animations = attach_animations(&out, &mcmeta);

    let cache = InstanceTextureCache {
        version: CACHE_VERSION,
        layers,
        by_id: out.clone(),
        animations: animations.clone(),
    };
    if let Ok(data) = serde_json::to_string(&cache) {
        let _ = crate::path_safety::atomic_write_str(&cp, &data);
    }
    (out, animations)
}

/// For each indexed texture key, look up the adjacent `.mcmeta` animation file
/// in the same archive/kubejs dir that provided the winning PNG source.
fn attach_animations(
    out: &HashMap<String, String>,
    mcmeta: &HashMap<String, String>,
) -> HashMap<String, String> {
    let mut animations: HashMap<String, String> = HashMap::new();
    for (key, src) in out {
        if src.starts_with("bake:") {
            continue;
        }
        let png_path = if let Some(rest) = src.strip_prefix("jar:") {
            rest.split_once('!').map(|(_, internal)| internal).unwrap_or("")
        } else {
            src.as_str()
        };
        let Some(json) = mcmeta.get(png_path) else { continue };
        if json_has_animation(json) {
            animations.insert(key.clone(), json.clone());
        }
    }
    animations
}

/// True when the `.mcmeta` JSON carries a Minecraft `animation` section.
fn json_has_animation(json: &str) -> bool {
    match serde_json::from_str::<serde_json::Value>(json) {
        Ok(v) => v.get("animation").is_some_and(serde_json::Value::is_object),
        Err(_) => false,
    }
}
