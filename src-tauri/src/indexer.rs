use base64::Engine;
use base64::engine::general_purpose::STANDARD;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::hash::{Hash, Hasher};
use std::collections::hash_map::DefaultHasher;
use std::io::Read;
use std::path::{Path, PathBuf};
use walkdir::WalkDir;
use zip::ZipArchive;

use crate::indexer_kubejs::{
    collect_kubejs_scripts, parse_kubejs_item_registrations, KubejsItemRegistration, KubejsScriptMeta,
};

/// Bump whenever the cache shape, key forms, or layer semantics change so
/// existing on-disk caches rescan once.
const ITEM_CACHE_VERSION: u32 = 2;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ItemRegistryEntry {
    pub id: String,
    pub name: String,
    pub mod_id: String,
    pub texture_data_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct JarMeta {
    file_name: String,
    size: u64,
    modified: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct ItemIndexerCache {
    version: u32,
    jars: Vec<JarMeta>,
    kubejs: Vec<KubejsScriptMeta>,
    items: Vec<ItemRegistryEntry>,
}

fn dirs_cache_dir() -> Option<PathBuf> {
    if let Ok(data) = std::env::var("XDG_CACHE_HOME") {
        return Some(PathBuf::from(data).join("modcanvas"));
    }
    if let Ok(home) = std::env::var("HOME") {
        return Some(PathBuf::from(home).join(".cache").join("modcanvas"));
    }
    None
}

fn cache_path(instance_path: &Path) -> PathBuf {
    let mut h = DefaultHasher::new();
    let canonical = fs::canonicalize(instance_path).unwrap_or_else(|_| instance_path.to_path_buf());
    canonical.to_string_lossy().replace('\\', "/").hash(&mut h);
    let hash = format!("{:016x}", h.finish());
    let cache_dir = dirs_cache_dir().unwrap_or_else(|| std::env::temp_dir().join("modcanvas_cache"));
    let _ = fs::create_dir_all(&cache_dir);
    cache_dir.join(format!("items_{}.json", hash))
}

fn get_jar_meta(path: &Path) -> Option<JarMeta> {
    let meta = fs::metadata(path).ok()?;
    let size = meta.len();
    let modified = meta
        .modified()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_secs())
        .unwrap_or(0);
    Some(JarMeta {
        file_name: path.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default(),
        size,
        modified,
    })
}

/// True for lang keys like `item.theurgy.alchemical_sulfur_dragonfruit.tooltip.extended`
/// — description/tooltip strings that start with `item.` but are NOT item
/// registrations. Counting them as items flooded the registry with unrenderable
/// entries (77% of a large pack's "items" had no texture, all tooltips).
fn is_fake_item_key(rest: &str) -> bool {
    const MARKERS: [&str; 16] = [
        ".tooltip", ".desc", ".description", ".lore", ".info", ".help",
        ".guide", ".how_to", ".howto", ".wiki", ".jei", ".page", ".example",
        ".tips", ".advancement", ".chapter",
    ];
    MARKERS.iter().any(|m| rest.contains(m))
}

fn parse_lang_for_items(lang_json: &str) -> Vec<(String, String, String)> {
    let mut items = Vec::new();
    let map: HashMap<String, String> = match serde_json::from_str(lang_json) {
        Ok(m) => m,
        Err(_) => return items,
    };
    for (key, value) in &map {
        if let Some(rest) = key.strip_prefix("item.") {
            if is_fake_item_key(rest) {
                continue;
            }
            if let Some(dot) = rest.find('.') {
                let namespace = &rest[..dot];
                let path = &rest[dot + 1..];
                items.push((format!("{}:{}", namespace, path), value.clone(), namespace.to_string()));
            }
        } else if let Some(rest) = key.strip_prefix("block.") {
            if is_fake_item_key(rest) {
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

fn scan_jar_for_items_and_textures(jar_path: &Path) -> anyhow::Result<(
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

                let mut buf = Vec::new();
                if entry.read_to_end(&mut buf).is_ok() && !buf.is_empty() {
                    let b64 = STANDARD.encode(&buf);
                    let data_url = format!("data:image/png;base64,{}", b64);
                    texture_map.insert(full_key, data_url);
                }
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

fn resolve_texture_from_model(
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

fn find_texture_for_item(item_id: &str, textures: &HashMap<String, String>) -> Option<String> {
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

fn load_cache(
    instance_path: &Path,
    current_jars: &[(PathBuf, JarMeta)],
    current_kubejs: &[(PathBuf, KubejsScriptMeta)],
) -> Option<Vec<ItemRegistryEntry>> {
    let cp = cache_path(instance_path);
    if !cp.exists() {
        return None;
    }
    let data = fs::read_to_string(&cp).ok()?;
    let cached: ItemIndexerCache = serde_json::from_str(&data).ok()?;

    if cached.version != ITEM_CACHE_VERSION {
        return None;
    }

    if current_jars.len() != cached.jars.len() {
        return None;
    }

    let cached_map: HashMap<&str, &JarMeta> = cached.jars.iter().map(|j| (j.file_name.as_str(), j)).collect();
    let all_match = current_jars.iter().all(|(_path, meta)| {
        cached_map.get(meta.file_name.as_str()).map_or(false, |cm| {
            cm.size == meta.size && cm.modified == meta.modified
        })
    });

    if !all_match {
        return None;
    }

    // KubeJS script fingerprints: any script add/remove/edit invalidates.
    if current_kubejs.len() != cached.kubejs.len() {
        return None;
    }
    let cached_ks: HashMap<&str, &KubejsScriptMeta> = cached.kubejs.iter().map(|k| (k.path.as_str(), k)).collect();
    let kubejs_match = current_kubejs.iter().all(|(_path, meta)| {
        cached_ks.get(meta.path.as_str()).map_or(false, |cm| {
            cm.size == meta.size && cm.modified == meta.modified
        })
    });

    if !kubejs_match {
        return None;
    }

    eprintln!("[Indexer] Cache hit: {} items for {}", cached.items.len(), instance_path.display());
    Some(cached.items)
}

fn save_cache(
    instance_path: &Path,
    current_jars: &[(PathBuf, JarMeta)],
    current_kubejs: &[(PathBuf, KubejsScriptMeta)],
    items: &[ItemRegistryEntry],
) {
    let jars: Vec<JarMeta> = current_jars.iter().map(|(_, meta)| meta.clone()).collect();
    let kubejs: Vec<KubejsScriptMeta> = current_kubejs.iter().map(|(_, meta)| meta.clone()).collect();
    let cache = ItemIndexerCache {
        version: ITEM_CACHE_VERSION,
        jars,
        kubejs,
        items: items.to_vec(),
    };
    let cp = cache_path(instance_path);
    if let Ok(data) = serde_json::to_string(&cache) {
        let _ = fs::write(&cp, &data);
        eprintln!("[Indexer] Cache saved: {} items for {}", items.len(), instance_path.display());
    }
}

/// Find the vanilla Minecraft client JAR and other library JARs that contain
/// item registrations (e.g. `assets/minecraft/lang/en_us.json`).
///
/// Checks these locations in order:
/// 1. PrismLauncher/MultiMC: `{launcher_root}/libraries/net/minecraft/client/`
/// 2. `{instance_root}/minecraft.jar` (some launchers keep it at the instance root)
/// 3. `{instance_root}/versions/` (Vanilla launcher style)
/// 4. `~/.minecraft/versions/` (global Vanilla launcher directory)
/// 5. JARs directly in the instance path (excluding `mods/`)
pub(crate) fn find_vanilla_jars(instance_path: &Path) -> Vec<PathBuf> {
    let mut jars = Vec::new();

    // 1. PrismLauncher / MultiMC: launcher root is 3 levels up from `instances/NAME/minecraft`
    //    e.g. `.../PrismLauncher/instances/1.21.1/minecraft`
    //                                    ^-- parent
    //                           ^-- parent     (= instances/1.21.1/)
    //                  ^-- parent              (= instances/)
    //         ^-- parent                       (= PrismLauncher/)
    //    libraries at `{launcher}/libraries/net/minecraft/client/`
    for ancestor in instance_path.ancestors().skip(1) {
        let client_lib = ancestor.join("libraries").join("net").join("minecraft").join("client");
        if client_lib.exists() {
            for entry in WalkDir::new(&client_lib).max_depth(3).into_iter().filter_map(|e| e.ok()) {
                let path = entry.path();
                let fname = path.file_name().map(|n| n.to_string_lossy()).unwrap_or_default();
                if fname.ends_with(".jar") && fname.contains("client") && !fname.contains("slim") {
                    jars.push(path.to_path_buf());
                }
            }
            break;
        }
    }

    // 2. Check the instance root directory itself
    let root_jar = instance_path.join("minecraft.jar");
    if root_jar.exists() {
        jars.push(root_jar);
    }

    // 3. Check a `versions/` dir at the instance root (parent of the minecraft dir)
    if let Some(parent_dir) = instance_path.parent() {
        let versions_dir = parent_dir.join("versions");
        if versions_dir.exists() {
            for entry in WalkDir::new(&versions_dir).max_depth(2).into_iter().filter_map(|e| e.ok()) {
                let path = entry.path();
                if path.extension().map_or(false, |ext| ext == "jar") {
                    jars.push(path.to_path_buf());
                }
            }
        }
    }

    // 4. Vanilla launcher: ~/.minecraft/versions/
    if let Ok(home) = std::env::var("HOME") {
        let home_versions = PathBuf::from(home).join(".minecraft").join("versions");
        if home_versions.exists() {
            for entry in WalkDir::new(&home_versions).max_depth(2).into_iter().filter_map(|e| e.ok()) {
                let path = entry.path();
                if path.extension().map_or(false, |ext| ext == "jar") {
                    jars.push(path.to_path_buf());
                }
            }
        }
    }

    // Deduplicate by canonical path
    let mut seen = std::collections::HashSet::new();
    jars.into_iter().filter(|p| {
        let canonical = fs::canonicalize(p).unwrap_or_else(|_| p.to_path_buf());
        seen.insert(canonical)
    }).collect()
}

pub fn scan_instance_items(instance_path: &Path, kubejs_namespace: &str) -> Result<Vec<ItemRegistryEntry>, String> {
    let mods_dir = instance_path.join("mods");

    // 1. Collect JARs from mods/
    let mut all_jars: Vec<PathBuf> = Vec::new();
    if mods_dir.exists() {
        if let Ok(entries) = fs::read_dir(&mods_dir) {
            for entry in entries.filter_map(|e| e.ok()) {
                let path = entry.path();
                if path.extension().map_or(false, |ext| ext == "jar") {
                    all_jars.push(path);
                }
            }
        }
    }

    // 2. Collect extra JARs (vanilla minecraft, libraries)
    let extra_jars = find_vanilla_jars(instance_path);
    for jar in extra_jars {
        if !all_jars.iter().any(|p| {
            fs::canonicalize(p).ok() == fs::canonicalize(&jar).ok()
        }) {
            all_jars.push(jar);
        }
    }

    // 3. Build metadata for cache check (jars + KubeJS scripts)
    let current_jars: Vec<(PathBuf, JarMeta)> = all_jars.iter()
        .filter_map(|p| {
            let meta = get_jar_meta(p)?;
            Some((p.clone(), meta))
        })
        .collect();
    let current_kubejs = collect_kubejs_scripts(instance_path);

    if current_jars.is_empty() && current_kubejs.is_empty() {
        return Ok(Vec::new());
    }

    if let Some(cached) = load_cache(instance_path, &current_jars, &current_kubejs) {
        return Ok(cached);
    }

    // 4. Scan all JARs for items, textures, and model files
    let mut all_items: Vec<ItemRegistryEntry> = Vec::new();
    let mut all_textures: HashMap<String, String> = HashMap::new();
    let mut all_model_textures: HashMap<String, Vec<String>> = HashMap::new();
    let mut seen_ids = std::collections::HashSet::new();

    for (jar_path, _) in &current_jars {
        match scan_jar_for_items_and_textures(jar_path) {
            Ok((jar_lang_items, jar_textures, jar_model_textures)) => {
                all_textures.extend(jar_textures);
                for (item_id, model_refs) in jar_model_textures {
                    all_model_textures.entry(item_id).or_default().extend(model_refs);
                }
                for (item_id, name, mod_id) in jar_lang_items {
                    if seen_ids.insert(item_id.clone()) {
                        let texture_data_url = find_texture_for_item(&item_id, &all_textures)
                            .and_then(|k| all_textures.get(&k))
                            .cloned()
                            .or_else(|| resolve_texture_from_model(&item_id, &all_model_textures, &all_textures));
                        all_items.push(ItemRegistryEntry {
                            id: item_id,
                            name,
                            mod_id,
                            texture_data_url,
                        });
                    }
                }
            }
            Err(e) => {
                eprintln!("[Indexer] Failed to scan jar {}: {}", jar_path.display(), e);
            }
        }
    }

    // 5. Scan KubeJS scripts for item registrations (`event.create`/`register`).
    //    Bare ids are namespaced with the adapter-provided default namespace;
    //    `.texture()` refs resolve against the jar texture map when possible.
    for (script_path, _) in &current_kubejs {
        let Ok(content) = fs::read_to_string(script_path) else { continue };
        for reg in parse_kubejs_item_registrations(&content) {
            let KubejsItemRegistration { id, display_name, texture } = reg;
            let full_id = namespace_kubejs_id(&id, kubejs_namespace);
            if !seen_ids.insert(full_id.clone()) {
                continue;
            }
            let name = display_name.unwrap_or_else(|| {
                full_id.split_once(':').map(|(_, p)| p.to_string()).unwrap_or_else(|| full_id.clone())
            });
            let texture_data_url = texture.as_ref().and_then(|t| {
                resolve_kubejs_texture(t, &full_id, kubejs_namespace, &all_textures)
            });
            all_items.push(ItemRegistryEntry {
                id: full_id,
                name,
                mod_id: "kubejs".to_string(),
                texture_data_url,
            });
        }
    }

    all_items.sort_by(|a, b| a.mod_id.cmp(&b.mod_id).then(a.id.cmp(&b.id)));
    save_cache(instance_path, &current_jars, &current_kubejs, &all_items);
    eprintln!("[Indexer] Indexed {} items from {} jars for {}", all_items.len(), current_jars.len(), instance_path.display());

    Ok(all_items)
}

/// Namespace a bare KubeJS item id with the adapter-provided default.
fn namespace_kubejs_id(id: &str, default_ns: &str) -> String {
    if id.contains(':') {
        id.to_string()
    } else {
        format!("{default_ns}:{id}")
    }
}

/// Resolve a `.texture('ns:path')` ref to a data URL. Bare refs inherit the
/// item's namespace (the scan's texture keys are `ns:path`).
fn resolve_kubejs_texture(
    texture: &str,
    item_id: &str,
    default_ns: &str,
    textures: &HashMap<String, String>,
) -> Option<String> {
    let key = if texture.contains(':') {
        texture.to_string()
    } else {
        let ns = item_id.split_once(':').map(|(n, _)| n).unwrap_or(default_ns);
        format!("{ns}:{texture}")
    };
    textures.get(&key).cloned()
}

#[tauri::command]
pub async fn scan_instance_items_cmd(
    instance_path: String,
    kubejs_namespace: Option<String>,
) -> Result<Vec<ItemRegistryEntry>, String> {
    // Jar walk + lang/model parsing can take a while on a large pack; run off
    // the main thread so the webview stays responsive.
    tauri::async_runtime::spawn_blocking(move || {
        let path = Path::new(&instance_path);
        scan_instance_items(path, kubejs_namespace.as_deref().unwrap_or("kubejs"))
    })
    .await
    .map_err(|e| format!("Item scan task failed: {e}"))?
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use tempfile::tempdir;
    use zip::write::FileOptions;
    use zip::CompressionMethod;

    fn create_test_jar(path: &Path, namespace: &str, textures: &[&str], lang_data: Option<&str>) {
        create_test_jar_with_models(path, namespace, textures, lang_data, &[])
    }

    fn create_test_jar_with_models(
        path: &Path, namespace: &str, textures: &[&str],
        lang_data: Option<&str>, models: &[(&str, &str)],
    ) {
        let file = fs::File::create(path).unwrap();
        let mut zip = zip::ZipWriter::new(file);
        let options: FileOptions<'_, ()> = FileOptions::default().compression_method(CompressionMethod::Stored);

        for tex_path in textures {
            let full = format!("assets/{}/textures/{}", namespace, tex_path);
            zip.start_file(&full, options).unwrap();
            zip.write_all(b"fake_png_data").unwrap();
        }

        if let Some(lang_json) = lang_data {
            let lang_path = format!("assets/{}/lang/en_us.json", namespace);
            zip.start_file(&lang_path, options).unwrap();
            zip.write_all(lang_json.as_bytes()).unwrap();
        }

        for (model_path, model_json) in models {
            let full = format!("assets/{}/models/{}", namespace, model_path);
            zip.start_file(&full, options).unwrap();
            zip.write_all(model_json.as_bytes()).unwrap();
        }

        zip.finish().unwrap();
    }

    #[test]
    fn test_parse_lang_for_items() {
        let json = r#"{
            "item.minecraft.diamond": "Diamond",
            "item.minecraft.iron_ingot": "Iron Ingot",
            "block.minecraft.stone": "Stone"
        }"#;
        let items = parse_lang_for_items(json);
        assert_eq!(items.len(), 3);
        assert!(items.contains(&("minecraft:diamond".into(), "Diamond".into(), "minecraft".into())));
        assert!(items.contains(&("minecraft:iron_ingot".into(), "Iron Ingot".into(), "minecraft".into())));
        assert!(items.contains(&("minecraft:stone".into(), "Stone".into(), "minecraft".into())));
    }

    #[test]
    fn test_parse_lang_filters_non_item_keys() {
        let json = r#"{
            "item.minecraft.diamond": "Diamond",
            "gui.minecraft.something": "GUI Thing",
            "key.minecraft.jump": "Jump"
        }"#;
        let items = parse_lang_for_items(json);
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].0, "minecraft:diamond");
    }

    #[test]
    fn test_parse_lang_filters_tooltip_and_description_keys() {
        let json = r#"{
            "item.theurgy.alchemical_sulfur_dragonfruit": "Alchemical Sulfur Dragonfruit",
            "item.theurgy.alchemical_sulfur_dragonfruit.tooltip.extended": "Sulfur represents the idea of souls",
            "item.mod.thing.desc": "A long description",
            "item.mod.thing.lore": "Some lore",
            "item.mod.real_item": "Real Item",
            "block.mod.real_block": "Real Block",
            "block.mod.real_block.tooltip.info": "Block info"
        }"#;
        let items = parse_lang_for_items(json);
        let mut ids: Vec<String> = items.iter().map(|(id, _, _)| id.clone()).collect();
        ids.sort();
        assert_eq!(ids, vec![
            "mod:real_block".to_string(),
            "mod:real_item".to_string(),
            "theurgy:alchemical_sulfur_dragonfruit".to_string(),
        ]);
    }

    #[test]
    fn test_scan_jar_for_items_and_textures() {
        let dir = tempdir().unwrap();
        let jar_path = dir.path().join("test.jar");
        create_test_jar(
            &jar_path,
            "testmod",
            &["item/test_item.png", "block/test_block.png"],
            Some(r#"{"item.testmod.test_item": "Test Item"}"#),
        );

        let (lang_items, textures, model_textures) = scan_jar_for_items_and_textures(&jar_path).unwrap();
        assert_eq!(lang_items.len(), 1);
        assert_eq!(lang_items[0].0, "testmod:test_item");
        assert!(model_textures.is_empty());

        assert!(textures.contains_key("testmod:item/test_item"));
        assert!(textures.contains_key("testmod:block/test_block"));
    }

    #[test]
    fn test_find_texture_item_subdir() {
        let mut textures = HashMap::new();
        textures.insert("testmod:item/test_item".into(), "data:image/png;base64,abc".into());
        textures.insert("testmod:block/test_block".into(), "data:image/png;base64,def".into());

        assert_eq!(
            find_texture_for_item("testmod:test_item", &textures),
            Some("testmod:item/test_item".into())
        );
        assert_eq!(
            find_texture_for_item("testmod:test_block", &textures),
            Some("testmod:block/test_block".into())
        );
        assert_eq!(
            find_texture_for_item("testmod:unknown", &textures),
            None
        );
    }

    #[test]
    fn test_scan_instance_items_end_to_end() {
        let dir = tempdir().unwrap();
        let mods = dir.path().join("mods");
        fs::create_dir_all(&mods).unwrap();

        create_test_jar(
            &mods.join("mod1.jar"),
            "mod1",
            &["item/ingot_copper.png"],
            Some(r#"{"item.mod1.ingot_copper": "Copper Ingot"}"#),
        );
        create_test_jar(
            &mods.join("mod2.jar"),
            "mod2",
            &["block/machine_frame.png"],
            Some(r#"{"block.mod2.machine_frame": "Machine Frame"}"#),
        );

        let items = scan_instance_items(dir.path(), "kubejs").unwrap();
        assert_eq!(items.len(), 2);

        let copper = items.iter().find(|i| i.id == "mod1:ingot_copper").unwrap();
        assert_eq!(copper.name, "Copper Ingot");
        assert!(copper.texture_data_url.is_some());

        let machine = items.iter().find(|i| i.id == "mod2:machine_frame").unwrap();
        assert_eq!(machine.name, "Machine Frame");
        assert!(machine.texture_data_url.is_some());
    }

    #[test]
    fn test_model_texture_resolution_fallback() {
        let mut textures = HashMap::new();
        textures.insert("minecraft:block/crafting_table_front".into(), "data:image/png;base64,front".into());

        let mut model_map = HashMap::new();
        model_map.insert("minecraft:crafting_table".into(), vec!["minecraft:block/crafting_table_front".into()]);

        let url = resolve_texture_from_model("minecraft:crafting_table", &model_map, &textures);
        assert_eq!(url, Some("data:image/png;base64,front".into()));
    }

    #[test]
    fn test_model_scan_in_jar() {
        let dir = tempdir().unwrap();
        let jar_path = dir.path().join("test.jar");
        create_test_jar_with_models(
            &jar_path, "testmod",
            &["item/actual_diamond.png", "block/crafting_table_front.png"],
            Some(r#"{"item.testmod.crafting_table": "Crafting Table"}"#),
            &[("item/crafting_table.json", r#"{"parent":"item/generated","textures":{"layer0":"testmod:block/crafting_table_front"}}"#)],
        );

        let (lang_items, textures, model_textures) = scan_jar_for_items_and_textures(&jar_path).unwrap();
        assert_eq!(lang_items.len(), 1);
        assert_eq!(lang_items[0].0, "testmod:crafting_table");

        assert!(textures.contains_key("testmod:item/actual_diamond"));
        assert!(textures.contains_key("testmod:block/crafting_table_front"));

        let refs = model_textures.get("testmod:crafting_table");
        assert!(refs.is_some(), "model entry should be keyed as testmod:crafting_table");
        assert_eq!(refs.unwrap()[0], "testmod:block/crafting_table_front");
    }

    #[test]
    fn test_end_to_end_with_model_fallback() {
        let dir = tempdir().unwrap();
        let mods = dir.path().join("mods");
        fs::create_dir_all(&mods).unwrap();

        // A mod where the block texture has a suffix mismatch:
        // Item `testmod:crafting_table` - texture is `block/crafting_table_front.png`
        create_test_jar_with_models(
            &mods.join("testmod.jar"), "testmod",
            &["block/crafting_table_front.png", "block/crafting_table_top.png"],
            Some(r#"{"block.testmod.crafting_table": "Crafting Table"}"#),
            &[("item/crafting_table.json", r#"{"parent":"block/crafting_table","textures":{"layer0":"testmod:block/crafting_table_front"}}"#)],
        );

        // A simple item with direct match
        create_test_jar(
            &mods.join("simple.jar"), "simplemod",
            &["item/ingot_copper.png"],
            Some(r#"{"item.simplemod.ingot_copper": "Copper Ingot"}"#),
        );

        let items = scan_instance_items(dir.path(), "kubejs").unwrap();
        assert_eq!(items.len(), 2);

        let table = items.iter().find(|i| i.id == "testmod:crafting_table").unwrap();
        assert!(table.texture_data_url.is_some(), "Crafting Table should resolve texture from model");

        let copper = items.iter().find(|i| i.id == "simplemod:ingot_copper").unwrap();
        assert!(copper.texture_data_url.is_some(), "Copper Ingot should have direct texture match");
    }

    #[test]
    fn test_find_vanilla_jar_at_instance_root() {
        let dir = tempdir().unwrap();
        // Place a JAR at the instance root (simulating minecraft.jar)
        create_test_jar(
            &dir.path().join("minecraft.jar"),
            "minecraft",
            &["item/diamond.png"],
            Some(r#"{"item.minecraft.diamond": "Diamond", "block.minecraft.stone": "Stone"}"#),
        );
        // Also create a mods/ dir with a mod jar to ensure both sources merge
        let mods = dir.path().join("mods");
        fs::create_dir_all(&mods).unwrap();
        create_test_jar(
            &mods.join("somemod.jar"),
            "somemod",
            &["item/ingot_copper.png"],
            Some(r#"{"item.somemod.ingot_copper": "Copper Ingot"}"#),
        );

        let items = scan_instance_items(dir.path(), "kubejs").unwrap();

        // Should contain vanilla items from root jar AND mod items from mods/
        let diamond = items.iter().find(|i| i.id == "minecraft:diamond");
        assert!(diamond.is_some(), "Vanilla diamond should be found");
        assert_eq!(diamond.unwrap().name, "Diamond");

        let stone = items.iter().find(|i| i.id == "minecraft:stone");
        assert!(stone.is_some(), "Vanilla stone should be found");
        assert_eq!(stone.unwrap().name, "Stone");

        let copper = items.iter().find(|i| i.id == "somemod:ingot_copper");
        assert!(copper.is_some(), "Mod item should be found");
    }

    #[test]
    fn test_cache_invalidation() {
        let dir = tempdir().unwrap();
        let mods = dir.path().join("mods");
        fs::create_dir_all(&mods).unwrap();

        create_test_jar(
            &mods.join("test.jar"),
            "testmod",
            &["item/test_item.png"],
            Some(r#"{"item.testmod.test_item": "Test Item"}"#),
        );

        let items1 = scan_instance_items(dir.path(), "kubejs").unwrap();
        assert_eq!(items1.len(), 1);

        let items2 = scan_instance_items(dir.path(), "kubejs").unwrap();
        assert_eq!(items2.len(), 1);
        assert_eq!(items1[0].id, items2[0].id);
    }

    fn write_kubejs_script(instance: &std::path::Path, contents: &str) {
        let startup = instance.join("kubejs").join("startup_scripts");
        fs::create_dir_all(&startup).unwrap();
        fs::write(startup.join("items.js"), contents).unwrap();
    }

    #[test]
    fn test_scan_instance_kubejs_items_end_to_end() {
        let dir = tempdir().unwrap();
        // A jar providing the texture the kubejs `.texture()` ref points at.
        let mods = dir.path().join("mods");
        fs::create_dir_all(&mods).unwrap();
        create_test_jar(
            &mods.join("m.jar"),
            "minecraft",
            &["item/test_item.png"],
            Some(r#"{}"#),
        );
        write_kubejs_script(
            dir.path(),
            r#"StartupEvents.registry('item', event => {
  event.create('test_item').displayName('Test Item').texture('minecraft:item/test_item')
  event.create('no_icon')
})"#,
        );

        let items = scan_instance_items(dir.path(), "kubejs").unwrap();
        assert_eq!(items.len(), 2);

        let with_icon = items.iter().find(|i| i.id == "kubejs:test_item").unwrap();
        assert_eq!(with_icon.name, "Test Item");
        assert_eq!(with_icon.mod_id, "kubejs");
        assert!(
            with_icon.texture_data_url.is_some(),
            "kubejs item should resolve its .texture() against the jar texture map"
        );

        let no_icon = items.iter().find(|i| i.id == "kubejs:no_icon").unwrap();
        assert_eq!(no_icon.name, "no_icon");
        assert!(no_icon.texture_data_url.is_none());
    }

    #[test]
    fn test_scan_instance_kubejs_bare_ids_namespaced_by_argument() {
        let dir = tempdir().unwrap();
        let mods = dir.path().join("mods");
        fs::create_dir_all(&mods).unwrap();
        create_test_jar(&mods.join("m.jar"), "minecraft", &[], Some(r#"{}"#));
        write_kubejs_script(
            dir.path(),
            r#"onEvent('item.registry', event => { event.register('legacy_thing') })"#,
        );

        // Custom namespace passed from the frontend adapter.
        let items = scan_instance_items(dir.path(), "example").unwrap();
        assert!(items.iter().any(|i| i.id == "example:legacy_thing"));

        // Bare namespaced ids are untouched.
        write_kubejs_script(
            dir.path(),
            r#"StartupEvents.registry('item', event => { event.create('mymod:explicit') })"#,
        );
        let items = scan_instance_items(dir.path(), "example").unwrap();
        assert!(items.iter().any(|i| i.id == "mymod:explicit"));
    }

    #[test]
    fn test_cache_invalidates_on_kubejs_script_change() {
        let dir = tempdir().unwrap();
        let mods = dir.path().join("mods");
        fs::create_dir_all(&mods).unwrap();
        create_test_jar(&mods.join("m.jar"), "minecraft", &[], Some(r#"{}"#));

        write_kubejs_script(
            dir.path(),
            r#"StartupEvents.registry('item', event => { event.create('first_item') })"#,
        );
        let items1 = scan_instance_items(dir.path(), "kubejs").unwrap();
        assert!(items1.iter().any(|i| i.id == "kubejs:first_item"));

        // Editing the script (same path) must invalidate the cached scan.
        write_kubejs_script(
            dir.path(),
            r#"StartupEvents.registry('item', event => { event.create('second_item') })"#,
        );
        let items2 = scan_instance_items(dir.path(), "kubejs").unwrap();
        assert!(items2.iter().any(|i| i.id == "kubejs:second_item"));
        assert!(!items2.iter().any(|i| i.id == "kubejs:first_item"));
    }
}
