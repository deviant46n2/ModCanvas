use pixels::{merge_archive, merge_dir};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

const CACHE_VERSION: u32 = 4;

mod models;
mod pixels;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
struct CachedFile {
    name: String,
    size: u64,
    modified: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct InstanceTextureCache {
    version: u32,
    layers: Vec<Vec<CachedFile>>,
    by_id: HashMap<String, String>,
}

fn file_meta(path: &Path) -> Option<CachedFile> {
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

fn jars_under(dir: &Path) -> Vec<PathBuf> {
    let mut out: Vec<PathBuf> = Vec::new();
    let mut stack: Vec<PathBuf> = vec![dir.to_path_buf()];
    while let Some(d) = stack.pop() {
        for entry in fs::read_dir(&d).ok().into_iter().flatten().flatten() {
            let path = entry.path();
            if path.is_dir() {
                stack.push(path);
            } else if path.extension().map_or(false, |e| e == "jar") {
                out.push(path);
            }
        }
    }
    out.sort();
    out
}

/// Locate the vanilla client jar for this instance. Prefers a jar matching the
/// instance's Minecraft version (from `version.json`), falling back to the
/// sorted set of candidate jars.
fn vanilla_jars(instance_path: &Path) -> Vec<PathBuf> {
    let candidates = {
        let mut jars = jars_under(&instance_path.join("versions"));
        if let Ok(home) = std::env::var("HOME") {
            jars.extend(jars_under(&Path::new(&home).join(".ftba").join("bin").join("versions")));
        }
        jars.sort();
        jars
    };
    if candidates.is_empty() {
        return candidates;
    }
    let mc_version = fs::read_to_string(instance_path.join("version.json"))
        .ok()
        .and_then(|txt| txt.find("\"id\"").map(|i| {
            let after = &txt[i + 5..];
            let start = after.find('"').map(|s| s + 1).unwrap_or(0);
            let rest = &after[start..];
            rest.find('"').map(|e| rest[..e].to_string()).unwrap_or_default()
        }))
        .filter(|v| !v.is_empty());
    if let Some(ver) = mc_version {
        let matched: Vec<PathBuf> = candidates
            .iter()
            .filter(|p| p.to_string_lossy().contains(&format!("/{}/", ver)))
            .cloned()
            .collect();
        if !matched.is_empty() {
            return matched;
        }
    }
    candidates
}

/// Resource pack load order from `options.txt` (last listed = highest
/// priority). Falls back to sorted filenames when absent.
fn resource_pack_order(instance_path: &Path) -> Vec<String> {
    let mut names: Vec<String> = Vec::new();
    if let Ok(txt) = fs::read_to_string(instance_path.join("options.txt")) {
        if let Some(start) = txt.find("resourcePacks:") {
            let after = &txt[start + "resourcePacks:".len()..];
            let bytes: Vec<char> = after.lines().next().unwrap_or("").trim().chars().collect();
            let mut i = 0;
            while i < bytes.len() {
                if bytes[i] == ']' {
                    break;
                }
                if bytes[i] == '"' {
                    let mut s = String::new();
                    i += 1;
                    while i < bytes.len() && bytes[i] != '"' {
                        s.push(bytes[i]);
                        i += 1;
                    }
                    if !s.is_empty() {
                        names.push(s);
                    }
                }
                i += 1;
            }
        }
    }
    if names.is_empty() {
        let mut dirs: Vec<String> = fs::read_dir(instance_path.join("resourcepacks"))
            .ok()
            .into_iter()
            .flatten()
            .flatten()
            .filter(|e| e.path().extension().map_or(false, |e| e == "zip" || e == "jar"))
            .map(|e| e.file_name().to_string_lossy().to_string())
            .collect();
        dirs.sort();
        return dirs;
    }
    names.into_iter().filter(|n| n != "vanilla").map(|n| n.trim_start_matches("file/").to_string()).collect()
}

pub fn scan_instance_textures(instance_path: &Path) -> HashMap<String, String> {
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
                    return cached.by_id;
                }
            }
        }
    }

    let mut by_id: HashMap<String, pixels::Winner> = HashMap::new();
    for jar in &vanilla {
        merge_archive(&mut by_id, 0, jar);
    }
    for jar in &mods {
        merge_archive(&mut by_id, 1, jar);
    }
    for pack in &packs {
        merge_archive(&mut by_id, 2, pack);
    }
    if kubejs.exists() {
        merge_dir(&mut by_id, 3, &kubejs);
    }

    let mut out: HashMap<String, String> = by_id.into_iter().map(|(k, w)| (k, w.url)).collect();

    // Resolve item ids that only exist as JSON models (apotheosis gems, seeds,
    // tools, block-parented items) into bare keys so direct lookups hit.
    let models = models::Models::scan(instance_path, &vanilla, &mods, &packs);
    for (key, url) in models.resolve_bare_keys(&out) {
        out.insert(key, url);
    }

    let cache = InstanceTextureCache { version: CACHE_VERSION, layers, by_id: out.clone() };
    if let Ok(data) = serde_json::to_string(&cache) {
        let _ = crate::path_safety::atomic_write_str(&cp, &data);
    }
    out
}

#[tauri::command]
pub fn scan_instance_textures_cmd(instance_path: String) -> Result<HashMap<String, String>, String> {
    let path = std::path::Path::new(&instance_path);
    let by_id = scan_instance_textures(path);
    Ok(by_id)
}

#[cfg(test)]
mod tests;
