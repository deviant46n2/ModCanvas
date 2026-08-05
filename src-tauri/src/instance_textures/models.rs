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
const BLOCK_SLOTS: [&str; 8] = [
    "all", "top", "up", "north", "side", "particle", "cross", "fan",
];

/// Block slots tried when the preferred ones are absent.
const BLOCK_FALLBACK: [&str; 12] = [
    "bottom", "down", "front", "back", "left", "right", "inner", "outer", "base",
    "texture", "stem", "planks",
];

pub(super) mod scan;

/// Result of resolving one item id against its model chain.
enum Resolved {
    /// A flat texture source descriptor (jar:… or an absolute path).
    Texture(String),
    /// A model reference (`ns:item/…` or `ns:block/…`) that needs a real
    /// in-game render (3D geometry) — never materialized offline.
    Bake(String),
}

impl Resolved {
    fn into_index_value(self) -> String {
        match self {
            Resolved::Texture(url) => url,
            Resolved::Bake(model) => format!("bake:{}", model),
        }
    }
}

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

    /// Resolve every indexable item model to either a flat texture or a 3D
    /// bake descriptor and return new bare keys (`ns:id`) not already covered
    /// by the PNG scan. `bake:<ns>:<kind>/<path>` descriptors are not
    /// materialized offline — they flag items that need a real in-game render
    /// by the companion mod (engine-render pipeline).
    pub fn resolve_bare_keys(&self, by_id: &HashMap<String, String>) -> HashMap<String, String> {
        let mut out: HashMap<String, String> = HashMap::new();
        let mut ids: Vec<&(String, String)> = self.item.keys().collect();
        ids.sort();
        for (ns, id) in ids {
            if id.contains('/') || id.starts_with("template_") {
                continue;
            }
            let mut seen: HashSet<(u8, String, String)> = HashSet::new();
            if let Some(resolved) = self.resolve_item(ns, id, by_id, &mut seen, 0) {
                out.insert(format!("{}:{}", ns, id), resolved.into_index_value());
            }
        }
        out
    }

    /// Parse the stored model JSON for a (kind, ns, path) model id.
    pub fn lookup(&self, kind: &str, ns: &str, path: &str) -> Option<Value> {
        match kind {
            "item" => self.item.get(&(ns.to_string(), path.to_string())).cloned(),
            "block" => self
                .block
                .get(&(ns.to_string(), path.to_string()))
                .and_then(|b| serde_json::from_slice(b).ok()),
            _ => None,
        }
    }

    fn resolve_item(&self, ns: &str, path: &str, by_id: &HashMap<String, String>, seen: &mut HashSet<(u8, String, String)>, depth: u32) -> Option<Resolved> {
        if depth > 64 || !seen.insert((0, ns.to_string(), path.to_string())) {
            return None;
        }
        let model = self.item.get(&(ns.to_string(), path.to_string()))?;
        // Hand-modeled 3D items (elements) render 3D in-game too.
        if model_has_elements(model) {
            return Some(Resolved::Bake(format!("{}:item/{}", ns, path)));
        }
        if let Some(url) = model_texture(model, ns, by_id, &ITEM_SLOTS)
            .or_else(|| model_texture(model, ns, by_id, &ITEM_FALLBACK))
        {
            return Some(Resolved::Texture(url));
        }
        let parent = model.get("parent").and_then(|v| v.as_str())?;
        if parent.starts_with("builtin/") || parent == "none" {
            return None;
        }
        let (pns, ppath) = split_parent_ns(parent);
        if let Some(rest) = ppath.strip_prefix("block/") {
            self.resolve_block(&pns, rest, by_id, seen, depth + 1)
        } else {
            let p = ppath.strip_prefix("item/").unwrap_or(&ppath);
            self.resolve_item(&pns, p, by_id, seen, depth + 1)
        }
    }

    fn resolve_block(&self, ns: &str, path: &str, by_id: &HashMap<String, String>, seen: &mut HashSet<(u8, String, String)>, depth: u32) -> Option<Resolved> {
        if depth > 64 || !seen.insert((1, ns.to_string(), path.to_string())) {
            return None;
        }
        // Block items with 3D geometry (in this model or any ancestor) are
        // flagged as `bake:` descriptors for the engine-render pipeline instead
        // of a single flat face texture.
        if self.chain_has_elements("block", ns, path) {
            let mut tseen: HashSet<(u8, String, String)> = HashSet::new();
            if self.block_texture_in_chain(ns, path, by_id, &mut tseen, 0).is_some() {
                return Some(Resolved::Bake(format!("{}:block/{}", ns, path)));
            }
        }
        let raw = self.block.get(&(ns.to_string(), path.to_string()))?;
        let model: Value = serde_json::from_slice(raw).ok()?;
        if let Some(url) = model_texture(&model, ns, by_id, &BLOCK_SLOTS)
            .or_else(|| model_texture(&model, ns, by_id, &BLOCK_FALLBACK))
        {
            return Some(Resolved::Texture(url));
        }
        let parent = model.get("parent").and_then(|v| v.as_str())?;
        if parent.starts_with("builtin/") || parent == "none" {
            return None;
        }
        let (pns, ppath) = split_parent_ns(parent);
        let p = ppath.strip_prefix("block/").unwrap_or(&ppath);
        self.resolve_block(&pns, p, by_id, seen, depth + 1)
    }

    /// True when the model (or any ancestor, following the parent chain)
    /// defines a non-empty `elements` list — i.e. it renders as 3D geometry.
    fn chain_has_elements(&self, kind: &str, ns: &str, path: &str) -> bool {
        let mut seen: HashSet<(String, String, String)> = HashSet::new();
        let mut cur = (kind.to_string(), ns.to_string(), path.to_string());
        let mut depth = 0;
        loop {
            if depth > 64 || !seen.insert(cur.clone()) {
                return false;
            }
            let Some(m) = self.lookup(&cur.0, &cur.1, &cur.2) else { return false };
            if model_has_elements(&m) {
                return true;
            }
            let Some(parent) = m.get("parent").and_then(|v| v.as_str()) else { return false };
            if parent.starts_with("builtin/") || parent == "none" {
                return false;
            }
            let (pns, p) = split_parent_ns(parent);
            let (pkind, ppath) = parent_kind_path(&cur.0, &p);
            cur = (pkind, pns, ppath);
            depth += 1;
        }
    }

    /// Find any resolvable texture in the block chain, mirroring the bake's
    /// own texture needs so a `bake:` descriptor is only emitted when the
    /// icon can actually be materialized.
    fn block_texture_in_chain(&self, ns: &str, path: &str, by_id: &HashMap<String, String>, seen: &mut HashSet<(u8, String, String)>, depth: u32) -> Option<String> {
        if depth > 64 || !seen.insert((2, ns.to_string(), path.to_string())) {
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
        let (pns, ppath) = split_parent_ns(parent);
        let (pkind, p) = parent_kind_path("block", &ppath);
        if pkind == "block" {
            self.block_texture_in_chain(&pns, &p, by_id, seen, depth + 1)
        } else {
            None
        }
    }
}

/// Split a model path or texture reference into (namespace, rest).
pub(super) fn split_ref(ns: &str, value: &str) -> (String, String) {
    match value.split_once(':') {
        Some((a, b)) => (a.to_string(), b.to_string()),
        None => (ns.to_string(), value.to_string()),
    }
}

/// Resolve a model `parent` reference. Unlike texture refs, a namespace-less
/// parent (`"parent": "block/cube"`) always refers to the vanilla `minecraft:`
/// namespace (`minecraft:block/cube`) — Minecraft never inherits the child's
/// namespace for parents.
pub(super) fn split_parent_ns(value: &str) -> (String, String) {
    match value.split_once(':') {
        Some((a, b)) => (a.to_string(), b.to_string()),
        None => ("minecraft".to_string(), value.to_string()),
    }
}

/// Derive the (kind, path) of a parent reference from the child's kind.
/// Parent references like `block/foo` or `item/foo` switch kind; bare paths
/// inherit the child's kind.
pub(super) fn parent_kind_path(child_kind: &str, parent_path: &str) -> (String, String) {
    if let Some(r) = parent_path.strip_prefix("block/") {
        ("block".to_string(), r.to_string())
    } else if let Some(r) = parent_path.strip_prefix("item/") {
        ("item".to_string(), r.to_string())
    } else {
        (child_kind.to_string(), parent_path.to_string())
    }
}

/// True when a model JSON defines a non-empty `elements` list.
fn model_has_elements(model: &Value) -> bool {
    model
        .get("elements")
        .and_then(|v| v.as_array())
        .map_or(false, |a| !a.is_empty())
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

#[cfg(test)]
mod tests;
