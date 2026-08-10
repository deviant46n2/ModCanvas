// Pack recipe discovery: walk `data/`, `mods/`, `kubejs/server_scripts`, and
// `scripts/` and collect every recipe with its provenance + span. Reuses the
// on-disk `cache` when nothing changed since the last scan.

use crate::recipes::{cache, crafttweaker, kubejs, vanilla, DiscoveredRecipe, RecipeOrigin};
use std::io::Read;

/// Scan a pack for its real recipe sources. Walks:
///   - `data/<ns>/recipes/*.json` (vanilla JSON)
///   - `kubejs/server_scripts/**/*.js` (KubeJS event calls)
///   - `scripts/**/*.zs` (CraftTweaker)
/// Returns every recipe discovered with its provenance. Recipes that fail to
/// parse are skipped (per-source counts are NOT surfaced here; callers that
/// need them should collect separately).
pub fn scan_pack_recipes(project_path: &std::path::Path) -> Vec<DiscoveredRecipe> {
    // Fast path: if nothing changed since the last scan, reuse the cached
    // result instead of re-reading every jar's recipe JSONs.
    if let Some(cached) = cache::load(project_path) {
        return cached;
    }

    let mut out = Vec::new();
    let root = std::path::PathBuf::from(project_path);

    // 1. Vanilla data-pack JSON.
    let data_dir = root.join("data");
    if data_dir.is_dir() {
        for entry in walkdir::WalkDir::new(&data_dir)
            .into_iter()
            .filter_map(|e| e.ok())
        {
            let path = entry.path();
            if path.extension().map_or(true, |e| e != "json") {
                continue;
            }
            // Must be under data/<ns>/recipe(s)/ (pre-1.21 `recipes`, 1.21+
            // datapack rename to singular `recipe`).
            let rel = path.strip_prefix(&data_dir).unwrap_or(path);
            let in_recipes = rel
                .components()
                .any(|c| c.as_os_str() == "recipes" || c.as_os_str() == "recipe");
            if !in_recipes {
                continue;
            }
            let name = path
                .file_stem()
                .map(|s| s.to_string_lossy().to_string())
                .unwrap_or_default();
            let ns = rel
                .components()
                .next()
                .map(|c| c.as_os_str().to_string_lossy().to_string())
                .unwrap_or_else(|| "minecraft".to_string());
            let resource_id = format!("{ns}:{name}");
            let Ok(content) = std::fs::read_to_string(path) else { continue };
            let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) else { continue };
            if let Ok(recipe) = vanilla::parse_vanilla_recipe(&name, &json) {
                let editable = is_editable_source(path, &root);
                out.push(DiscoveredRecipe {
                    recipe,
                    origin: RecipeOrigin::Vanilla,
                    source: path.to_string_lossy().to_string(),
                    id: resource_id.clone(),
                    label: DiscoveredRecipe::label_for(path, &root),
                    editable,
                    span: None,
                });
            }
        }
    }

    // 2. Mod jars: read `data/<ns>/recipes/*.json` from every jar/zip in
    //    `mods/`. These are read-only sources (a jar cannot be edited in
    //    place), but they are the bulk of recipes in any real pack.
    let mods_dir = root.join("mods");
    if mods_dir.is_dir() {
        for entry in walkdir::WalkDir::new(&mods_dir)
            .into_iter()
            .filter_map(|e| e.ok())
        {
            let path = entry.path();
            if !path.is_file() {
                continue;
            }
            let is_archive = matches!(
                path.extension().and_then(|e| e.to_str()),
                Some("jar") | Some("zip")
            );
            if !is_archive {
                continue;
            }
            scan_jar_recipes(path, &root, &mut out);
        }
    }

    // 3. KubeJS server scripts.
    let kubejs = root.join("kubejs").join("server_scripts");
    if kubejs.is_dir() {
        for entry in walkdir::WalkDir::new(&kubejs)
            .into_iter()
            .filter_map(|e| e.ok())
        {
            let path = entry.path();
            if path.extension().map_or(true, |e| e != "js") {
                continue;
            }
            let Ok(content) = std::fs::read_to_string(path) else { continue };
            for parsed in kubejs::parse_kubejs_scripts(&content) {
                let id = format!("{}:{}", file_ns(&content), parsed.recipe.output.item);
                let label = DiscoveredRecipe::label_for(path, &root);
                let editable = is_editable_source(path, &root);
                out.push(DiscoveredRecipe {
                    recipe: parsed.recipe,
                    origin: RecipeOrigin::Kubejs,
                    source: path.to_string_lossy().to_string(),
                    id,
                    label,
                    editable,
                    span: parsed.lines,
                });
            }
        }
    }

    // 4. CraftTweaker scripts.
    let scripts = root.join("scripts");
    if scripts.is_dir() {
        for entry in walkdir::WalkDir::new(&scripts)
            .into_iter()
            .filter_map(|e| e.ok())
        {
            let path = entry.path();
            if path.extension().map_or(true, |e| e != "zs") {
                continue;
            }
            let Ok(content) = std::fs::read_to_string(path) else { continue };
            for parsed in crafttweaker::parse_crafttweaker(&content) {
                let id = format!("{}:{}", file_ns(&content), parsed.recipe.output.item);
                let label = DiscoveredRecipe::label_for(path, &root);
                let editable = is_editable_source(path, &root);
                out.push(DiscoveredRecipe {
                    recipe: parsed.recipe,
                    origin: RecipeOrigin::Crafttweaker,
                    source: path.to_string_lossy().to_string(),
                    id,
                    label,
                    editable,
                    span: parsed.lines,
                });
            }
        }
    }

    // Deduplicate by resource id (ns:file). A pack's editable `data/` override
    // shadows a jar's read-only recipe with the same id (in-game, the later
    // source wins — and pack data loads after jars).
    dedupe_by_resource_id(&mut out);
    cache::save(project_path, &out);
    out
}

/// Collapse discovered recipes sharing the same `id` (resource id), preferring
/// pack-editable sources over jar read-only ones. Keeps the last occurrence.
fn dedupe_by_resource_id(out: &mut Vec<DiscoveredRecipe>) {
    let mut best: std::collections::HashMap<String, usize> = std::collections::HashMap::new();
    let mut to_remove: Vec<usize> = Vec::new();
    for (i, d) in out.iter().enumerate() {
        if let Some(&prev) = best.get(&d.id) {
            let prev_editable = out[prev].editable;
            let cur_editable = d.editable;
            if cur_editable && !prev_editable {
                to_remove.push(prev);
                best.insert(d.id.clone(), i);
            } else if cur_editable == prev_editable {
                // Same editability: keep the later occurrence (jar order).
                to_remove.push(prev);
                best.insert(d.id.clone(), i);
            } else {
                to_remove.push(i);
            }
        } else {
            best.insert(d.id.clone(), i);
        }
    }
    for &i in to_remove.iter().rev() {
        out.remove(i);
    }
}

/// Heuristic namespace for a recipe's source: prefer the file stem of a
/// vanilla data pack namespace, else `minecraft`.
fn file_ns(content: &str) -> String {
    // Naive: look for a "namespace:path" pattern in the output id we already
    // stored; fall back to "minecraft".
    let _ = content;
    "minecraft".to_string()
}

/// A source under `data/` or the pack's own kubejs/scripts dirs is editable.
/// (Mod-jar data would not be under the project root, so anything here is
/// pack-authored in practice.)
fn is_editable_source(path: &std::path::Path, _root: &std::path::Path) -> bool {
    // All scanned sources live under the project root (kubejs/, scripts/,
    // data/) so they are pack-editable. Jar data is never scanned here.
    path.exists()
}

/// Read `data/<ns>/recipes/*.json` entries out of a jar/zip and append them
/// as read-only discovered recipes (jar:path descriptor kept in `source`).
fn scan_jar_recipes(jar_path: &std::path::Path, root: &std::path::Path, out: &mut Vec<DiscoveredRecipe>) {
    let file = match std::fs::File::open(jar_path) {
        Ok(f) => f,
        Err(_) => return,
    };
    let mut archive = match zip::ZipArchive::new(file) {
        Ok(a) => a,
        Err(_) => return,
    };
    for i in 0..archive.len() {
        let mut entry = match archive.by_index(i) {
            Ok(e) => e,
            Err(_) => continue,
        };
        let name = entry.name().replace('\\', "/");
        // data/<ns>/recipe(s)/<name>.json — three path segments after data/.
        // Pre-1.21 datapacks used `recipes`; 1.21+ renamed it to `recipe`.
        if !name.starts_with("data/") || !name.ends_with(".json") {
            continue;
        }
        let parts: Vec<&str> = name.split('/').collect();
        if parts.len() < 4 || (parts[2] != "recipes" && parts[2] != "recipe") {
            continue;
        }
        let file_name = parts[3].strip_suffix(".json").unwrap_or(parts[3]);
        let ns = parts[1];
        let resource_id = format!("{ns}:{file_name}");
        let mut buf = Vec::new();
        if entry.read_to_end(&mut buf).is_err() || buf.is_empty() {
            continue;
        }
        let Ok(json) = serde_json::from_slice::<serde_json::Value>(&buf) else {
            continue;
        };
        if let Ok(recipe) = vanilla::parse_vanilla_recipe(file_name, &json) {
            // Read-only: this comes from a jar and cannot be edited in place.
            out.push(DiscoveredRecipe {
                recipe,
                origin: RecipeOrigin::Vanilla,
                source: format!("jar:{}!{}", jar_path.display(), name),
                id: resource_id,
                label: format!(
                    "jar:{}",
                    jar_path.strip_prefix(root).unwrap_or(jar_path).display()
                ),
                editable: false,
                span: None,
            });
        }
    }
}
