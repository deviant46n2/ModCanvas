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
            scan_jar_loot_tables(path, &mut out);
        }
    }

    dedupe_by_resource_id(&mut out);
    out
}

/// Read `data/<ns>/loot_table(s)/<rest>.json` entries out of a jar/zip.
/// Note the nesting: tables live under arbitrary subdirs
/// (`data/ftbquests/loot_table/blocks/screen_1.json`), so the resource id is
/// the full path after the loot dir — `ftbquests:blocks/screen_1` — matching
/// how the game keys tables, NOT the bare filename.
fn scan_jar_loot_tables(jar_path: &std::path::Path, out: &mut Vec<DiscoveredLootTable>) {
    let Ok(file) = std::fs::File::open(jar_path) else { return };
    let Ok(mut archive) = zip::ZipArchive::new(file) else { return };
    for i in 0..archive.len() {
        let Ok(mut entry) = archive.by_index(i) else { continue };
        let name = entry.name().replace('\\', "/");
        if !name.starts_with("data/") || !name.ends_with(".json") {
            continue;
        }
        // data/<ns>/<loot_dir>/<rest...>.json — rest is the in-game id path.
        let parts: Vec<&str> = name.split('/').collect();
        if parts.len() < 4 || !LOOT_DIRS.contains(&parts[2]) {
            continue;
        }
        let rest = parts[3..].join("/");
        let id_path = rest.strip_suffix(".json").unwrap_or(&rest);
        let mut content = String::new();
        if entry.read_to_string(&mut content).is_err() {
            continue;
        }
        let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) else { continue };
        let Some(summary) = parse_loot_table(&json) else { continue };
        out.push(DiscoveredLootTable {
            id: format!("{}:{}", parts[1], id_path),
            source: format!("jar:{}!{}", jar_path.display(), name),
            table_type: summary.table_type,
            pools: summary.pools,
            entries: summary.entries,
            editable: false,
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use zip::write::SimpleFileOptions;

    /// Build a fake pack dir: `data/<ns>/loot_table/<sub>/<name>.json` +
    /// one mod jar carrying its own loot tables.
    fn make_pack(tmp: &std::path::Path) -> std::path::PathBuf {
        let root = tmp.join("pack");
        let table = root.join("data").join("testmod").join("loot_table").join("chests");
        std::fs::create_dir_all(&table).unwrap();
        std::fs::write(
            table.join("simple.json"),
            r#"{"type":"minecraft:chest","pools":[{"entries":[{"type":"minecraft:item","name":"a:b"}]}]}"#,
        )
        .unwrap();
        // Nested subdir: the s44 regression — the id must be the full path
        // after the loot dir, not the bare filename.
        let nested = root.join("data").join("testmod").join("loot_table").join("blocks");
        std::fs::create_dir_all(&nested).unwrap();
        std::fs::write(
            nested.join("screen_1.json"),
            r#"{"type":"minecraft:block","pools":[{"entries":[]}]}"#,
        )
        .unwrap();

        // A jar with its own table — should be shadowed by the pack's
        // same-id table (editable wins), and kept when ids differ.
        let mods = root.join("mods");
        std::fs::create_dir_all(&mods).unwrap();
        let jar_path = mods.join("testmod.jar");
        let file = std::fs::File::create(&jar_path).unwrap();
        let mut zip = zip::ZipWriter::new(file);
        let opts = SimpleFileOptions::default();
        zip.start_file("data/testmod/loot_table/chests/simple.json", opts).unwrap();
        zip.write_all(br#"{"type":"minecraft:chest","pools":[{"entries":[{"type":"minecraft:item","name":"jar-only"}]}]}"#).unwrap();
        zip.start_file("data/testmod/loot_table/other/unique.json", opts).unwrap();
        zip.write_all(br#"{"type":"minecraft:chest","pools":[{"entries":[{"type":"minecraft:item","name":"u:v"}]}]}"#).unwrap();
        zip.finish().unwrap();
        root
    }

    #[test]
    fn scans_pack_data_and_jars_with_full_path_ids() {
        let tmp = std::env::temp_dir().join(format!("loot_scan_test_{}", std::process::id()));
        let root = make_pack(&tmp);
        let tables = scan_pack_loot_tables(&root);

        let ids: Vec<&str> = tables.iter().map(|t| t.id.as_str()).collect();
        assert!(ids.contains(&"testmod:chests/simple"), "pack table by full path, got {ids:?}");
        assert!(ids.contains(&"testmod:blocks/screen_1"), "nested table by full path, got {ids:?}");
        assert!(ids.contains(&"testmod:other/unique"), "jar-only table kept, got {ids:?}");
        // The pack's chests/simple must shadow the jar's same-id table:
        // one table with that id, editable, from the pack (2 entries: a:b).
        let simple: Vec<_> = tables.iter().filter(|t| t.id == "testmod:chests/simple").collect();
        assert_eq!(simple.len(), 1, "dedup collapsed same-id sources");
        assert!(simple[0].editable, "pack data shadows jar");
        assert_eq!(simple[0].entries, 1);
        assert_eq!(tables.len(), 3, "2 pack + 2 jar, minus 1 dedup = 3, got {}", tables.len());
        let _ = std::fs::remove_dir_all(&tmp);
    }

    #[test]
    fn both_loot_dir_names_are_scanned() {
        let tmp = std::env::temp_dir().join(format!("loot_scan_old_{}", std::process::id()));
        let root = tmp.join("pack");
        // Pre-1.21 plural dir.
        std::fs::create_dir_all(root.join("data").join("oldmod").join("loot_tables")).unwrap();
        std::fs::write(
            root.join("data").join("oldmod").join("loot_tables").join("chest.json"),
            r#"{"type":"minecraft:chest","pools":[]}"#,
        )
        .unwrap();
        let tables = scan_pack_loot_tables(&root);
        assert!(tables.iter().any(|t| t.id == "oldmod:chest"));
        let _ = std::fs::remove_dir_all(&tmp);
    }
}
