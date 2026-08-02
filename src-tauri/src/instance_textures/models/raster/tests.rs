use super::*;
use crate::instance_textures::models::baker::{FaceDir, MergedFace};

fn tex(w: u32, h: u32, rgb: u8) -> Texture {
    let mut rgba = vec![0u8; (w * h * 4) as usize];
    for px in rgba.chunks_exact_mut(4) {
        px[0] = rgb;
        px[1] = rgb;
        px[2] = rgb;
        px[3] = 255;
    }
    Texture { w, h, rgba }
}

fn cube_model() -> MergedModel {
    // A single full-cube element; matches the block/cube model geometry.
    let faces = [
        (FaceDir::Up, "top".to_string(), 0),
        (FaceDir::Down, "bottom".to_string(), 0),
        (FaceDir::North, "north".to_string(), 0),
        (FaceDir::South, "south".to_string(), 0),
        (FaceDir::West, "west".to_string(), 0),
        (FaceDir::East, "east".to_string(), 0),
    ]
    .into_iter()
    .map(|(dir, tex, rot)| MergedFace {
        dir,
        texture: tex,
        uv: [0.0, 0.0, 16.0, 16.0],
        rotation: rot,
    })
    .collect();
    MergedModel {
        elements: vec![crate::instance_textures::models::baker::MergedElement {
            from: [0.0, 0.0, 0.0],
            to: [16.0, 16.0, 16.0],
            rotation: None,
            rescale: false,
            shade: true,
            faces,
        }],
        display: crate::instance_textures::models::baker::Display {
            rotation: [30.0, 225.0, 0.0],
            translation: [0.0, 0.0, 0.0],
            scale: [0.625, 0.625, 0.625],
        },
    }
}

fn textures_for(model: &MergedModel) -> HashMap<String, Texture> {
    let mut m = HashMap::new();
    for el in &model.elements {
        for f in &el.faces {
            m.insert(f.texture.clone(), tex(16, 16, 200));
        }
    }
    m
}

#[test]
fn render_cube_produces_icon_png() {
    let model = cube_model();
    let out = render(&model, &textures_for(&model)).expect("render should succeed");
    assert!(out.len() > 8, "png header + data");
    assert_eq!(&out[0..4], [0x89, b'P', b'N', b'G']);
    assert_eq!(&out[16..20], super::OUTPUT_SIZE.to_be_bytes().as_slice());
}

#[test]
fn render_fills_some_pixels_and_has_shading() {
    let model = cube_model();
    let out = render(&model, &textures_for(&model)).expect("render");
    let mut dec = png::Decoder::new(std::io::Cursor::new(out));
    dec.set_transformations(png::Transformations::EXPAND);
    let mut reader = dec.read_info().expect("header");
    let mut buf = vec![0u8; reader.output_buffer_size()];
    let info = reader.next_frame(&mut buf).expect("frame");
    assert_eq!((info.width, info.height), (super::OUTPUT_SIZE, super::OUTPUT_SIZE));
    // Opaque, non-background pixels exist (the cube covers a band).
    let opaque = buf.chunks_exact(4).filter(|px| px[3] == 255).count();
    assert!(opaque > 1000, "expected a visible cube, got {} px", opaque);
    // Both a lit (top) and shaded (east/south) side should be present.
    let values: Vec<u8> = buf
        .chunks_exact(4)
        .filter(|px| px[3] == 255)
        .map(|px| px[0])
        .collect();
    let min = *values.iter().min().unwrap();
    let max = *values.iter().max().unwrap();
    assert!(max > min, "expected per-face shading (max={} min={})", max, min);
}

/// Every visible face — including the block SIDES — must sample BOTH texels of
/// a 2-color checker texture.
/// Regression: `raster_tri` weighted the sign-flipped edges against the
/// un-flipped `1/area`, so for clockwise triangles the barycentric weights
/// summed to -1 and every pixel of that triangle clamped to one texel. The top
/// face's visible triangle is counter-clockwise and stayed correct, so the
/// artifact appeared only on the sides (each rasterized as two solid halves).
/// Uses `shade:false` so the only color variation comes from UV sampling, not
/// per-face lighting.
#[test]
fn both_checker_texels_render_on_each_face() {
    let model = cube_model();
    // Override to a two-tone checker with no shading variance.
    let mut textures = textures_for(&model);
    for (name, t) in textures.iter_mut() {
        t.rgba = checker_rgba(40, 200);
        let _ = name;
    }
    // shade:false on every face so brightness cannot mask sampling artifacts.
    let mut model = model;
    for el in &mut model.elements {
        el.shade = false;
    }
    let out = render(&model, &textures).expect("render");
    let mut dec = png::Decoder::new(std::io::Cursor::new(out));
    dec.set_transformations(png::Transformations::EXPAND);
    let mut reader = dec.read_info().expect("header");
    let mut buf = vec![0u8; reader.output_buffer_size()];
    let info = reader.next_frame(&mut buf).expect("frame");
    let w = info.width as usize;
    let h = info.height as usize;
    // The top face is the large lit quad in the top third; the two side faces
    // occupy the middle and bottom thirds. Every band must sample both texels
    // at full opacity, proving UV interpolation spans the whole texture.
    let mut bad: Vec<String> = Vec::new();
    for (band_idx, (y0, y1)) in [(0usize, h / 3), (h / 3, 2 * h / 3), (2 * h / 3, h)].iter().enumerate() {
        let mut lo = false;
        let mut hi = false;
        for y in *y0..*y1 {
            for x in 0..w {
                let i = (y * w + x) * 4;
                if buf[i + 3] == 255 {
                    lo |= buf[i] < 128;
                    hi |= buf[i] >= 128;
                }
            }
        }
        if !(lo && hi) {
            bad.push(format!("band{band_idx}(lo={lo} hi={hi})"));
        }
    }
    assert!(
        bad.is_empty(),
        "side faces rendered as a solid color (missing one checker texel): {}",
        bad.join(", ")
    );
}

/// A 16×16 two-tone checker (50% 40-gray, 50% 200-gray).
fn checker_rgba(a: u8, b: u8) -> Vec<u8> {
    let w = 16u32;
    let h = 16u32;
    let mut rgba = vec![0u8; (w * h * 4) as usize];
    for y in 0..h {
        for x in 0..w {
            let i = ((y * w + x) * 4) as usize;
            let v = if (x / 2 + y / 2) % 2 == 0 { a } else { b };
            rgba[i] = v;
            rgba[i + 1] = v;
            rgba[i + 2] = v;
            rgba[i + 3] = 255;
        }
    }
    rgba
}

#[test]
fn renders_with_translucent_texels() {
    let model = cube_model();
    let mut textures = textures_for(&model);
    for t in textures.values_mut() {
        for px in t.rgba.chunks_exact_mut(4) {
            px[3] = 128;
        }
    }
    let out = render(&model, &textures).expect("render");
    assert!(out.len() > 8);
}

#[test]
fn missing_texture_skips_that_face() {
    let model = cube_model();
    let mut textures = textures_for(&model);
    textures.remove("north");
    let out = render(&model, &textures).expect("render should still succeed");
    assert!(out.len() > 8);
}

#[test]
fn face_corners_match_expected_positions() {
    let corners = face_corners(FaceDir::Up, [0.0, 4.0, 0.0], [16.0, 4.0, 16.0], [0.0, 0.0, 16.0, 16.0], 0);
    let ys: Vec<f32> = corners.iter().map(|(p, _)| p[1]).collect();
    assert!(ys.iter().all(|&y| (y - 4.0).abs() < 1e-6), "up face stays on the top plane");
}

#[test]
fn down_face_uvs_mirror_rotation() {
    // Vanilla reverses the rotation direction on the mirrored down face.
    assert_eq!(rotate_corner((0, 0), 1, false), (1, 0));
    assert_eq!(rotate_corner((0, 0), 1, true), (0, 1));
}

#[test]
fn face_rotation_permutes_uvs() {
    let r0 = rotate_corner((0, 0), 0, false);
    assert_eq!(r0, (0, 0));
    let r1 = rotate_corner((0, 0), 1, false);
    assert_eq!(r1, (1, 0));
    let r2 = rotate_corner((0, 0), 2, false);
    assert_eq!(r2, (1, 1));
}

#[test]
fn euler_matrix_rotates_yaw() {
    let m = euler_matrix([0.0, 90.0, 0.0]);
    // A +90° yaw maps +X (east) onto -Z (south), matching JOML rotateXYZ.
    let v = mat3_mul_vec3(&m, &[1.0, 0.0, 0.0]);
    assert!(v[0].abs() < 1e-4 && v[2] < -0.99, "expected -Z, got {v:?}");
}
