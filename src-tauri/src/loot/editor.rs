// Loot-table editor commands (P3-LOOT, roadmap §13) — read + save. The I/O
// layer's boundary: `read_loot_table_cmd` returns the table's canonical model
// (the frontend mirrors and edits it), `save_loot_table_cmd` validates the
// incoming JSON is still a modelable table, then writes it VERBATIM —
// nothing is re-keyed or reformatted on save, so an untouched table produces
// an unchanged file. Path safety is enforced on the scanned `source` (the
// `loot_table` vs `loot_tables` dir name is preserved by construction).
//
// Path gate: loot tables live in `<root>/data/<ns>/loot_table(s)/...` — the
// PROJECT root, not `config/`. Resolve through `validate_under_root`
// (root-scoped), NEVER `validate_project_write` (config-scoped) — the s45
// regression lock (validation.rs) documents the same trap for KubeJS scripts
// and the behavior datapack emitter (`behavior/emit.rs`).
use crate::loot::model::LootTable;
use crate::path_safety::{atomic_write_str, validate_under_root};
use serde_json::Value;

/// Load one loot table as its canonical model. Returns `Err` for
/// unreadable/unparseable files and for shapes that are not modelable loot
/// tables (missing/non-array `pools`).
#[tauri::command]
pub fn read_loot_table_cmd(project_path: String, source: String) -> Result<Value, String> {
    let root = std::path::PathBuf::from(&project_path);
    let path = validate_under_root(&root, &source)?;
    let content =
        std::fs::read_to_string(&path).map_err(|e| format!("Failed to read {}: {e}", path.display()))?;
    let json: Value = serde_json::from_str(&content)
        .map_err(|e| format!("{} is not valid JSON: {e}", path.display()))?;
    let table = LootTable::from_value(&json)
        .ok_or_else(|| format!("{} is not a modelable loot table (pools missing)", path.display()))?;
    serde_json::to_value(table).map_err(|e| e.to_string())
}

/// Save a loot table. `content` is the JSON to write — validated to parse as
/// a modelable `LootTable` (so the write never lands a broken table) and then
/// written verbatim via the atomic write path.
#[tauri::command]
pub fn save_loot_table_cmd(
    project_path: String,
    source: String,
    content: String,
) -> Result<(), String> {
    let json: Value = serde_json::from_str(&content).map_err(|e| format!("Invalid JSON: {e}"))?;
    LootTable::from_value(&json)
        .ok_or_else(|| "Refusing to write: not a modelable loot table (pools missing)".to_string())?;

    let root = std::path::PathBuf::from(&project_path);
    let path = validate_under_root(&root, &source)?;
    atomic_write_str(&path, &content).map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write as _;

    const TABLE: &str = r#"{"type":"minecraft:chest","pools":[{"rolls":1,"entries":[{"type":"minecraft:item","name":"minecraft:stick"}]}]}"#;

    fn make_pack(tmp: &std::path::Path) -> std::path::PathBuf {
        let root = tmp.join("pack");
        let table = root.join("data").join("m").join("loot_table").join("chests");
        std::fs::create_dir_all(&table).unwrap();
        std::fs::write(table.join("simple.json"), TABLE).unwrap();
        root
    }

    #[test]
    fn reads_canonical_model_from_scanned_source() {
        let tmp = std::env::temp_dir().join(format!("loot_read_{}", std::process::id()));
        let root = make_pack(&tmp);
        let source = root.join("data/m/loot_table/chests/simple.json").to_string_lossy().into_owned();
        let v = read_loot_table_cmd(root.to_string_lossy().into_owned(), source).unwrap();
        assert_eq!(v.get("pools").unwrap().as_array().unwrap().len(), 1);
        assert_eq!(
            v.pointer("/pools/0/entries/0/name").unwrap(),
            "minecraft:stick"
        );
        let _ = std::fs::remove_dir_all(&tmp);
    }

    #[test]
    fn rejects_non_modelable_json_on_read() {
        let tmp = std::env::temp_dir().join(format!("loot_read_bad_{}", std::process::id()));
        let root = tmp.join("pack");
        std::fs::create_dir_all(root.join("data/m/loot_table/chests")).unwrap();
        std::fs::write(
            root.join("data/m/loot_table/chests/bad.json"),
            r#"{"hello":"world"}"#,
        )
        .unwrap();
        let source = root.join("data/m/loot_table/chests/bad.json").to_string_lossy().into_owned();
        let err = read_loot_table_cmd(root.to_string_lossy().into_owned(), source).unwrap_err();
        assert!(err.contains("pools missing"), "got: {err}");
        let _ = std::fs::remove_dir_all(&tmp);
    }

    #[test]
    fn saves_verbatim_and_atomically() {
        let tmp = std::env::temp_dir().join(format!("loot_save_{}", std::process::id()));
        let root = make_pack(&tmp);
        let target = root.join("data/m/loot_table/chests/simple.json");
        let source = target.to_string_lossy().into_owned();

        let edited = r#"{"type":"minecraft:chest","pools":[{"rolls":3,"entries":[{"type":"minecraft:item","name":"minecraft:stick","weight":2}]}],"random_sequence":"minecraft:chests/simple_dungeon"}"#;
        save_loot_table_cmd(root.to_string_lossy().into_owned(), source.clone(), edited.to_string()).unwrap();

        let on_disk = std::fs::read_to_string(&target).unwrap();
        assert_eq!(on_disk, edited, "written verbatim, not re-formatted");
        assert!(
            !std::fs::read_dir(root.join("data/m/loot_table/chests"))
                .unwrap()
                .any(|e| e.unwrap().file_name().to_string_lossy().ends_with(".tmp")),
            "tmp file cleaned up"
        );
        let _ = std::fs::remove_dir_all(&tmp);
    }

    #[test]
    fn refuses_broken_json_and_escapes() {
        let tmp = std::env::temp_dir().join(format!("loot_save_bad_{}", std::process::id()));
        let root = make_pack(&tmp);

        // Not JSON.
        let e = save_loot_table_cmd(
            root.to_string_lossy().into_owned(),
            "data/m/loot_table/chests/simple.json".to_string(),
            "{not json".to_string(),
        )
        .unwrap_err();
        assert!(e.contains("Invalid JSON"), "got: {e}");

        // JSON but not a loot table.
        let e = save_loot_table_cmd(
            root.to_string_lossy().into_owned(),
            "data/m/loot_table/chests/simple.json".to_string(),
            r#"{"hello":"world"}"#.to_string(),
        )
        .unwrap_err();
        assert!(e.contains("Refusing"), "got: {e}");

        // Path escape: traversal must be refused by the path-safety gate.
        let e = save_loot_table_cmd(
            root.to_string_lossy().into_owned(),
            "../outside.json".to_string(),
            TABLE.to_string(),
        )
        .unwrap_err();
        assert!(!e.is_empty(), "escape refused");

        let _ = std::fs::remove_dir_all(&tmp);
    }
}
