use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::indexer_kubejs::{collect_kubejs_scripts, parse_kubejs_item_registrations, KubejsItemRegistration};

mod cache;
mod jar;
mod kubejs;
mod vanilla;

use cache::{get_jar_meta, load_cache, save_cache, JarMeta};
use jar::{find_texture_for_item, resolve_texture_from_model, scan_jar_for_items_and_textures};
use kubejs::{namespace_kubejs_id, resolve_kubejs_texture};
pub(crate) use vanilla::find_vanilla_jars;

#[cfg(test)]
mod tests;
#[cfg(test)]
mod tests_e2e;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ItemRegistryEntry {
    pub id: String,
    pub name: String,
    pub mod_id: String,
    pub texture_data_url: Option<String>,
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
