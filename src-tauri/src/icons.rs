use base64::Engine;
use base64::engine::general_purpose::STANDARD;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};
use zip::ZipArchive;

#[derive(Debug, Clone, Serialize)]
pub struct TextureEntry {
    pub namespace: String,
    pub path: String,
    pub item_id: String,
    pub data_url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct CachedJarMeta {
    file_name: String,
    size: u64,
    modified: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct TextureCache {
    jars: Vec<CachedJarMeta>,
    by_item_id: HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct JarTextureIndex {
    pub textures: Vec<TextureEntry>,
    pub by_item_id: HashMap<String, String>,
}

fn item_id_to_texture_path(item_id: &str) -> Option<(&str, &str)> {
    let parts: Vec<&str> = item_id.splitn(2, ':').collect();
    if parts.len() != 2 {
        return None;
    }
    Some((parts[0], parts[1]))
}

fn texture_path_candidates(namespace: &str, path: &str) -> Vec<String> {
    let path = path.replace('\\', "/");
    let mut candidates = vec![
        format!("assets/{}/textures/item/{}.png", namespace, path),
        format!("assets/{}/textures/block/{}.png", namespace, path),
        format!("assets/{}/textures/model/{}.png", namespace, path),
    ];
    if path.contains('/') {
        candidates.push(format!("assets/{}/textures/{}.png", namespace, path));
    } else {
        // For bare names, also try textures/ directly
        candidates.push(format!("assets/{}/textures/{}.png", namespace, path));
    }
    candidates
}

pub fn scan_jar_for_textures(jar_path: &Path) -> anyhow::Result<Vec<TextureEntry>> {
    let file = fs::File::open(jar_path)?;
    let mut archive = ZipArchive::new(file)?;
    let mut entries = Vec::new();

    for i in 0..archive.len() {
        let mut entry = match archive.by_index(i) {
            Ok(e) => e,
            Err(_) => continue,
        };

        let raw_name = entry.name().to_string();
        if !raw_name.ends_with(".png") {
            continue;
        }

        // Normalize any backslashes to forward slashes (Windows zip compat)
        let name = raw_name.replace('\\', "/");

        let parts: Vec<&str> = name.split('/').collect();
        if parts.len() < 4 {
            continue;
        }

        if parts[0] != "assets" {
            continue;
        }

        let namespace = parts[1];
        let textures_prefix = format!("assets/{}/textures/", namespace);
        let rest = &name[textures_prefix.len()..];

        let item_id = rest.strip_suffix(".png").unwrap_or(rest).to_string();
        let id = format!("{}:{}", namespace, item_id);
        let full_id = format!("{}:textures/{}", namespace, rest);  // e.g. atm:textures/questpics/chap3/creative_star.png
        let mut buf = Vec::new();
        if entry.read_to_end(&mut buf).is_ok() && !buf.is_empty() {
            let b64 = STANDARD.encode(&buf);
            let data_url = format!("data:image/png;base64,{}", b64);
            entries.push(TextureEntry {
                namespace: namespace.to_string(),
                path: name.clone(),
                item_id: id,
                data_url: data_url.clone(),
            });
            // Also add a second entry with the full textures/ path for direct SNBT fallback
            entries.push(TextureEntry {
                namespace: namespace.to_string(),
                path: name,
                item_id: full_id,
                data_url,
            });
        }
    }

    Ok(entries)
}

fn get_jar_meta(path: &Path) -> Option<CachedJarMeta> {
    let meta = fs::metadata(path).ok()?;
    let size = meta.len();
    let modified = meta.modified()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_secs())
        .unwrap_or(0);
    Some(CachedJarMeta {
        file_name: path.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default(),
        size,
        modified,
    })
}

pub(crate) fn cache_path(mods_dir: &Path) -> PathBuf {
    let hash = {
        use std::collections::hash_map::DefaultHasher;
        use std::hash::{Hash, Hasher};
        let mut h = DefaultHasher::new();
        // Normalize separators to forward slashes for cross-platform cache key consistency
        let normalized = mods_dir.to_string_lossy().replace('\\', "/");
        normalized.hash(&mut h);
        format!("{:016x}", h.finish())
    };
    let cache_dir = dirs_cache_dir().unwrap_or_else(|| std::env::temp_dir().join("modcanvas_cache"));
    let _ = fs::create_dir_all(&cache_dir);
    cache_dir.join(format!("textures_{}.json", hash))
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

fn load_cache(mods_dir: &Path) -> Option<TextureCache> {
    let path = cache_path(mods_dir);
    let data = fs::read_to_string(&path).ok()?;
    serde_json::from_str(&data).ok()
}

fn save_cache(mods_dir: &Path, cache: &TextureCache) {
    let path = cache_path(mods_dir);
    if let Ok(data) = serde_json::to_string(cache) {
        let _ = crate::path_safety::atomic_write_str(&path, &data);
    }
}

pub fn scan_directory_for_jar_textures(mods_dir: &Path) -> JarTextureIndex {
    let mut by_item_id: HashMap<String, String> = HashMap::new();
    let mut all_textures = Vec::new();

    if !mods_dir.exists() {
        return JarTextureIndex {
            textures: all_textures,
            by_item_id,
        };
    }

    let current_jars: Vec<(PathBuf, CachedJarMeta)> = {
        let entries = match fs::read_dir(mods_dir) {
            Ok(e) => e,
            Err(_) => return JarTextureIndex { textures: all_textures, by_item_id },
        };
        entries
            .filter_map(|e| e.ok())
            .map(|e| e.path())
            .filter(|p| p.extension().map_or(false, |ext| ext == "jar"))
            .filter_map(|p| {
                let meta = get_jar_meta(&p)?;
                Some((p, meta))
            })
            .collect()
    };

    if let Some(cached) = load_cache(mods_dir) {
        let cached_meta_set: HashMap<String, &CachedJarMeta> = cached.jars.iter()
            .map(|j| (j.file_name.clone(), j))
            .collect();

        let all_current_match = current_jars.len() == cached.jars.len()
            && current_jars.iter().all(|(_, meta)| {
                cached_meta_set.get(&meta.file_name)
                    .map_or(false, |cm| cm.size == meta.size && cm.modified == meta.modified)
            });

        if all_current_match {
            for (item_id, data_url) in &cached.by_item_id {
                by_item_id.insert(item_id.clone(), data_url.clone());
            }
            eprintln!("[ModCanvas] Texture cache hit: {} icons from {}", by_item_id.len(), mods_dir.display());
            return JarTextureIndex {
                textures: by_item_id.iter().map(|(id, url)| {
                    let parts: Vec<&str> = id.splitn(2, ':').collect();
                    TextureEntry {
                        namespace: parts.get(0).unwrap_or(&"").to_string(),
                        path: String::new(),
                        item_id: id.clone(),
                        data_url: url.clone(),
                    }
                }).collect(),
                by_item_id,
            };
        }
    }

    eprintln!("[ModCanvas] Scanning {} jar files in {}...", current_jars.len(), mods_dir.display());

    fn short_key(full_key: &str) -> String {
        // Strip namespace then try to extract a short item/block key from the path
        let (_ns, rest) = full_key.split_once(':').unwrap_or(("", full_key));

        // Handle paths still containing textures/ prefix (e.g. minecraft:textures/item/diamond)
        if let Some(stripped) = rest
            .strip_prefix("textures/item/").or_else(|| rest.strip_prefix("textures/block/"))
            .or_else(|| rest.strip_prefix("textures/model/"))
        {
            return format!("{}:{}", full_key.split(':').next().unwrap_or(""), stripped);
        }
        // Handle textures/ prefix without item/block (e.g. atm:textures/quest/star)
        if let Some(stripped) = rest.strip_prefix("textures/") {
            return format!("{}:{}", full_key.split(':').next().unwrap_or(""), stripped);
        }

        // Handle item/block/model/ prefixes directly (already stripped of textures/)
        if let Some(stripped) = rest
            .strip_prefix("item/").or_else(|| rest.strip_prefix("block/"))
            .or_else(|| rest.strip_prefix("model/"))
        {
            return format!("{}:{}", full_key.split(':').next().unwrap_or(""), stripped);
        }

        full_key.to_string()
    }

    for (jar_path, _) in &current_jars {
        match scan_jar_for_textures(jar_path) {
            Ok(textures) => {
                for tex in textures {
                    by_item_id.insert(tex.item_id.clone(), tex.data_url.clone());
                    let short = short_key(&tex.item_id);
                    if short != tex.item_id {
                        by_item_id.entry(short).or_insert_with(|| tex.data_url.clone());
                    }
                    all_textures.push(tex);
                }
            }
            Err(e) => {
                eprintln!("[ModCanvas] Failed to scan jar {}: {}", jar_path.display(), e);
            }
        }
    }

    let cache = TextureCache {
        jars: current_jars.into_iter().map(|(_, meta)| meta).collect(),
        by_item_id: by_item_id.clone(),
    };
    save_cache(mods_dir, &cache);

    eprintln!("[ModCanvas] Cached {} icons for {}", by_item_id.len(), mods_dir.display());

    JarTextureIndex {
        textures: all_textures,
        by_item_id,
    }
}

pub fn get_texture_from_jar(jar_path: &Path, item_id: &str) -> anyhow::Result<Option<String>> {
    let (namespace, path) = match item_id_to_texture_path(item_id) {
        Some(p) => p,
        None => return Ok(None),
    };

    let file = fs::File::open(jar_path)?;
    let mut archive = ZipArchive::new(file)?;

    for candidate in texture_path_candidates(namespace, path) {
        for i in 0..archive.len() {
            let mut entry = match archive.by_index(i) {
                Ok(e) => e,
                Err(_) => continue,
            };
            if entry.name() == candidate {
                let mut buf = Vec::new();
                if entry.read_to_end(&mut buf).is_ok() && !buf.is_empty() {
                    let b64 = STANDARD.encode(&buf);
                    return Ok(Some(format!("data:image/png;base64,{}", b64)));
                }
            }
        }
    }

    Ok(None)
}

pub fn get_pack_icon(mrpack_or_dir: &Path) -> Option<String> {
    if mrpack_or_dir.is_dir() {
        let icon_path = mrpack_or_dir.join("pack.png");
        if icon_path.exists() {
            if let Ok(bytes) = fs::read(&icon_path) {
                let b64 = STANDARD.encode(&bytes);
                return Some(format!("data:image/png;base64,{}", b64));
            }
        }
        let icon_path = mrpack_or_dir.join("icon.png");
        if icon_path.exists() {
            if let Ok(bytes) = fs::read(&icon_path) {
                let b64 = STANDARD.encode(&bytes);
                return Some(format!("data:image/png;base64,{}", b64));
            }
        }
        None
    } else {
        let file = fs::File::open(mrpack_or_dir).ok()?;
        let mut archive = ZipArchive::new(file).ok()?;
        for i in 0..archive.len() {
            let mut entry = archive.by_index(i).ok()?;
            let name = entry.name();
            if name == "pack.png" || name == "icon.png" {
                let mut buf = Vec::new();
                if entry.read_to_end(&mut buf).is_ok() && !buf.is_empty() {
                    let b64 = STANDARD.encode(&buf);
                    return Some(format!("data:image/png;base64,{}", b64));
                }
            }
        }
        None
    }
}
