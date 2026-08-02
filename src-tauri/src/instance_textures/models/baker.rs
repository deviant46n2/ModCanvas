// Merged block/item model resolution for the 3D icon baker.
//
// Walks a model's parent chain (child → root), merging texture slots (child
// overrides parent), locating the nearest non-empty `elements` list and the
// nearest `display.gui` transform, then resolves every face's `#slot`
// reference to a concrete `ns:path` texture id ready for index lookup.

use super::merge::{parse_display, parse_elements, resolve_slot, split_model_ref, RawElement};
use super::{parent_kind_path, split_ref, Models};
use serde_json::Value;
use std::collections::{HashMap, HashSet};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FaceDir {
    Down,
    Up,
    North,
    South,
    West,
    East,
}

/// Element rotation: a rotation matrix applied around a model-space origin.
#[derive(Debug, Clone)]
pub struct ElementRotation {
    pub matrix: [[f32; 3]; 3],
    pub origin: [f32; 3],
}

#[derive(Debug, Clone)]
pub struct MergedFace {
    pub dir: FaceDir,
    pub uv: [f32; 4],
    /// Concrete `ns:path` texture id (resolved through `#slot` references).
    pub texture: String,
    /// Texture rotation in quarter turns (0/90/180/270 degrees).
    pub rotation: u8,
}

#[derive(Debug, Clone)]
pub struct MergedElement {
    pub from: [f32; 3],
    pub to: [f32; 3],
    pub shade: bool,
    /// `rescale` flag: shrink the rotated element by 1/√2 around its rotation
    /// origin (vanilla behavior for plant/crop models).
    pub rescale: bool,
    pub rotation: Option<ElementRotation>,
    pub faces: Vec<MergedFace>,
}

/// Item `display.gui` transform.
#[derive(Debug, Clone)]
pub struct Display {
    pub rotation: [f32; 3],
    pub scale: [f32; 3],
    pub translation: [f32; 3],
}

impl Default for Display {
    fn default() -> Self {
        // block/block.json gui transform — the standard block icon view.
        Display { rotation: [30.0, 225.0, 0.0], scale: [0.625, 0.625, 0.625], translation: [0.0, 0.0, 0.0] }
    }
}

/// A fully merged model ready to render.
#[derive(Debug, Clone)]
pub struct MergedModel {
    pub display: Display,
    pub elements: Vec<MergedElement>,
}

impl MergedModel {
    /// Resolve `model_ref` (e.g. `minecraft:block/grass_block`) into a merged
    /// model with concrete face textures, or `None` when it cannot be baked.
    pub fn resolve(models: &Models, model_ref: &str) -> Option<MergedModel> {
        let (ns, kind, path) = split_model_ref(model_ref)?;
        let mut textures: HashMap<String, (String, String)> = HashMap::new();
        let mut display: Option<Display> = None;
        let mut raw_elements: Option<Vec<RawElement>> = None;
        let mut seen: HashSet<(String, String, String)> = HashSet::new();
        let mut cur = (ns, kind, path);

        loop {
            if !seen.insert(cur.clone()) {
                return None;
            }
            let m = models.lookup(&cur.1, &cur.0, &cur.2)?;
            if let Some(t) = m.get("textures").and_then(Value::as_object) {
                for (slot, v) in t {
                    let raw = if let Some(s) = v.as_str() {
                        s.to_string()
                    } else if let Some(o) = v.as_object().and_then(|o| o.get("sprite")).and_then(Value::as_str) {
                        o.to_string()
                    } else {
                        continue;
                    };
                    textures.insert(slot.clone(), (cur.0.clone(), raw));
                }
            }
            if display.is_none() {
                if let Some(d) = m.get("display").and_then(|d| d.get("gui")) {
                    display = Some(parse_display(d));
                }
            }
            if raw_elements.is_none() {
                if let Some(arr) = m.get("elements").and_then(Value::as_array) {
                    if !arr.is_empty() {
                        raw_elements = Some(parse_elements(arr));
                    }
                }
            }
            let Some(parent) = m.get("parent").and_then(Value::as_str) else { break };
            if parent.starts_with("builtin/") || parent == "none" {
                break;
            }
            let (pns, p) = split_ref(&cur.0, parent);
            let (pkind, ppath) = parent_kind_path(&cur.1, &p);
            cur = (pns, pkind, ppath);
        }

        let raw_elements = raw_elements?;
        let display = display.unwrap_or_default();
        let mut elements: Vec<MergedElement> = Vec::new();
        for el in raw_elements {
            let mut faces = Vec::new();
            for f in el.faces {
                let Some(texture) = resolve_slot(&textures, &f.slot) else { continue };
                faces.push(MergedFace { dir: f.dir, uv: f.uv, texture, rotation: f.rotation });
            }
            if faces.is_empty() {
                continue;
            }
            elements.push(MergedElement { from: el.from, to: el.to, shade: el.shade, rescale: el.rescale, rotation: el.rotation, faces });
        }
        if elements.is_empty() {
            return None;
        }
        Some(MergedModel { display, elements })
    }
}
