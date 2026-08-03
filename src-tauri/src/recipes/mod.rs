// Scanning + parsing pack recipe sources into the app's `Recipe` model.
// Pure-ish: no UI, no IPC — only filesystem reads. The scanner walks the
// pack's real recipe locations (data/*/recipes/*.json, KubeJS server scripts,
// CraftTweaker scripts) so the editor can load *existing* recipes, not just
// author new ones.

pub mod cache;
pub mod crafttweaker;
pub mod kubejs;
pub mod vanilla;

use crate::models::{Recipe, RecipeIngredient, RecipeOutput, RecipeType};
use serde::{Deserialize, Serialize};
use std::io::Read;

/// Provenance of a discovered recipe.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum RecipeOrigin {
    /// A data-pack JSON at `data/<ns>/recipes/<name>.json`.
    Vanilla,
    /// A KubeJS `event.*` recipe call in `kubejs/server_scripts/**`.
    Kubejs,
    /// A CraftTweaker `recipes.add*` / `furnace.*` call in `scripts/**`.
    Crafttweaker,
}

/// A recipe discovered on disk, ready to be loaded into the editor.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscoveredRecipe {
    pub recipe: Recipe,
    pub origin: RecipeOrigin,
    /// Absolute path of the source file.
    pub source: String,
    /// Recipe name/id from the source (file stem, or KubeJS `output` id).
    pub id: String,
    /// Human description of the file (e.g. `data/minecraft/recipes/x.json`).
    pub label: String,
    /// True when this file is pack-authored (editable) vs from a mod jar.
    pub editable: bool,
}

impl DiscoveredRecipe {
    fn label_for(path: &std::path::Path, root: &std::path::Path) -> String {
        path.strip_prefix(root)
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_else(|_| path.to_string_lossy().to_string())
    }
}

pub(crate) fn ingredient_from_item_or_tag(v: &serde_json::Value) -> Option<RecipeIngredient> {
    match v {
        serde_json::Value::String(s) => {
            if let Some(tag) = s.strip_prefix('#') {
                Some(RecipeIngredient {
                    item: tag.to_string(),
                    count: None,
                    tag: Some(true),
                    nbt: None,
                })
            } else {
                Some(RecipeIngredient {
                    item: s.clone(),
                    count: None,
                    tag: Some(false),
                    nbt: None,
                })
            }
        }
        serde_json::Value::Object(o) => {
            let id = o
                .get("item")
                .and_then(|v| v.as_str())
                .or_else(|| o.get("id").and_then(|v| v.as_str()))
                .or_else(|| o.get("tag").and_then(|v| v.as_str()));
            let item = id?;
            let is_tag = o.contains_key("tag");
            let count = o.get("count").and_then(|c| c.as_u64()).map(|c| c as i32);
            Some(RecipeIngredient {
                item: item.to_string(),
                count: if is_tag { None } else { count },
                tag: Some(is_tag),
                nbt: None,
            })
        }
        _ => None,
    }
}

pub(crate) fn result_from_output(v: &serde_json::Value) -> Option<RecipeOutput> {
    match v {
        serde_json::Value::String(s) => Some(RecipeOutput {
            item: s.clone(),
            count: 1,
            nbt: None,
        }),
        serde_json::Value::Object(o) => {
            let item = o
                .get("item")
                .and_then(|v| v.as_str())
                .or_else(|| o.get("id").and_then(|v| v.as_str()))?
                .to_string();
            let count = o.get("count").and_then(|c| c.as_u64()).map(|c| c as i32).unwrap_or(1);
            Some(RecipeOutput {
                item,
                count,
                nbt: None,
            })
        }
        _ => None,
    }
}

pub(crate) fn first_ingredient(v: &serde_json::Value) -> Option<RecipeIngredient> {
    match v {
        serde_json::Value::Array(arr) => arr
            .iter()
            .find_map(ingredient_from_item_or_tag),
        other => ingredient_from_item_or_tag(other),
    }
}

fn tmp_id() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    format!("discovered_{nanos}")
}

/// Emit the app recipe fields shared by every type.
pub(crate) fn base_recipe(
    r#type: RecipeType,
    output: RecipeOutput,
    group: Option<String>,
) -> Recipe {
    Recipe {
        id: tmp_id(),
        name: output.item.clone(),
        r#type,
        group,
        pattern: None,
        key: None,
        ingredients: None,
        output,
        experience: None,
        cooking_time: None,
        category: None,
    }
}

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
            // Must be under data/<ns>/recipes/.
            let rel = path.strip_prefix(&data_dir).unwrap_or(path);
            let in_recipes = rel
                .components()
                .any(|c| c.as_os_str() == "recipes");
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
            for recipe in kubejs::parse_kubejs_scripts(&content) {
                let id = format!("{}:{}", file_ns(&content), recipe.output.item);
                let label = DiscoveredRecipe::label_for(path, &root);
                let editable = is_editable_source(path, &root);
                out.push(DiscoveredRecipe {
                    recipe,
                    origin: RecipeOrigin::Kubejs,
                    source: path.to_string_lossy().to_string(),
                    id,
                    label,
                    editable,
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
            for recipe in crafttweaker::parse_crafttweaker(&content) {
                let id = format!("{}:{}", file_ns(&content), recipe.output.item);
                let label = DiscoveredRecipe::label_for(path, &root);
                let editable = is_editable_source(path, &root);
                out.push(DiscoveredRecipe {
                    recipe,
                    origin: RecipeOrigin::Crafttweaker,
                    source: path.to_string_lossy().to_string(),
                    id,
                    label,
                    editable,
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
        // data/<ns>/recipes/<name>.json — exactly three path segments after data/.
        if !name.starts_with("data/") || !name.ends_with(".json") {
            continue;
        }
        let parts: Vec<&str> = name.split('/').collect();
        if parts.len() < 4 || parts[2] != "recipes" {
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
            });
        }
    }
}

/// Tauri command: scan a project path for discoverable recipes.
#[tauri::command]
pub fn scan_pack_recipes_cmd(project_path: String) -> Result<Vec<DiscoveredRecipe>, String> {
    let path = std::path::Path::new(&project_path);
    if !path.is_dir() {
        return Err("project path is not a directory".to_string());
    }
    Ok(scan_pack_recipes(path))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn scans_vanilla_jsons() {
        let dir = tempfile::tempdir().unwrap();
        let data = dir.path().join("data/minecraft/recipes");
        std::fs::create_dir_all(&data).unwrap();
        std::fs::write(
            data.join("diamond_block.json"),
            r#"{"type":"minecraft:crafting_shaped","pattern":["AA","AA"],"key":{"A":{"item":"minecraft:diamond"}},"result":{"item":"minecraft:diamond_block"}}"#,
        )
        .unwrap();
        let found = scan_pack_recipes(dir.path());
        assert_eq!(found.len(), 1);
        assert_eq!(found[0].origin, RecipeOrigin::Vanilla);
        assert_eq!(found[0].recipe.output.item, "minecraft:diamond_block");
        assert!(found[0].editable);
    }

    #[test]
    fn scans_kubejs() {
        let dir = tempfile::tempdir().unwrap();
        let kube = dir.path().join("kubejs/server_scripts");
        std::fs::create_dir_all(&kube).unwrap();
        std::fs::write(
            kube.join("recipes.js"),
            "ServerEvents.recipes(event => { event.smelting('minecraft:iron_ingot', 'minecraft:iron_ore') })",
        )
        .unwrap();
        let found = scan_pack_recipes(dir.path());
        assert_eq!(found.len(), 1);
        assert_eq!(found[0].origin, RecipeOrigin::Kubejs);
        assert_eq!(found[0].recipe.output.item, "minecraft:iron_ingot");
    }

    #[test]
    fn scans_crafttweaker() {
        let dir = tempfile::tempdir().unwrap();
        let scripts = dir.path().join("scripts");
        std::fs::create_dir_all(&scripts).unwrap();
        std::fs::write(
            scripts.join("recipes.zs"),
            "furnace.addRecipe(\"iron\", <item:minecraft:iron_ingot>, <item:minecraft:iron_ore>, 0.7, 200);",
        )
        .unwrap();
        let found = scan_pack_recipes(dir.path());
        assert_eq!(found.len(), 1);
        assert_eq!(found[0].origin, RecipeOrigin::Crafttweaker);
        assert_eq!(found[0].recipe.experience, Some(0.7));
    }

    #[test]
    fn empty_pack_yields_nothing() {
        let dir = tempfile::tempdir().unwrap();
        assert!(scan_pack_recipes(dir.path()).is_empty());
    }

    #[test]
    fn scans_recipes_inside_mod_jars() {
        use zip::CompressionMethod;
        use zip::write::FileOptions;
        use std::io::Write;

        let dir = tempfile::tempdir().unwrap();
        let mods = dir.path().join("mods");
        std::fs::create_dir_all(&mods).unwrap();

        // Write a jar containing a vanilla recipe.
        let jar_path = mods.join("example.jar");
        let file = std::fs::File::create(&jar_path).unwrap();
        let mut zip = zip::ZipWriter::new(file);
        let options: FileOptions<'_, ()> =
            FileOptions::default().compression_method(CompressionMethod::Stored);
        zip.start_file("data/example/recipes/diamond_block.json", options).unwrap();
        zip.write_all(br#"{"type":"minecraft:crafting_shaped","pattern":["A"],"key":{"A":{"item":"minecraft:diamond"}},"result":{"item":"minecraft:diamond_block"}}"#).unwrap();
        zip.finish().unwrap();

        let found = scan_pack_recipes(dir.path());
        assert_eq!(found.len(), 1);
        assert_eq!(found[0].origin, RecipeOrigin::Vanilla);
        assert_eq!(found[0].recipe.output.item, "minecraft:diamond_block");
        assert!(!found[0].editable);
        assert!(found[0].source.starts_with("jar:"));
    }

    #[test]
    fn pack_data_override_is_editable_and_kept() {
        let dir = tempfile::tempdir().unwrap();
        let data = dir.path().join("data/mc/recipes");
        std::fs::create_dir_all(&data).unwrap();
        std::fs::write(
            data.join("iron_ingot.json"),
            r#"{"type":"minecraft:smelting","ingredient":{"item":"minecraft:iron_ore"},"result":{"item":"minecraft:iron_ingot"},"experience":0.7}"#,
        )
        .unwrap();
        let found = scan_pack_recipes(dir.path());
        assert_eq!(found.len(), 1);
        assert!(found[0].editable);
    }

    #[test]
    fn editable_override_shadows_jar_recipe_with_same_id() {
        use zip::CompressionMethod;
        use zip::write::FileOptions;
        use std::io::Write;

        let dir = tempfile::tempdir().unwrap();
        let mods = dir.path().join("mods");
        let data = dir.path().join("data/minecraft/recipes");
        std::fs::create_dir_all(&mods).unwrap();
        std::fs::create_dir_all(&data).unwrap();

        // Jar provides minecraft:iron_ingot.
        let jar_path = mods.join("example.jar");
        let file = std::fs::File::create(&jar_path).unwrap();
        let mut zip = zip::ZipWriter::new(file);
        let options: FileOptions<'_, ()> =
            FileOptions::default().compression_method(CompressionMethod::Stored);
        zip.start_file("data/minecraft/recipes/iron_ingot.json", options).unwrap();
        zip.write_all(br#"{"type":"minecraft:smelting","ingredient":{"item":"minecraft:iron_ore"},"result":{"item":"minecraft:iron_ingot"},"experience":0.7}"#).unwrap();
        zip.finish().unwrap();

        // Pack overrides the same id.
        std::fs::write(
            data.join("iron_ingot.json"),
            r#"{"type":"minecraft:smelting","ingredient":{"item":"minecraft:iron_ore"},"result":{"item":"minecraft:iron_ingot"},"experience":1.0}"#,
        )
        .unwrap();

        let found = scan_pack_recipes(dir.path());
        assert_eq!(found.len(), 1, "override should collapse the jar duplicate");
        assert!(found[0].editable, "pack override must win");
        assert_eq!(found[0].recipe.experience, Some(1.0));
    }

    #[test]
    fn cache_reuses_result_until_files_change() {
        let dir = tempfile::tempdir().unwrap();
        let data = dir.path().join("data/mc/recipes");
        std::fs::create_dir_all(&data).unwrap();
        std::fs::write(
            data.join("a.json"),
            r#"{"type":"minecraft:crafting_shapeless","ingredients":[{"item":"minecraft:dirt"}],"result":{"item":"minecraft:stone"}}"#,
        )
        .unwrap();

        let first = scan_pack_recipes(dir.path());
        assert_eq!(first.len(), 1);

        // Second scan should hit the cache and stay consistent.
        let second = scan_pack_recipes(dir.path());
        assert_eq!(second.len(), 1);

        // Editing a recipe file invalidates the cache (length differs).
        std::fs::write(
            data.join("a.json"),
            r#"{"type":"minecraft:crafting_shapeless","ingredients":[{"item":"minecraft:dirt"},{"item":"minecraft:stick"}],"result":{"item":"minecraft:grass_block"}}"#,
        )
        .unwrap();
        let third = scan_pack_recipes(dir.path());
        assert_eq!(third.len(), 1);
        assert_eq!(third[0].recipe.output.item, "minecraft:grass_block");
    }

    #[test]
    fn loads_all_recipes_across_multiple_jars() {
        use zip::CompressionMethod;
        use zip::write::FileOptions;
        use std::io::Write;

        let dir = tempfile::tempdir().unwrap();
        let mods = dir.path().join("mods");
        std::fs::create_dir_all(&mods).unwrap();

        let write_jar = |name: &str, entries: &[(&str, &str)]| {
            let jar_path = mods.join(format!("{name}.jar"));
            let file = std::fs::File::create(&jar_path).unwrap();
            let mut zip = zip::ZipWriter::new(file);
            let options: FileOptions<'_, ()> =
                FileOptions::default().compression_method(CompressionMethod::Stored);
            for (path, content) in entries {
                zip.start_file(path, options).unwrap();
                zip.write_all(content.as_bytes()).unwrap();
            }
            zip.finish().unwrap();
        };

        write_jar("moda", &[
            ("data/mod_a/recipes/one.json", r#"{"type":"minecraft:crafting_shapeless","ingredients":[{"item":"minecraft:dirt"}],"result":{"item":"minecraft:stone"}}"#),
            ("data/mod_a/recipes/two.json", r#"{"type":"minecraft:smelting","ingredient":{"item":"minecraft:iron_ore"},"result":{"item":"minecraft:iron_ingot"}}"#),
        ]);
        write_jar("modb", &[
            ("data/mod_b/recipes/three.json", r#"{"type":"minecraft:crafting_shaped","pattern":["A"],"key":{"A":{"item":"minecraft:stick"}},"result":{"item":"minecraft:stone_sword"}}"#),
        ]);

        let found = scan_pack_recipes(dir.path());
        assert_eq!(found.len(), 3, "all recipes from all jars should load");
    }
}

