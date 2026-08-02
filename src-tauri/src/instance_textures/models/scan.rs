// Model file scanning: collects item/block model JSON from jars, resource
// packs and the kubejs assets dir into the `Models` index in layer order.
//
// Archive/dir enumeration is byte-only (no texture reads); the highest-priority
// definition of each model wins, mirroring the in-game resource stack order.

use super::Models;
use std::fs;
use std::io::Read;
use std::path::Path;

impl Models {
    pub(super) fn merge_archive(&mut self, path: &Path) {
        let file = match fs::File::open(path) {
            Ok(f) => f,
            Err(_) => return,
        };
        let mut archive = match zip::ZipArchive::new(file) {
            Ok(a) => a,
            Err(_) => return,
        };
        for i in 0..archive.len() {
            let Ok(mut entry) = archive.by_index(i) else { continue };
            if !entry.name().ends_with(".json") {
                continue;
            }
            let name = entry.name().to_string();
            let Some((ns, kind, mpath)) = model_relative(&name) else { continue };
            let mut bytes = Vec::new();
            if entry.read_to_end(&mut bytes).is_err() {
                continue;
            }
            self.store_model(&ns, &kind, &mpath, bytes);
        }
    }

    pub(super) fn merge_dir(&mut self, assets: &Path) {
        for entry in walkdir::WalkDir::new(assets).into_iter().flatten() {
            let path = entry.path();
            if !path.extension().map_or(false, |e| e == "json") {
                continue;
            }
            let rel = path.strip_prefix(assets).unwrap_or(path).to_string_lossy().replace('\\', "/");
            let Some((ns, kind, mpath)) = model_relative(&rel) else { continue };
            let Ok(bytes) = fs::read(path) else { continue };
            self.store_model(&ns, &kind, &mpath, bytes);
        }
    }

    fn store_model(&mut self, ns: &str, kind: &str, mpath: &str, bytes: Vec<u8>) {
        match kind {
            "item" => {
                if let Ok(v) = serde_json::from_slice(&bytes) {
                    self.item.insert((ns.to_string(), mpath.to_string()), v);
                }
            }
            "block" => {
                self.block.insert((ns.to_string(), mpath.to_string()), bytes);
            }
            _ => {}
        }
    }
}

/// Turn an archive-relative path like `assets/ns/models/item/foo.json` (or the
/// kubejs filesystem form `ns/models/item/foo.json`) into (namespace, kind,
/// model path without extension).
fn model_relative(name: &str) -> Option<(String, String, String)> {
    let trimmed = name.strip_suffix(".json")?;
    let trimmed = trimmed.strip_prefix("assets/").unwrap_or(trimmed);
    let parts: Vec<&str> = trimmed.split('/').collect();
    if parts.len() < 4 || parts[1] != "models" {
        return None;
    }
    let kind = parts[2].to_string();
    if kind != "item" && kind != "block" {
        return None;
    }
    let path = parts[3..].join("/");
    if path.is_empty() {
        return None;
    }
    Some((parts[0].to_string(), kind, path))
}
