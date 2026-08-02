// Parsing helpers for the 3D model baker.
//
// Converts raw Minecraft block/item model JSON into intermediate structs and
// provides the element-rotation / display math, keeping `baker.rs` focused on
// parent-chain merging and `raster.rs` on rendering.

use super::baker::{Display, ElementRotation, FaceDir};
use serde_json::Value;
use std::collections::HashMap;

pub(super) struct RawElement {
    pub from: [f32; 3],
    pub to: [f32; 3],
    pub shade: bool,
    pub rescale: bool,
    pub rotation: Option<ElementRotation>,
    pub faces: Vec<RawFace>,
}

pub(super) struct RawFace {
    pub dir: FaceDir,
    pub uv: [f32; 4],
    pub slot: String,
    pub rotation: u8,
}

pub(super) fn parse_elements(arr: &[Value]) -> Vec<RawElement> {
    arr.iter()
        .filter_map(|e| {
            let from = arr3(e.get("from")?)?;
            let to = arr3(e.get("to")?)?;
            let shade = e.get("shade").and_then(Value::as_bool).unwrap_or(true);
            let rescale = e.get("rescale").and_then(Value::as_bool).unwrap_or(false);
            let rotation = e.get("rotation").and_then(parse_rotation);
            let faces = e
                .get("faces")
                .and_then(Value::as_object)
                .map(|o| parse_faces(o, from, to))
                .unwrap_or_default();
            Some(RawElement { from, to, shade, rescale, rotation, faces })
        })
        .collect()
}

fn parse_faces(obj: &serde_json::Map<String, Value>, from: [f32; 3], to: [f32; 3]) -> Vec<RawFace> {
    let mut out = Vec::new();
    for (name, f) in obj {
        let Some(dir) = face_dir(name) else { continue };
        let Some(slot) = f.get("texture").and_then(Value::as_str).and_then(|s| s.strip_prefix('#')).map(str::to_string) else {
            continue;
        };
        let uv = f.get("uv").and_then(|u| arr4(u)).unwrap_or_else(|| auto_uv(dir, from, to));
        let rotation = (f.get("rotation").and_then(Value::as_i64).unwrap_or(0) as u8) % 4;
        out.push(RawFace { dir, uv, slot, rotation });
    }
    out
}

/// MC default UV when a face omits it — derived from the element box position.
fn auto_uv(dir: FaceDir, from: [f32; 3], to: [f32; 3]) -> [f32; 4] {
    match dir {
        FaceDir::Down => [from[0], 16.0 - to[2], to[0], 16.0 - from[2]],
        FaceDir::Up => [from[0], from[2], to[0], to[2]],
        FaceDir::North => [from[0], 16.0 - to[1], to[0], 16.0 - from[1]],
        FaceDir::South => [16.0 - to[0], 16.0 - to[1], 16.0 - from[0], 16.0 - from[1]],
        FaceDir::West => [from[2], 16.0 - to[1], to[2], 16.0 - from[1]],
        FaceDir::East => [16.0 - to[2], 16.0 - to[1], 16.0 - from[2], 16.0 - from[1]],
    }
}

/// Follow a `#slot` through the merged texture map to a concrete `ns:path`.
pub(super) fn resolve_slot(textures: &HashMap<String, (String, String)>, slot: &str) -> Option<String> {
    let mut current = slot;
    let mut guard = 0;
    while let Some((ns, raw)) = textures.get(current) {
        if let Some(rest) = raw.strip_prefix('#') {
            current = rest;
            guard += 1;
            if guard > 32 {
                return None;
            }
        } else {
            return Some(if let Some((a, b)) = raw.split_once(':') {
                format!("{}:{}", a, b)
            } else {
                format!("{}:{}", ns, raw)
            });
        }
    }
    None
}

/// Parse an element `rotation` object into a matrix + origin.
fn parse_rotation(v: &Value) -> Option<ElementRotation> {
    let origin = arr3(v.get("origin")?)?;
    if let Some(angle) = v.get("angle").and_then(Value::as_f64) {
        let axis = match v.get("axis").and_then(Value::as_str) {
            Some("x") => [1.0, 0.0, 0.0],
            Some("y") => [0.0, 1.0, 0.0],
            Some("z") => [0.0, 0.0, 1.0],
            _ => return None,
        };
        let matrix = rodrigues(axis, (angle as f32).to_radians());
        Some(ElementRotation { matrix, origin })
    } else {
        // Multi-axis form (25w46a+): x/y/z angles applied x-then-y-then-z.
        let x = v.get("x").and_then(Value::as_f64)? as f32;
        let y = v.get("y").and_then(Value::as_f64)? as f32;
        let z = v.get("z").and_then(Value::as_f64)? as f32;
        let rx = rodrigues([1.0, 0.0, 0.0], x.to_radians());
        let ry = rodrigues([0.0, 1.0, 0.0], y.to_radians());
        let rz = rodrigues([0.0, 0.0, 1.0], z.to_radians());
        let matrix = mat3_mul(&mat3_mul(&rx, &ry), &rz);
        Some(ElementRotation { matrix, origin })
    }
}

/// Rodrigues rotation matrix for `angle` about a unit-ish `axis`.
fn rodrigues(axis: [f32; 3], angle: f32) -> [[f32; 3]; 3] {
    let len = (axis[0] * axis[0] + axis[1] * axis[1] + axis[2] * axis[2]).sqrt();
    if len < 1e-6 {
        return [[1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]];
    }
    let (kx, ky, kz) = (axis[0] / len, axis[1] / len, axis[2] / len);
    let (s, c) = angle.sin_cos();
    let t = 1.0 - c;
    [
        [c + kx * kx * t, kx * ky * t - kz * s, kx * kz * t + ky * s],
        [ky * kx * t + kz * s, c + ky * ky * t, ky * kz * t - kx * s],
        [kz * kx * t - ky * s, kz * ky * t + kx * s, c + kz * kz * t],
    ]
}

pub(crate) fn mat3_mul(a: &[[f32; 3]; 3], b: &[[f32; 3]; 3]) -> [[f32; 3]; 3] {
    let mut out = [[0.0; 3]; 3];
    for i in 0..3 {
        for j in 0..3 {
            out[i][j] = a[i][0] * b[0][j] + a[i][1] * b[1][j] + a[i][2] * b[2][j];
        }
    }
    out
}

pub(crate) fn mat3_mul_vec3(m: &[[f32; 3]; 3], v: &[f32; 3]) -> [f32; 3] {
    [
        m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
        m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
        m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2],
    ]
}

pub(super) fn parse_display(v: &Value) -> Display {
    let mut d = Display::default();
    if let Some(r) = v.get("rotation").and_then(|x| arr3(x)) {
        d.rotation = r;
    }
    if let Some(s) = v.get("scale").and_then(|x| arr3(x)) {
        d.scale = s;
    }
    if let Some(t) = v.get("translation").and_then(|x| arr3(x)) {
        d.translation = t;
    }
    d
}

/// Split `ns:item/foo` / `ns:block/foo` into (ns, kind, path).
pub(super) fn split_model_ref(model_ref: &str) -> Option<(String, String, String)> {
    let (ns, rest) = model_ref.split_once(':')?;
    let (kind, path) = rest.split_once('/')?;
    Some((ns.to_string(), kind.to_string(), path.to_string()))
}

fn arr3(v: &Value) -> Option<[f32; 3]> {
    let a = v.as_array()?;
    if a.len() < 3 {
        return None;
    }
    Some([a[0].as_f64()? as f32, a[1].as_f64()? as f32, a[2].as_f64()? as f32])
}

fn arr4(v: &Value) -> Option<[f32; 4]> {
    let a = v.as_array()?;
    if a.len() < 4 {
        return None;
    }
    Some([a[0].as_f64()? as f32, a[1].as_f64()? as f32, a[2].as_f64()? as f32, a[3].as_f64()? as f32])
}

fn face_dir(name: &str) -> Option<FaceDir> {
    match name {
        "down" => Some(FaceDir::Down),
        "up" => Some(FaceDir::Up),
        "north" => Some(FaceDir::North),
        "south" => Some(FaceDir::South),
        "west" => Some(FaceDir::West),
        "east" => Some(FaceDir::East),
        _ => None,
    }
}
