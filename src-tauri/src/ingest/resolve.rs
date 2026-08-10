use base64::Engine;
use base64::engine::general_purpose::STANDARD;
use std::fs;
use std::io::Read;
use std::path::Path;
use zip::ZipArchive;

use super::models::{IngestCache, TextureEntry};

/// Extract a texture from its source (JAR archive or filesystem path) and
/// return it as a base64 PNG data URL.
fn texture_data_url_for_entry(entry: &TextureEntry) -> Option<String> {
    if entry.file_path.ends_with(".jar") || entry.file_path.contains(".jar!") {
        let jar_path = Path::new(&entry.file_path);
        let file = fs::File::open(jar_path).ok()?;
        let mut archive = ZipArchive::new(file).ok()?;
        let texture_path = entry.path.replace('\\', "/");
        let mut zip_entry = archive.by_name(&texture_path).ok()?;
        let mut buf = Vec::new();
        zip_entry.read_to_end(&mut buf).ok()?;
        if buf.is_empty() {
            return None;
        }
        Some(format!("data:image/png;base64,{}", STANDARD.encode(&buf)))
    } else {
        let buf = fs::read(&entry.file_path).ok()?;
        if buf.is_empty() {
            return None;
        }
        Some(format!("data:image/png;base64,{}", STANDARD.encode(&buf)))
    }
}

/// Resolve a texture key to a data URL from the ingest cache entries.
pub(crate) fn texture_data_url_for_key(cache: &IngestCache, texture_key: &str) -> Option<String> {
    let entry = cache.textures.iter().find(|t| {
        t.raw_key == texture_key || t.canonical_key == texture_key || t.clean_key == texture_key
    })?;
    texture_data_url_for_entry(entry)
}

/// Fallback: look up a texture key in `kubejs/assets` on the filesystem.
pub(crate) fn fallback_kubejs_texture(texture_key: &str, instance_path: &Path) -> Option<String> {
    let kubejs_assets_dir = instance_path.join("kubejs").join("assets");
    if !kubejs_assets_dir.exists() {
        return None;
    }
    let texture_path = texture_key.replace(':', "/").replace("textures/", "");
    let possible_paths = vec![
        kubejs_assets_dir.join(&texture_path),
        kubejs_assets_dir.join(texture_path.strip_prefix("textures/").unwrap_or(&texture_path)),
    ];

    for path in possible_paths {
        if path.exists() {
            if let Ok(buf) = fs::read(&path) {
                if !buf.is_empty() {
                    return Some(format!("data:image/png;base64,{}", STANDARD.encode(&buf)));
                }
            }
        }
    }
    None
}
