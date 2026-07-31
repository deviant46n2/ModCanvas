// Item-model → texture resolution for the instance texture index.
//
// Many quest icons are item ids whose texture only exists as a JSON model
// (`assets/<ns>/models/item/<id>.json`) pointing at a texture via `layer0`,
// or at a block model via `parent`. Examples: apotheosis gems, Mystical
// Agriculture seeds, Immersive Engineering tools. Resolution walks the model
// parent chain (item → block → texture) using the highest-priority archive
// that defines each model, mirroring the in-game resource stack order.

use serde_json::Value;
use std::collections::{HashMap, HashSet};
use std::fs;
use std::io::Read;
use std::path::Path;

/// Item model texture slots, preferred in order.
const ITEM_SLOTS: [&str; 2] = ["layer0", "layer1"];

/// Item slots tried when the preferred ones are absent, for hand-modeled 3D
/// items that expose only `particle`/`base`-style textures.
const ITEM_FALLBACK: [&str; 18] = [
    "particle", "base", "texture", "inner", "outer", "pattern", "front", "down", "bottom",
    "stem", "crop", "layer2", "layer3", "top", "up", "north", "side", "all",
];

/// Block model texture slots that double as icon sources, preferred in order.
const BLOCK_SLOTS: [&str; 6] = ["all", "top", "up", "north", "side", "particle"];

/// Block slots tried when the preferred ones are absent.
const BLOCK_FALLBACK: [&str; 12] = [
    "bottom", "down", "front", "back", "left", "right", "inner", "outer", "base",
    "texture", "stem", "planks",
];

#[derive(Default)]
pub struct Models {
    item: HashMap<(String, String), Value>,
    block: HashMap<(String, String), Vec<u8>>,
}

impl Models {
    /// Collect models from all archives in layer order. Later layers overwrite
    /// earlier ones so the highest-priority definition of each model wins.
    pub fn scan(instance_path: &Path, vanilla: &[std::path::PathBuf], mods: &[std::path::PathBuf], packs: &[std::path::PathBuf]) -> Models {
        let mut m = Models::default();
        for jar in vanilla {
            m.merge_archive(jar);
        }
        for jar in mods {
            m.merge_archive(jar);
        }
        for pack in packs {
            m.merge_archive(pack);
        }
        m.merge_dir(&instance_path.join("kubejs").join("assets"));
        m
    }

    /// Resolve every indexable item model to a texture and return new bare
    /// keys (`ns:id`) not already covered by the PNG scan.
    pub fn resolve_bare_keys(&self, by_id: &HashMap<String, String>) -> HashMap<String, String> {
        let mut out: HashMap<String, String> = HashMap::new();
        let mut ids: Vec<&(String, String)> = self.item.keys().collect();
        ids.sort();
        for (ns, id) in ids {
            if id.contains('/') || id.starts_with("template_") {
                continue;
            }
            let mut seen: HashSet<(u8, String, String)> = HashSet::new();
            if let Some(url) = self.resolve_item(ns, id, by_id, &mut seen, 0) {
                out.insert(format!("{}:{}", ns, id), url);
            }
        }
        out
    }

    fn resolve_item(&self, ns: &str, path: &str, by_id: &HashMap<String, String>, seen: &mut HashSet<(u8, String, String)>, depth: u32) -> Option<String> {
        if depth > 64 || !seen.insert((0, ns.to_string(), path.to_string())) {
            return None;
        }
        let model = self.item.get(&(ns.to_string(), path.to_string()))?;
        if let Some(url) = model_texture(model, ns, by_id, &ITEM_SLOTS)
            .or_else(|| model_texture(model, ns, by_id, &ITEM_FALLBACK))
        {
            return Some(url);
        }
        let parent = model.get("parent").and_then(|v| v.as_str())?;
        if parent.starts_with("builtin/") || parent == "none" {
            return None;
        }
        let (pns, ppath) = split_ref(ns, parent);
        if let Some(rest) = ppath.strip_prefix("block/") {
            self.resolve_block(&pns, rest, by_id, seen, depth + 1)
        } else {
            let p = ppath.strip_prefix("item/").unwrap_or(&ppath);
            self.resolve_item(&pns, p, by_id, seen, depth + 1)
        }
    }

    fn resolve_block(&self, ns: &str, path: &str, by_id: &HashMap<String, String>, seen: &mut HashSet<(u8, String, String)>, depth: u32) -> Option<String> {
        if depth > 64 || !seen.insert((1, ns.to_string(), path.to_string())) {
            return None;
        }
        let raw = self.block.get(&(ns.to_string(), path.to_string()))?;
        let model: Value = serde_json::from_slice(raw).ok()?;
        if let Some(url) = model_texture(&model, ns, by_id, &BLOCK_SLOTS)
            .or_else(|| model_texture(&model, ns, by_id, &BLOCK_FALLBACK))
        {
            return Some(url);
        }
        let parent = model.get("parent").and_then(|v| v.as_str())?;
        if parent.starts_with("builtin/") || parent == "none" {
            return None;
        }
        let (pns, ppath) = split_ref(ns, parent);
        let p = ppath.strip_prefix("block/").unwrap_or(&ppath);
        self.resolve_block(&pns, p, by_id, seen, depth + 1)
    }

    fn merge_archive(&mut self, path: &Path) {
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
            match kind.as_str() {
                "item" => {
                    if let Ok(v) = serde_json::from_slice(&bytes) {
                        self.item.insert((ns, mpath), v);
                    }
                }
                "block" => {
                    self.block.insert((ns, mpath), bytes);
                }
                _ => {}
            }
        }
    }

    fn merge_dir(&mut self, assets: &Path) {
        for entry in walkdir::WalkDir::new(assets).into_iter().flatten() {
            let path = entry.path();
            if !path.extension().map_or(false, |e| e == "json") {
                continue;
            }
            let rel = path.strip_prefix(assets).unwrap_or(path).to_string_lossy().replace('\\', "/");
            let Some((ns, kind, mpath)) = model_relative(&rel) else { continue };
            let Ok(bytes) = fs::read(path) else { continue };
            match kind.as_str() {
                "item" => {
                    if let Ok(v) = serde_json::from_slice(&bytes) {
                        self.item.insert((ns, mpath), v);
                    }
                }
                "block" => {
                    self.block.insert((ns, mpath), bytes);
                }
                _ => {}
            }
        }
    }
}

/// Split a model path or texture reference into (namespace, rest).
fn split_ref(ns: &str, value: &str) -> (String, String) {
    match value.split_once(':') {
        Some((a, b)) => (a.to_string(), b.to_string()),
        None => (ns.to_string(), value.to_string()),
    }
}

/// Resolve a texture reference to an indexed key and return its URL.
fn texture_url(ns: &str, tex: &str, by_id: &HashMap<String, String>) -> Option<String> {
    let (tns, path) = split_ref(ns, tex);
    by_id.get(&format!("{}:{}", tns, path)).cloned()
}

/// Return the URL of the first texture slot that resolves, in slot order.
fn model_texture(model: &Value, ns: &str, by_id: &HashMap<String, String>, slots: &[&str]) -> Option<String> {
    let textures = model.get("textures")?;
    for slot in slots {
        if let Some(tex) = textures.get(*slot).and_then(|v| v.as_str()) {
            if let Some(url) = texture_url(ns, tex, by_id) {
                return Some(url);
            }
        }
    }
    None
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

#[cfg(test)]
mod tests;
