use std::collections::HashMap;
use std::fs;
use std::io::Read;
use std::path::Path;
use zip::ZipArchive;

/// True for lang keys like `item.theurgy.alchemical_sulfur_dragonfruit.tooltip.extended`
/// — description/tooltip strings that start with `item.` but are NOT item
/// registrations. Counting them as items flooded the registry with unrenderable
/// entries (77% of a large pack's "items" had no texture, all tooltips).
pub(super) fn is_fake_item_key(rest: &str) -> bool {
    const MARKERS: [&str; 16] = [
        ".tooltip", ".desc", ".description", ".lore", ".info", ".help",
        ".guide", ".how_to", ".howto", ".wiki", ".jei", ".page", ".example",
        ".tips", ".advancement", ".chapter",
    ];
    MARKERS.iter().any(|m| rest.contains(m))
}

/// UI pseudo-namespaces that use the `item.<ns>.<path>` shape but are NOT
/// registry namespaces (verified against the vanilla 1.21.1 client jar,
/// s44): `item.modifiers.*` are attribute-component keys, `item.canUse.*`
/// and the no-third-segment labels (`item.color`, `item.disabled`, ...) are
/// tooltip labels. Treating `item.canUse.unknown` as an item flooded the
/// registry with `canUse:unknown` (mod_id "canUse") — the s44 probe caught
/// it in the pack index's item set. A real item key is `item.<ns>.<path>`
/// where `ns` is a registry namespace; these are not.
const UI_PSEUDO_NAMESPACES: [&str; 2] = ["canUse", "modifiers"];

/// A lang key is a REAL item registration when, after `item.`, it has the
/// shape `ns.path` with a non-empty path and a non-UI namespace. Tooltip/
/// desc markers are rejected by `is_fake_item_key` first.
pub(super) fn is_real_item_key(rest: &str) -> bool {
    if is_fake_item_key(rest) {
        return false;
    }
    let Some((ns, path)) = rest.split_once('.') else {
        return false; // `item.color` — UI label, no path
    };
    if ns.is_empty() || path.is_empty() {
        return false;
    }
    !UI_PSEUDO_NAMESPACES.contains(&ns)
}

pub(super) fn parse_lang_for_items(lang_json: &str) -> Vec<(String, String, String)> {
    let mut items = Vec::new();
    let map: HashMap<String, String> = match serde_json::from_str(lang_json) {
        Ok(m) => m,
        Err(_) => return items,
    };
    for (key, value) in &map {
        if let Some(rest) = key.strip_prefix("item.") {
            if !is_real_item_key(rest) {
                continue;
            }
            if let Some(dot) = rest.find('.') {
                let namespace = &rest[..dot];
                let path = &rest[dot + 1..];
                items.push((format!("{}:{}", namespace, path), value.clone(), namespace.to_string()));
            }
        } else if let Some(rest) = key.strip_prefix("block.") {
            if !is_real_item_key(rest) {
                continue;
            }
            if let Some(dot) = rest.find('.') {
                let namespace = &rest[..dot];
                let path = &rest[dot + 1..];
                items.push((format!("{}:{}", namespace, path), value.clone(), namespace.to_string()));
            }
        }
    }
    items
}

pub(super) fn scan_jar_for_items_and_textures(jar_path: &Path) -> anyhow::Result<(
    Vec<(String, String, String)>,
    HashMap<String, String>,
    HashMap<String, Vec<String>>,
)> {
    let file = fs::File::open(jar_path)?;
    let mut archive = ZipArchive::new(file)?;
    let mut lang_items = Vec::new();
    let mut texture_map: HashMap<String, String> = HashMap::new();
    let mut model_entries: HashMap<String, Vec<String>> = HashMap::new();

    for i in 0..archive.len() {
        let mut entry = match archive.by_index(i) {
            Ok(e) => e,
            Err(_) => continue,
        };
        let name = entry.name().replace('\\', "/");

        if name.ends_with(".png") && name.starts_with("assets/") {
            let parts: Vec<&str> = name.split('/').collect();
            if parts.len() >= 5 && parts[0] == "assets" && parts[2] == "textures" {
                let namespace = parts[1];
                let rest = parts[3..].join("/");
                let item_key = rest.strip_suffix(".png").unwrap_or(&rest).to_string();
                let full_key = format!("{}:{}", namespace, item_key);

                // Enumeration-only: store the compact `jar:<abs>!<zip>` descriptor,
                // never the PNG bytes. Displayable URLs are materialized lazily on
                // demand (AGENTS.md: scans must not read PNG bytes).
                let descriptor = format!("jar:{}!{}", jar_path.display(), name);
                texture_map.insert(full_key, descriptor);
            }
        } else if name.ends_with("en_us.json") && name.starts_with("assets/") {
            let parts: Vec<&str> = name.split('/').collect();
            if parts.len() >= 4 && parts[0] == "assets" && parts[2] == "lang" {
                let mut buf = Vec::new();
                if entry.read_to_end(&mut buf).is_ok() {
                    if let Ok(lang_str) = String::from_utf8(buf) {
                        lang_items.extend(parse_lang_for_items(&lang_str));
                    }
                }
            }
        } else if name.contains("/models/item/") && name.ends_with(".json") {
            let parts: Vec<&str> = name.split('/').collect();
            if parts.len() >= 4 && parts[0] == "assets" {
                let namespace = parts[1];
                let path = parts[3..].join("/");
                // path = "item/crafting_table.json"
                let item_name = path
                    .strip_prefix("item/")
                    .and_then(|s| s.strip_suffix(".json"))
                    .unwrap_or("");

                let mut buf = Vec::new();
                if entry.read_to_end(&mut buf).is_ok() && !buf.is_empty() {
                    if let Ok(json_str) = String::from_utf8(buf) {
                        if let Ok(model) = serde_json::from_str::<serde_json::Value>(&json_str) {
                            let mut refs = Vec::new();
                            if let Some(tex_obj) = model.get("textures").and_then(|t| t.as_object()) {
                                for (_slot, tex_ref) in tex_obj {
                                    if let Some(ref_str) = tex_ref.as_str() {
                                        if !ref_str.starts_with("#") {
                                            refs.push(ref_str.to_string());
                                        }
                                    }
                                }
                            }
                            if !refs.is_empty() && !item_name.is_empty() {
                                let item_id = format!("{}:{}", namespace, item_name);
                                model_entries.insert(item_id, refs);
                            }
                        }
                    }
                }
            }
        }
    }

    Ok((lang_items, texture_map, model_entries))
}

pub(super) fn resolve_texture_from_model(
    item_id: &str,
    model_textures: &HashMap<String, Vec<String>>,
    all_textures: &HashMap<String, String>,
) -> Option<String> {
    let refs = model_textures.get(item_id)?;
    for tex_ref in refs {
        let key = if tex_ref.contains(':') {
            tex_ref.clone()
        } else {
            let (ns, _) = item_id.split_once(':').unwrap_or(("minecraft", ""));
            format!("{}:{}", ns, tex_ref)
        };
        if let Some(url) = all_textures.get(&key) {
            return Some(url.clone());
        }
    }
    None
}

pub(super) fn find_texture_for_item(item_id: &str, textures: &HashMap<String, String>) -> Option<String> {
    let (namespace, path) = item_id.split_once(':')?;

    let candidates = [
        format!("{}:item/{}", namespace, path),
        format!("{}:block/{}", namespace, path),
        format!("{}:model/{}", namespace, path),
    ];

    for key in &candidates {
        if textures.contains_key(key) {
            return Some(key.clone());
        }
    }

    None
}
