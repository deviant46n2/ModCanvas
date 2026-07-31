// Texture (PNG) merge helpers for the instance texture index.

use base64::Engine;
use base64::engine::general_purpose::STANDARD;
use std::collections::HashMap;
use std::fs;
use std::path::Path;

/// Per-key winner for one layer merge pass.
#[derive(Debug)]
pub struct Winner {
    pub layer: u32,
    pub kind: u8,
    pub url: String,
}

/// Insert one PNG into the winner map under all key forms. `kind` ranks short
/// key collisions so `item/` beats `block/` beats `model/` within a layer.
pub fn merge_png(
    by_id: &mut HashMap<String, Winner>,
    layer: u32,
    ns: &str,
    rest_no_ext: &str,
    url: String,
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
            by_id.insert(key, Winner { layer, kind: k, url: url.clone() });
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
                by_id.insert(key, Winner { layer, kind: prio, url });
            }
            return;
        }
    }
}

/// Scan a JAR or resource-pack ZIP, merging every PNG into the winner map.
pub fn merge_archive(by_id: &mut HashMap<String, Winner>, layer: u32, path: &Path) {
    match crate::icons::scan_jar_for_textures(path) {
        Ok(textures) => {
            for tex in textures {
                let rest = tex.path.replace('\\', "/");
                let prefix = format!("assets/{}/textures/", tex.namespace);
                let Some(rest) = rest.strip_prefix(&prefix) else { continue };
                let rest_no_ext = rest.strip_suffix(".png").unwrap_or(rest);
                merge_png(by_id, layer, &tex.namespace, rest_no_ext, tex.data_url, 0);
            }
        }
        Err(_) => {}
    }
}

/// Recursively merge PNG files under a directory (KubeJS assets).
pub fn merge_dir(by_id: &mut HashMap<String, Winner>, layer: u32, dir: &Path) {
    fn walk(by_id: &mut HashMap<String, Winner>, layer: u32, dir: &Path, base: &Path) {
        for entry in fs::read_dir(dir).ok().into_iter().flatten().flatten() {
            let path = entry.path();
            if path.is_dir() {
                walk(by_id, layer, &path, base);
            } else if path.extension().map_or(false, |e| e == "png") {
                let rel = path.strip_prefix(base).unwrap_or(&path).to_string_lossy().replace('\\', "/");
                let parts: Vec<&str> = rel.split('/').collect();
                if parts.len() < 3 || parts[1] != "textures" {
                    continue;
                }
                let rest = rel[rel.find("/textures/").map(|i| i + "/textures/".len()).unwrap_or(0)..].to_string();
                let rest_no_ext = rest.strip_suffix(".png").unwrap_or(&rest);
                if let Ok(buf) = fs::read(&path) {
                    if !buf.is_empty() {
                        let url = format!("data:image/png;base64,{}", STANDARD.encode(&buf));
                        merge_png(by_id, layer, parts[0], rest_no_ext, url, 0);
                    }
                }
            }
        }
    }
    walk(by_id, layer, dir, dir);
}
