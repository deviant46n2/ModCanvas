// Loot-table pack walker (I/O layer — the hands room). Walks `data/` and
// every mod jar/zip for `data/<ns>/loot_table(s)/*.json`, parses each via
// the pure `parse` module, and dedups by resource id (pack data shadows
// jars, matching in-game source order). Mirrors `recipes/pack_scan.rs`.

use crate::loot::{parse::parse_loot_table, DiscoveredLootTable};
use std::io::Read;

/// Both historical datapack directory names: pre-1.21 `loot_tables`,
/// 1.21+ singular `loot_table` (the version boundary the adapter matrix
/// documents — never hardcode one).
const LOOT_DIRS: [&str; 2] = ["loot_table", "loot_tables"];

pub fn scan_pack_loot_tables(project_path: &std::path::Path) -> Vec<DiscoveredLootTable> {
    let mut out = Vec::new();
    let root = std::path::PathBuf::from(project_path);

    // 1. Pack data: `data/<ns>/loot_table(s)/<rest>.json`. Editable — lives
    //    on disk in the pack.
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
            let rel = path.strip_prefix(&data_dir).unwrap_or(path);
            let Some((ns, name)) = loot_id_from_rel(rel) else { continue };
            let Ok(content) = std::fs::read_to_string(path) else { continue };
            let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) else { continue };
            let Some(summary) = parse_loot_table(&json) else { continue };
            out.push(DiscoveredLootTable {
                id: format!("{ns}:{name}"),
                source: path.to_string_lossy().to_string(),
                table_type: summary.table_type,
                pools: summary.pools,
                entries: summary.entries,
                editable: true,
                vanilla: false,
            });
        }
    }

    // 2. Mod jars: `data/<ns>/loot_table(s)/*.json` inside every jar/zip.
    //    Read-only — a jar cannot be edited in place, but real packs carry
    //    most of their loot tables here.
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
            scan_jar_loot_tables(path, &mut out, false);
        }
    }

    dedupe_by_resource_id(&mut out);
    out
}

/// Pack scan + the vanilla jar's loot tables, when an instance path is known.
/// The vanilla jar is scanned AFTER mod jars so the dedupe (first non-editable
/// wins, editable always wins) keeps pack data > mod jars > vanilla — matching
/// in-game source order. B1 of the s72 loot re-scope: a zero-mod pack gets the
/// vanilla tables to work with; the jar is located via `find_vanilla_jars`
/// (the item indexer's battle-tested resolver, `indexer/vanilla.rs`).
pub fn scan_pack_loot_tables_with_vanilla(
    project_path: &std::path::Path,
    instance_path: Option<&std::path::Path>,
) -> Vec<DiscoveredLootTable> {
    let mut out = scan_pack_loot_tables(project_path);
    if let Some(instance) = instance_path {
        for jar in crate::indexer::vanilla::find_vanilla_jars(instance) {
            scan_jar_loot_tables(&jar, &mut out, true);
        }
        // Re-dedupe after appending vanilla: pack data and mod jars were
        // already collapsed; vanilla tables sharing an id with either lose
        // (editable pack wins, first non-editable — the mod jar — wins).
        dedupe_by_resource_id(&mut out);
    }
    out
}

/// Read `data/<ns>/loot_table(s)/<rest>.json` entries out of a jar/zip.
/// Note the nesting: tables live under arbitrary subdirs
/// (`data/ftbquests/loot_table/blocks/screen_1.json`), so the resource id is
/// the full path after the loot dir — `ftbquests:blocks/screen_1` — matching
/// how the game keys tables, NOT the bare filename.
fn scan_jar_loot_tables(
    jar_path: &std::path::Path,
    out: &mut Vec<DiscoveredLootTable>,
    is_vanilla: bool,
) {
    let Ok(file) = std::fs::File::open(jar_path) else { return };
    let Ok(mut archive) = zip::ZipArchive::new(file) else { return };
    for i in 0..archive.len() {
        let Ok(mut entry) = archive.by_index(i) else { continue };
        let name = entry.name().replace('\\', "/");
        if !name.starts_with("data/") || !name.ends_with(".json") {
            continue;
        }
        // data/<ns>/<loot_dir>/<rest...>.json — rest is the in-game id path.
        let Some((ns, id_path)) = loot_id_from_jar_entry(&name) else { continue };
        let mut content = String::new();
        if entry.read_to_string(&mut content).is_err() {
            continue;
        }
        let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) else { continue };
        let Some(summary) = parse_loot_table(&json) else { continue };
        out.push(DiscoveredLootTable {
            id: format!("{ns}:{id_path}"),
            source: format!("jar:{}!{}", jar_path.display(), name),
            table_type: summary.table_type,
            pools: summary.pools,
            entries: summary.entries,
            editable: false,
            vanilla: is_vanilla,
        });
    }
}

/// Extract `(namespace, id_path)` from a `data/`-relative path when it sits
/// under a loot-table directory. The id is the path after the loot dir
/// (`data/minecraft/loot_table/chests/x.json` → `(minecraft, chests/x)`).
fn loot_id_from_rel(rel: &std::path::Path) -> Option<(String, String)> {
    let mut comps = rel.components();
    let ns = comps.next()?.as_os_str().to_string_lossy().into_owned();
    let dir = comps.next()?.as_os_str().to_string_lossy().into_owned();
    if !LOOT_DIRS.contains(&dir.as_str()) {
        return None;
    }
    let rest: Vec<String> = comps.map(|c| c.as_os_str().to_string_lossy().into_owned()).collect();
    if rest.is_empty() {
        return None;
    }
    let joined = rest.join("/");
    let id_path = joined.strip_suffix(".json").unwrap_or(&joined).to_string();
    Some((ns, id_path))
}

/// Same extraction for a jar entry name (`data/<ns>/<loot_dir>/<rest>.json`
/// with `/` separators, as stored in a zip) — used by the copy-to-pack path,
/// which must derive the target pack id from the jar's own entry name.
pub(crate) fn loot_id_from_jar_entry(name: &str) -> Option<(String, String)> {
    let parts: Vec<&str> = name.split('/').collect();
    if parts.len() < 4 || !LOOT_DIRS.contains(&parts[2]) {
        return None;
    }
    let rest = parts[3..].join("/");
    let id_path = rest.strip_suffix(".json").unwrap_or(&rest).to_string();
    Some((parts[1].to_string(), id_path))
}

/// Collapse tables sharing the same resource id, preferring pack-editable
/// `data/` sources over jar read-only ones (in-game, pack data loads after
/// jars — the later source wins).
fn dedupe_by_resource_id(out: &mut Vec<DiscoveredLootTable>) {
    let mut best: std::collections::HashMap<String, usize> = std::collections::HashMap::new();
    let mut to_remove: Vec<usize> = Vec::new();
    for (i, d) in out.iter().enumerate() {
        if let Some(&prev) = best.get(&d.id) {
            let prev_editable = out[prev].editable;
            if d.editable && !prev_editable {
                to_remove.push(prev);
                best.insert(d.id.clone(), i);
            } else {
                to_remove.push(i);
            }
        } else {
            best.insert(d.id.clone(), i);
        }
    }
    let mut removed = 0usize;
    for idx in to_remove {
        out.remove(idx - removed);
        removed += 1;
    }
}
