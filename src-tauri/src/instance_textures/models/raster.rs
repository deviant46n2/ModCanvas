// Software rasterizer: bakes merged block/item models into isometric PNGs.
//
// Applies the item `display.gui` rotation/scale, backface-culls per face,
// shades with Minecraft's per-direction brightness, textures each quad with
// affine-mapped UVs and writes an RGBA PNG with a z-buffer for overlap.

use super::baker::{FaceDir, MergedModel};
use super::merge::{mat3_mul, mat3_mul_vec3};
use std::collections::HashMap;

/// Output icon size in pixels. Kept small (close to how icons are displayed)
/// so textures stay crisp when the browser scales the PNG — a large supersampled
/// PNG gets smoothed/downscaled and the 16px pixel-art blurs.
/// Output icon size in pixels. Matches the app's common quest-icon display
/// sizes (18–64px) so the browser does minimal scaling. Combined with the
/// frontend rendering baked icons with `image-rendering: pixelated`, texels
/// stay crisp and hard like real Minecraft icons.
pub const OUTPUT_SIZE: u32 = 64;
/// Internal render resolution multiplier. Rendering at 4× then coverage-
/// downsampling anti-aliases only the silhouette edges, keeping the interior
/// texels crisp and pixelated like real Minecraft icons.
const SUPERSAMPLE: u32 = 4;
const PAD: f32 = 4.0;
use std::f32::consts::SQRT_2;

/// A decoded RGBA texture ready for sampling.
#[derive(Debug, Clone)]
pub struct Texture {
    pub w: u32,
    pub h: u32,
    pub rgba: Vec<u8>,
}

/// Per-face brightness, matching Minecraft's block-model lighting exactly
/// (up 1.0, north/south 0.8, west/east 0.6, down 0.5). The west/east faces are
/// darker than north/south — that contrast is what makes isometric blocks read
/// as three-dimensional.
fn face_shade(dir: FaceDir) -> f32 {
    match dir {
        FaceDir::Up => 1.0,
        FaceDir::North | FaceDir::South => 0.8,
        FaceDir::West | FaceDir::East => 0.6,
        FaceDir::Down => 0.5,
    }
}

/// Render `model` with the given textures into a PNG (RGBA, transparent bg).
///
/// Rasterizes into a supersampled buffer then box-downsamples to
/// [`OUTPUT_SIZE`]. Downsampling averages premultiplied alpha so translucent
/// edges get correct coverage instead of dark fringes.
pub fn render(model: &MergedModel, textures: &HashMap<String, Texture>) -> Option<Vec<u8>> {
    let rot = euler_matrix(model.display.rotation);
    let quads = build_quads(model, textures, &rot);

    let (mut minx, mut maxx, mut miny, mut maxy) = (f32::MAX, f32::MIN, f32::MAX, f32::MIN);
    for q in &quads {
        for v in &q.vs {
            minx = minx.min(v.sx);
            maxx = maxx.max(v.sx);
            miny = miny.min(v.sy);
            maxy = maxy.max(v.sy);
        }
    }
    if !(minx < maxx && miny < maxy) {
        return None;
    }
    let ss = SUPERSAMPLE;
    let hi_size = (OUTPUT_SIZE * ss) as usize;
    let avail = OUTPUT_SIZE as f32 - 2.0 * PAD;
    let fit = avail / (maxx - minx).max(maxy - miny).max(1e-6);
    let ox = PAD - minx * fit;
    let oy = maxy * fit + PAD;

    let mut fbuf = vec![0u8; hi_size * hi_size * 4];
    let mut zbuf = vec![f32::NEG_INFINITY; hi_size * hi_size];

    // Rasterize into supersampled space (fit/ox/oy scaled by `ss`).
    for q in &quads {
        let Some(tex) = textures.get(&q.tex_key) else { continue };
        for tri in [(0usize, 1usize, 2usize), (0, 2, 3)] {
            raster_tri(&q, tex, tri, fit * ss as f32, ox * ss as f32, oy * ss as f32, hi_size, &mut fbuf, &mut zbuf);
        }
    }

    let out = downsample(&fbuf, hi_size, OUTPUT_SIZE as usize, ss as usize);
    let mut png_out = Vec::new();
    {
        let mut enc = png::Encoder::new(&mut png_out, OUTPUT_SIZE, OUTPUT_SIZE);
        enc.set_color(png::ColorType::Rgba);
        enc.set_depth(png::BitDepth::Eight);
        let mut writer = enc.write_header().ok()?;
        writer.write_image_data(&out).ok()?;
    }
    Some(png_out)
}

/// Coverage-based downsample from a supersampled buffer.
///
/// For each output pixel we look at the `ss×ss` subsamples:
/// - **Alpha** = fraction of solid (opaque) subsamples → anti-aliases the
///   silhouette edge while keeping the interior fully opaque.
/// - **Color** = the nearest solid subsample to the pixel center. This keeps
///   the 16px texture texels crisp and pixelated instead of blurring them the
///   way a box-average (bilinear) downsample would.
fn downsample(fbuf: &[u8], hi: usize, lo: usize, ss: usize) -> Vec<u8> {
    let mut out = vec![0u8; lo * lo * 4];
    let cell = (ss * ss) as f32;
    let half = ss / 2;
    for oy in 0..lo {
        for ox in 0..lo {
            // Count solid subsamples and remember the nearest solid one.
            let mut solid = 0u32;
            let mut chosen: Option<[u8; 4]> = None;
            let mut best_dist = u32::MAX;
            for dy in 0..ss {
                for dx in 0..ss {
                    let hi_idx = ((oy * ss + dy) * hi + (ox * ss + dx)) * 4;
                    let a = fbuf[hi_idx + 3];
                    if a == 0 {
                        continue;
                    }
                    solid += 1;
                    // Prefer the subsample nearest the pixel center so texels
                    // stay crisp; fall back to the first solid one.
                    let dist = (dy as i32 - half as i32).unsigned_abs()
                        + (dx as i32 - half as i32).unsigned_abs();
                    if dist < best_dist {
                        best_dist = dist;
                        chosen = Some([fbuf[hi_idx], fbuf[hi_idx + 1], fbuf[hi_idx + 2], a]);
                    }
                }
            }
            let out_idx = (oy * lo + ox) * 4;
            if solid == 0 {
                out[out_idx + 3] = 0;
                continue;
            }
            let Some([r, g, b, a]) = chosen else { continue };
            let coverage = solid as f32 / cell;
            let alpha = (a as f32 * coverage).round() as u8;
            out[out_idx] = r;
            out[out_idx + 1] = g;
            out[out_idx + 2] = b;
            out[out_idx + 3] = alpha;
        }
    }
    out
}

#[derive(Clone, Copy)]
struct V {
    sx: f32,
    sy: f32,
    z: f32,
    u: f32,
    v: f32,
}

struct Quad {
    tex_key: String,
    bright: f32,
    uv: [f32; 4],
    vs: [V; 4],
}

fn build_quads(model: &MergedModel, textures: &HashMap<String, Texture>, rot: &[[f32; 3]; 3]) -> Vec<Quad> {
    let mut quads = Vec::new();
    let scale = model.display.scale;
    let trans = model.display.translation;
    for el in &model.elements {
        let el_rot = el.rotation.as_ref();
        for f in &el.faces {
            if !textures.contains_key(&f.texture) {
                continue;
            }
            let corners = face_corners(f.dir, el.from, el.to, f.uv, f.rotation);
            let mut vs = [V { sx: 0.0, sy: 0.0, z: 0.0, u: 0.0, v: 0.0 }; 4];
            for (i, (p, (u, v))) in corners.iter().enumerate() {
                let mut q = *p;
                if let Some(r) = el_rot {
                    q = apply_rot(&r.matrix, &q, &r.origin);
                }
                if el.rescale {
                    q = [q[0] / SQRT_2, q[1] / SQRT_2, q[2] / SQRT_2];
                }
                q = [q[0] - 8.0, q[1] - 8.0, q[2] - 8.0];
                let sc = [q[0] * scale[0], q[1] * scale[1], q[2] * scale[2]];
                let r = mat3_mul_vec3(rot, &sc);
                let r = [r[0] + trans[0], r[1] + trans[1], r[2] + trans[2]];
                vs[i] = V { sx: r[0], sy: r[1], z: r[2], u: *u, v: *v };
            }
            let n = mat3_mul_vec3(rot, &world_normal(f.dir));
            if n[2] <= 0.0 {
                continue;
            }
            let bright = if el.shade { face_shade(f.dir) } else { 1.0 };
            quads.push(Quad { tex_key: f.texture.clone(), bright, uv: f.uv, vs });
        }
    }
    quads
}

fn apply_rot(m: &[[f32; 3]; 3], p: &[f32; 3], origin: &[f32; 3]) -> [f32; 3] {
    let d = [p[0] - origin[0], p[1] - origin[1], p[2] - origin[2]];
    let r = mat3_mul_vec3(m, &d);
    [r[0] + origin[0], r[1] + origin[1], r[2] + origin[2]]
}

fn world_normal(dir: FaceDir) -> [f32; 3] {
    match dir {
        FaceDir::Down => [0.0, -1.0, 0.0],
        FaceDir::Up => [0.0, 1.0, 0.0],
        FaceDir::North => [0.0, 0.0, -1.0],
        FaceDir::South => [0.0, 0.0, 1.0],
        FaceDir::West => [-1.0, 0.0, 0.0],
        FaceDir::East => [1.0, 0.0, 0.0],
    }
}

/// Rotation matrix for the `display` rotation `[x, y, z]`, applied x then y
/// then z (matching the JOML `rotateXYZ` order Minecraft uses).
fn euler_matrix(rot: [f32; 3]) -> [[f32; 3]; 3] {
    let (sx, cx) = rot[0].to_radians().sin_cos();
    let (sy, cy) = rot[1].to_radians().sin_cos();
    let (sz, cz) = rot[2].to_radians().sin_cos();
    let mx = [[1.0, 0.0, 0.0], [0.0, cx, -sx], [0.0, sx, cx]];
    let my = [[cy, 0.0, sy], [0.0, 1.0, 0.0], [-sy, 0.0, cy]];
    let mz = [[cz, -sz, 0.0], [sz, cz, 0.0], [0.0, 0.0, 1.0]];
    mat3_mul(&mat3_mul(&mx, &my), &mz)
}

/// 4 vertex positions + UV corners for a face (upright-from-outside; the
/// `down` face is mirrored per Minecraft's convention).
fn face_corners(dir: FaceDir, from: [f32; 3], to: [f32; 3], uv: [f32; 4], rot: u8) -> [([f32; 3], (f32, f32)); 4] {
    let pos: [[f32; 3]; 4] = match dir {
        FaceDir::Up => [[from[0], to[1], from[2]], [to[0], to[1], from[2]], [to[0], to[1], to[2]], [from[0], to[1], to[2]]],
        FaceDir::Down => [[from[0], from[1], from[2]], [to[0], from[1], from[2]], [to[0], from[1], to[2]], [from[0], from[1], to[2]]],
        FaceDir::North => [[from[0], to[1], from[2]], [to[0], to[1], from[2]], [to[0], from[1], from[2]], [from[0], from[1], from[2]]],
        FaceDir::South => [[to[0], to[1], to[2]], [from[0], to[1], to[2]], [from[0], from[1], to[2]], [to[0], from[1], to[2]]],
        FaceDir::West => [[from[0], to[1], from[2]], [from[0], to[1], to[2]], [from[0], from[1], to[2]], [from[0], from[1], from[2]]],
        FaceDir::East => [[to[0], to[1], from[2]], [to[0], to[1], to[2]], [to[0], from[1], to[2]], [to[0], from[1], from[2]]],
    };
    let base = [(0u8, 0u8), (1, 0), (1, 1), (0, 1)];
    let mut out = [([0.0; 3], (0.0, 0.0)); 4];
    for i in 0..4 {
        let (tu, tv) = rotate_corner(base[i], rot, dir == FaceDir::Down);
        let u = if tu == 0 { uv[0] } else { uv[2] };
        let v = if tv == 0 { uv[1] } else { uv[3] };
        out[i] = (pos[i], (u, v));
    }
    out
}

/// Permute a UV corner for the face `rotation` (clockwise quarter-turns;
/// counterclockwise on the mirrored down face).
fn rotate_corner(c: (u8, u8), rot: u8, down: bool) -> (u8, u8) {
    let mut r = rot % 4;
    if down {
        r = (4 - r) % 4;
    }
    let (tu, tv) = c;
    match r {
        0 => (tu, tv),
        1 => (1 - tv, tu),
        2 => (1 - tu, 1 - tv),
        _ => (tv, 1 - tu),
    }
}

fn raster_tri(
    q: &Quad,
    tex: &Texture,
    tri: (usize, usize, usize),
    fit: f32,
    ox: f32,
    oy: f32,
    size: usize,
    fbuf: &mut [u8],
    zbuf: &mut [f32],
) {
    let (i0, i1, i2) = tri;
    let a = &q.vs[i0];
    let b = &q.vs[i1];
    let c = &q.vs[i2];
    let (ax, ay) = (a.sx * fit + ox, -a.sy * fit + oy);
    let (bx, by) = (b.sx * fit + ox, -b.sy * fit + oy);
    let (cx, cy) = (c.sx * fit + ox, -c.sy * fit + oy);

    let minx = (ax.min(bx).min(cx)).floor().max(0.0) as i32;
    let maxx = (ax.max(bx).max(cx)).ceil().min(size as f32 - 1.0) as i32;
    let miny = (ay.min(by).min(cy)).floor().max(0.0) as i32;
    let maxy = (ay.max(by).max(cy)).ceil().min(size as f32 - 1.0) as i32;
    if minx > maxx || miny > maxy {
        return;
    }

    let area = edge(ax, ay, bx, by, cx, cy);
    if area.abs() < 1e-9 {
        return;
    }
    let inv = 1.0 / area;
    let sign = if area >= 0.0 { 1.0 } else { -1.0 };

    let (tw, th) = (tex.w as f32, tex.h as f32);
    let (du, dv) = (q.uv[2] - q.uv[0], q.uv[3] - q.uv[1]);
    let (tw_max, th_max) = ((tex.w - 1) as i32, (tex.h - 1) as i32);

    for py in miny..=maxy {
        let fy = py as f32 + 0.5;
        for px in minx..=maxx {
            let fx = px as f32 + 0.5;
            let r0 = edge(bx, by, cx, cy, fx, fy);
            let r1 = edge(cx, cy, ax, ay, fx, fy);
            let r2 = edge(ax, ay, bx, by, fx, fy);
            if sign * r0 < 0.0 || sign * r1 < 0.0 || sign * r2 < 0.0 {
                continue;
            }
            // Barycentric weights from the RAW edges: `sign` already flips both
            // `r*` and `area`, so weighting the sign-flipped `e*` against the
            // un-flipped `inv` breaks the sum for clockwise triangles.
            let w0 = r0 * inv;
            let w1 = r1 * inv;
            let w2 = r2 * inv;
            let z = w0 * a.z + w1 * b.z + w2 * c.z;
            let u = w0 * a.u + w1 * b.u + w2 * c.u;
            let v = w0 * a.v + w1 * b.v + w2 * c.v;

            let idx = py as usize * size + px as usize;
            if z < zbuf[idx] {
                continue;
            }
            let nu = if du.abs() < 1e-9 { 0.5 } else { (u - q.uv[0]) / du };
            let nv = if dv.abs() < 1e-9 { 0.5 } else { (v - q.uv[1]) / dv };
            let tx = ((nu * tw) as i32).clamp(0, tw_max);
            let ty = ((nv * th) as i32).clamp(0, th_max);
            let ti = ((ty * tw as i32 + tx) * 4) as usize;
            let (tr, tg, tb, ta) = (tex.rgba[ti], tex.rgba[ti + 1], tex.rgba[ti + 2], tex.rgba[ti + 3]);

            let sr = (tr as f32 * q.bright).round() as u8;
            let sg = (tg as f32 * q.bright).round() as u8;
            let sb = (tb as f32 * q.bright).round() as u8;

            let fi = idx * 4;
            if ta == 255 {
                zbuf[idx] = z;
                fbuf[fi] = sr;
                fbuf[fi + 1] = sg;
                fbuf[fi + 2] = sb;
                fbuf[fi + 3] = 255;
            } else if ta > 0 {
                // "over" compositing; translucent pixels don't occlude.
                let (dr, dg, db) = (fbuf[fi] as f32, fbuf[fi + 1] as f32, fbuf[fi + 2] as f32);
                let da = fbuf[fi + 3] as f32 / 255.0;
                let sa = ta as f32 / 255.0;
                let out_a = sa + da * (1.0 - sa);
                if out_a <= 0.0 {
                    continue;
                }
                fbuf[fi] = ((sr as f32 * sa + dr * da * (1.0 - sa)) / out_a).round() as u8;
                fbuf[fi + 1] = ((sg as f32 * sa + dg * da * (1.0 - sa)) / out_a).round() as u8;
                fbuf[fi + 2] = ((sb as f32 * sa + db * da * (1.0 - sa)) / out_a).round() as u8;
                fbuf[fi + 3] = (out_a * 255.0).round() as u8;
            }
        }
    }
}

fn edge(ax: f32, ay: f32, bx: f32, by: f32, px: f32, py: f32) -> f32 {
    (bx - ax) * (py - ay) - (by - ay) * (px - ax)
}

#[cfg(test)]
mod tests;
