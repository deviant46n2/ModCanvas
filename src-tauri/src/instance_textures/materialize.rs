// Lazy materialization of texture keys to data URLs.
//
// Reads PNG bytes only on demand (batch per jar, capped by the frontend's
// BATCH_SIZE). `bake:` descriptors are NOT materialized here: those are 3D
// models that need the real Minecraft renderer, so they are left to the
// companion mod (engine-render pipeline) and never become data URLs offline.
// No image bytes are ever stored in the index cache.

use super::index::compact_index;
use std::collections::{HashMap, VecDeque};
use std::fs::{self, File};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, OnceLock};
use zip::ZipArchive;

/// Max open ZipArchive handles kept in the process-wide cache. Reusing handles
/// avoids re-parsing each jar's central directory on every materialize batch
/// (a 50k-entry jar costs ~78ms to open), which dominated materialization time
/// on large modpacks. LRU eviction keeps memory bounded.
const JAR_CACHE_CAP: usize = 256;

type JarKey = (PathBuf, u64, u64);
type JarHandle = Arc<Mutex<ZipArchive<File>>>;

fn jar_archive_cache() -> &'static Mutex<(HashMap<JarKey, JarHandle>, VecDeque<JarKey>)> {
    static CACHE: OnceLock<Mutex<(HashMap<JarKey, JarHandle>, VecDeque<JarKey>)>> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new((HashMap::new(), VecDeque::new())))
}

/// (size, mtime) stamp used to key the archive cache so a jar replaced
/// mid-session never serves stale bytes.
fn jar_stamp(jar: &Path) -> Option<(u64, u64)> {
    let meta = fs::metadata(jar).ok()?;
    let modified = meta
        .modified()
        .ok()?
        .duration_since(std::time::UNIX_EPOCH)
        .ok()?
        .as_secs();
    Some((meta.len(), modified))
}

/// Get a cached open archive for `jar`, opening + memoizing on first use.
/// Thread-safe: each archive is behind its own Mutex, and the map is shared
/// across the spawn_blocking materialize threads.
fn open_jar(jar: &Path) -> Option<JarHandle> {
    let (size, modified) = jar_stamp(jar)?;
    let key: JarKey = (jar.to_path_buf(), size, modified);
    let cache = jar_archive_cache();
    {
        let mut guard = cache.lock().ok()?;
        if let Some(handle) = guard.0.get(&key) {
            let handle = handle.clone();
            // Access-order LRU: touch so hot jars (FTB shapes, common icons)
            // survive eviction across batches.
            guard.1.retain(|k| k != &key);
            guard.1.push_back(key);
            return Some(handle);
        }
    }
    let archive = ZipArchive::new(File::open(jar).ok()?).ok()?;
    let handle = Arc::new(Mutex::new(archive));
    let mut guard = cache.lock().ok()?;
    if let Some(existing) = guard.0.get(&key) {
        return Some(existing.clone());
    }
    guard.0.insert(key.clone(), handle.clone());
    guard.1.push_back(key);
    while guard.1.len() > JAR_CACHE_CAP {
        if let Some(oldest) = guard.1.pop_front() {
            guard.0.remove(&oldest);
        }
    }
    Some(handle)
}

/// Materialize a batch of texture keys to data URLs, opening each source jar at
/// most once. Keys not present in the index are omitted (None on lookup miss).
/// Keys whose source is a `bake:` descriptor are intentionally omitted — they
/// are 3D items that must be rendered in-game by the companion mod.
pub fn resolve_texture_urls(
    instance_path: &Path,
    keys: &[String],
) -> HashMap<String, Option<String>> {
    let index = compact_index(instance_path);
    let mut out: HashMap<String, Option<String>> = HashMap::new();
    let mut by_jar: HashMap<&str, Vec<(&str, &str)>> = HashMap::new();
    let mut fs_sources: Vec<(&str, String)> = Vec::new();

    for key in keys {
        let Some(src) = index.get(key) else { continue };
        if src.starts_with("bake:") {
            continue;
        }
        if let Some(rest) = src.strip_prefix("jar:") {
            if let Some((jar, internal)) = rest.split_once('!') {
                by_jar.entry(jar).or_default().push((key, internal));
                continue;
            }
        }
        fs_sources.push((key, src.clone()));
    }

    for (key, path) in fs_sources {
        out.insert(key.to_string(), read_file_data_url(Path::new(&path)));
    }
    for (jar, want) in by_jar {
        if let Some(urls) = read_jar_data_urls(Path::new(jar), &want) {
            for (k, u) in urls {
                out.insert(k.to_string(), u);
            }
        }
    }

    out
}

fn read_file_data_url(path: &Path) -> Option<String> {
    let buf = fs::read(path).ok()?;
    if buf.is_empty() {
        return None;
    }
    Some(format!("data:image/png;base64,{}", base64::Engine::encode(&base64::engine::general_purpose::STANDARD, &buf)))
}

fn read_jar_data_urls(
    jar: &Path,
    want: &[(&str, &str)],
) -> Option<HashMap<String, Option<String>>> {
    let handle = open_jar(jar)?;
    let mut archive = handle.lock().ok()?;
    let mut out = HashMap::new();
    for (key, internal) in want {
        use std::io::Read;
        let mut buf = Vec::new();
        let url = archive
            .by_name(internal)
            .ok()
            .and_then(|mut e| {
                e.read_to_end(&mut buf).ok()?;
                if buf.is_empty() {
                    None
                } else {
                    Some(format!(
                        "data:image/png;base64,{}",
                        base64::Engine::encode(&base64::engine::general_purpose::STANDARD, &buf)
                    ))
                }
            });
        out.insert(key.to_string(), url);
    }
    Some(out)
}
