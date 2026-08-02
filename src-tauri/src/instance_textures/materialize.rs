// Lazy materialization of texture keys to data URLs.
//
// Reads PNG bytes only on demand (batch per jar, capped by the frontend's
// BATCH_SIZE) and renders `bake:` descriptors into isometric PNGs via the
// software rasterizer. No image bytes are ever stored in the index cache.

use super::models;
use super::{compact_index, models_for};
use std::collections::HashMap;
use std::fs;
use std::path::Path;

/// Materialize a batch of texture keys to data URLs, opening each source jar at
/// most once. Keys not present in the index are omitted (None on lookup miss).
/// Keys whose source is a `bake:` descriptor are rendered to isometric PNGs.
pub fn resolve_texture_urls(
    instance_path: &Path,
    keys: &[String],
) -> HashMap<String, Option<String>> {
    let index = compact_index(instance_path);
    let mut out: HashMap<String, Option<String>> = HashMap::new();
    let mut by_jar: HashMap<&str, Vec<(&str, &str)>> = HashMap::new();
    let mut fs_sources: Vec<(&str, String)> = Vec::new();
    let mut bake_keys: Vec<(&str, &str)> = Vec::new();

    for key in keys {
        let Some(src) = index.get(key) else { continue };
        if let Some(model_ref) = src.strip_prefix("bake:") {
            bake_keys.push((key.as_str(), model_ref));
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

    if !bake_keys.is_empty() {
        let models = models_for(instance_path);
        for (key, model_ref) in bake_keys {
            if let Some(url) = bake_icon(models.as_ref(), &index, model_ref) {
                out.insert(key.to_string(), Some(url));
            }
        }
    }
    out
}

/// Bake a `bake:` model descriptor into a PNG data URL. Skips faces whose
/// textures are missing from the index; returns None when nothing renders.
pub(super) fn bake_icon(models: &models::Models, index: &HashMap<String, String>, model_ref: &str) -> Option<String> {
    let merged = models::baker::MergedModel::resolve(models, model_ref)?;
    let mut textures: HashMap<String, models::raster::Texture> = HashMap::new();
    for el in &merged.elements {
        for f in &el.faces {
            if textures.contains_key(&f.texture) {
                continue;
            }
            let src = index_source(index, &f.texture)?;
            let bytes = read_source_bytes(&src)?;
            let tex = decode_png(&bytes)?;
            textures.insert(f.texture.clone(), tex);
        }
    }
    let png = models::raster::render(&merged, &textures)?;
    Some(format!(
        "data:image/png;base64,{}",
        base64::Engine::encode(&base64::engine::general_purpose::STANDARD, &png)
    ))
}

/// Find the compact source descriptor for a texture id (`ns:path`) in the index.
fn index_source(index: &HashMap<String, String>, id: &str) -> Option<String> {
    if let Some(v) = index.get(id) {
        return Some(v.clone());
    }
    if let Some((ns, rest)) = id.split_once(':') {
        let forms = [
            format!("{}:textures/{}", ns, rest),
            format!("{}:textures/{}.png", ns, rest),
        ];
        for form in forms {
            if let Some(v) = index.get(&form) {
                return Some(v.clone());
            }
        }
    }
    None
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
    let file = fs::File::open(jar).ok()?;
    let mut archive = zip::ZipArchive::new(file).ok()?;
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

/// Read the raw bytes behind a compact source descriptor (`jar:<path>!<entry>`
/// or an absolute filesystem path).
pub(super) fn read_source_bytes(source: &str) -> Option<Vec<u8>> {
    use std::io::Read;
    if let Some(rest) = source.strip_prefix("jar:") {
        let (jar, internal) = rest.split_once('!')?;
        let file = fs::File::open(jar).ok()?;
        let mut archive = zip::ZipArchive::new(file).ok()?;
        let mut buf = Vec::new();
        archive.by_name(internal).ok()?.read_to_end(&mut buf).ok()?;
        Some(buf)
    } else {
        fs::read(source).ok()
    }
}

/// Decode a PNG into an RGBA8 [`models::raster::Texture`].
pub(super) fn decode_png(bytes: &[u8]) -> Option<models::raster::Texture> {
    use std::io::Cursor;
    let mut decoder = png::Decoder::new(Cursor::new(bytes));
    decoder.set_transformations(png::Transformations::EXPAND | png::Transformations::STRIP_16);
    let mut reader = decoder.read_info().ok()?;
    let mut buf = vec![0u8; reader.output_buffer_size()];
    let info = reader.next_frame(&mut buf).ok()?;
    let (w, h) = (info.width as u32, info.height as u32);
    let rgba = match reader.output_color_type() {
        (png::ColorType::Rgba, png::BitDepth::Eight) => buf,
        (png::ColorType::Rgb, png::BitDepth::Eight) => buf
            .chunks_exact(3)
            .flat_map(|c| [c[0], c[1], c[2], 255])
            .collect(),
        (png::ColorType::Grayscale, png::BitDepth::Eight) => {
            buf.iter().flat_map(|&g| [g, g, g, 255]).collect()
        }
        (png::ColorType::GrayscaleAlpha, png::BitDepth::Eight) => buf
            .chunks_exact(2)
            .flat_map(|c| [c[0], c[0], c[0], c[1]])
            .collect(),
        _ => return None,
    };
    Some(models::raster::Texture { w, h, rgba })
}
