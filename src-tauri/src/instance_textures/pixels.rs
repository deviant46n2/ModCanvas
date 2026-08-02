// Texture (PNG) merge helpers for the instance texture index.

// Sources are kept compact: a texture's *location* rather than its encoded
// bytes. Values are either `jar:<abs_path>!<internal_zip_path>` for archives or
// an absolute filesystem path for kubejs assets. The index stays a few MB
// instead of hundreds, and data URLs are materialized lazily on demand.
use std::collections::HashMap;
use std::fs;
use std::path::Path;

/// Per-key winner for one layer merge pass.
#[derive(Debug)]
pub struct Winner {
    pub layer: u32,
    pub kind: u8,
    pub source: String,
}

/// Insert one PNG source into the winner map under all key forms. `kind` ranks
/// short key collisions so `item/` beats `block/` beats `model/` within a layer.
pub fn merge_png(
    by_id: &mut HashMap<String, Winner>,
    layer: u32,
    ns: &str,
    rest_no_ext: &str,
    source: String,
    kind: u8,
) {
    let forms = [
        (format!("{}:{}", ns, rest_no_ext), kind),
        (format!("{}:textures/{}", ns, rest_no_ext), 0),
        (format!("{}:textures/{}.png", ns, rest_no_ext), 0),
    ];
    for (key, k) in forms {
        let better = match by_id.get(&key) {
            Some(w) => layer > w.layer || (layer == w.layer && k >= w.kind),
            None => true,
        };
        if better {
            by_id.insert(key, Winner { layer, kind: k, source: source.clone() });
        }
    }
    // Short key: strip item/block/model prefix so bare ids (minecraft:diamond)
    // resolve to the same winner as the full path key.
    for (prefix, prio) in [("item/", 3u8), ("block/", 2u8), ("model/", 1u8)] {
        if let Some(stripped) = rest_no_ext.strip_prefix(prefix) {
            let key = format!("{}:{}", ns, stripped);
            let better = match by_id.get(&key) {
                Some(w) => layer > w.layer || (layer == w.layer && prio >= w.kind),
                None => true,
            };
            if better {
                by_id.insert(key, Winner { layer, kind: prio, source });
            }
            return;
        }
    }
}

/// Scan a JAR or resource-pack ZIP, merging every PNG path into the winner map
/// AND collecting Minecraft animation metadata (`<texture>.png.mcmeta`) for the
/// same archives in the same single pass. Only zip entry names are enumerated —
/// no texture bytes are read here. `mcmeta` maps the PNG's archive-relative path
/// (e.g. `assets/minecraft/textures/block/lava.png`) to the raw `.mcmeta` JSON.
pub fn merge_archive_ex(
    by_id: &mut HashMap<String, Winner>,
    layer: u32,
    path: &Path,
    mut mcmeta: Option<&mut HashMap<String, String>>,
) {
    use std::io::Read;
    let file = match fs::File::open(path) {
        Ok(f) => f,
        Err(_) => return,
    };
    let mut archive = match zip::ZipArchive::new(file) {
        Ok(a) => a,
        Err(_) => return,
    };
    let jar_path = path.to_string_lossy().replace('\\', "/");
    for i in 0..archive.len() {
        let mut entry = match archive.by_index(i) {
            Ok(e) => e,
            Err(_) => continue,
        };
        let raw = entry.name().to_string();
        // Normalize backslashes (Windows zip compat) then parse.
        let name = raw.replace('\\', "/");
        if let Some(mcmeta) = mcmeta.as_deref_mut() {
            if let Some(png) = name.strip_suffix(".png.mcmeta") {
                let mut bytes = Vec::new();
                if entry.read_to_end(&mut bytes).is_ok() {
                    let png_path = format!("{}.png", png);
                    mcmeta.insert(png_path, String::from_utf8_lossy(&bytes).into_owned());
                }
                continue;
            }
        }
        if !name.ends_with(".png") {
            continue;
        }
        let Some(rest) = name.strip_prefix("assets/") else { continue };
        let Some(slash) = rest.find('/') else { continue };
        let (ns, tail) = rest.split_at(slash);
        let Some(inner) = tail.strip_prefix("/textures/") else { continue };
        let rest_no_ext = inner.strip_suffix(".png").unwrap_or(inner);
        if ns.is_empty() || rest_no_ext.is_empty() {
            continue;
        }
        let source = format!("jar:{}!{}", jar_path, name);
        merge_png(by_id, layer, ns, rest_no_ext, source, 0);
    }
}

/// Recursively merge PNG files under a directory (KubeJS assets) AND collect
/// `.png.mcmeta` animation metadata in the same walk. Sources are absolute
/// filesystem paths; `mcmeta` maps the PNG's absolute path to the `.mcmeta` JSON.
pub fn merge_dir_ex(
    by_id: &mut HashMap<String, Winner>,
    layer: u32,
    dir: &Path,
    mut mcmeta: Option<&mut HashMap<String, String>>,
) {
    fn walk(
        by_id: &mut HashMap<String, Winner>,
        layer: u32,
        dir: &Path,
        base: &Path,
        mcmeta: &mut Option<&mut HashMap<String, String>>,
    ) {
        for entry in fs::read_dir(dir).ok().into_iter().flatten().flatten() {
            let path = entry.path();
            if path.is_dir() {
                walk(by_id, layer, &path, base, mcmeta);
            } else {
                let is_mcmeta = path
                    .file_name()
                    .map_or(false, |n| n.to_string_lossy().ends_with(".png.mcmeta"));
                let is_png = path.extension().map_or(false, |e| e == "png");
                if !is_mcmeta && !is_png {
                    continue;
                }
                if is_mcmeta {
                    if let Some(m) = mcmeta.as_deref_mut() {
                        let png_path = path.to_string_lossy().trim_end_matches(".mcmeta").to_string();
                        if let Ok(bytes) = fs::read(&path) {
                            m.insert(png_path, String::from_utf8_lossy(&bytes).into_owned());
                        }
                    }
                    continue;
                }
                let rel = path.strip_prefix(base).unwrap_or(&path).to_string_lossy().replace('\\', "/");
                let parts: Vec<&str> = rel.split('/').collect();
                if parts.len() < 3 || parts[1] != "textures" {
                    continue;
                }
                let rest = rel[rel.find("/textures/").map(|i| i + "/textures/".len()).unwrap_or(0)..].to_string();
                let rest_no_ext = rest.strip_suffix(".png").unwrap_or(&rest);
                merge_png(by_id, layer, parts[0], rest_no_ext, path.to_string_lossy().to_string(), 0);
            }
        }
    }
    walk(by_id, layer, dir, dir, &mut mcmeta);
}
