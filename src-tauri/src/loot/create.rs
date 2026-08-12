// Create-a-new-loot-table command (P3-LOOT follow-up). The I/O layer's
// boundary for NEW tables: validates the version-derived dir name against the
// whitelist, validates namespace/name as a safe resource path, refuses to
// clobber, and writes atomically. Path gate is the same as read/save:
// `<root>/data/...` — the PROJECT root, via `validate_under_root`, NEVER the
// config-scoped `validate_project_write` (the s45 regression lock).

use crate::loot::model::LootTable;
use crate::loot::DiscoveredLootTable;
use crate::path_safety::{atomic_write_str, validate_under_root};
use serde_json::Value;

/// The two historical datapack dir names. A create request must name one of
/// these exactly — the adapter matrix decides WHICH one for the pack's MC
/// version (frontend), and Rust re-validates against this whitelist (a
/// frontend bug can never write `data/<ns>/../../whatever`).
const LOOT_DIR_NAMES: [&str; 2] = ["loot_table", "loot_tables"];

/// Create a NEW loot table inside the pack's own `data/`. The frontend passes
/// the version-derived dir name (adapter matrix); Rust validates it against
/// the whitelist, validates the namespace/name as a safe resource path, then
/// refuses to clobber an existing table. Returns the created row so the
/// frontend can select it immediately.
#[tauri::command]
pub fn create_loot_table_cmd(
    project_path: String,
    namespace: String,
    name: String,
    dir_name: String,
    content: String,
) -> Result<DiscoveredLootTable, String> {
    if !LOOT_DIR_NAMES.contains(&dir_name.as_str()) {
        return Err(format!("Unknown loot dir name: {dir_name} (expected loot_table or loot_tables)"));
    }

    loot_resource_rel_path(&namespace, &name)?;
    let full_rel = format!("data/{namespace}/{dir_name}/{name}.json");

    let json: Value = serde_json::from_str(&content).map_err(|e| format!("Invalid JSON: {e}"))?;
    let table = LootTable::from_value(&json)
        .ok_or_else(|| "Refusing to create: not a modelable loot table (pools missing)".to_string())?;

    let root = std::path::PathBuf::from(&project_path);
    let path = validate_under_root(&root, &full_rel)?;
    if path.exists() {
        return Err(format!("Refusing to overwrite existing loot table {namespace}:{name}"));
    }
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create directory {}: {e}", parent.display()))?;
    }
    atomic_write_str(&path, &content).map_err(|e| e.to_string())?;

    Ok(DiscoveredLootTable {
        id: format!("{namespace}:{name}"),
        source: path.to_string_lossy().to_string(),
        table_type: table.table_type.unwrap_or_else(|| "minecraft:unknown".to_string()),
        pools: table.pools.len(),
        entries: table.pools.iter().map(|p| p.entries.len()).sum(),
        editable: true,
    })
}

/// Validate the `data/<ns>/<dir>/...` path components BETWEEN the datapack
/// root and the file name. `namespace` must be a bare resource namespace
/// (no `/`, no `..`); `name` is the resource path WITHOUT the `.json`
/// extension (subdirs allowed, traversal refused) — the same id-path form
/// the scan uses (`chests/simple_dungeon`). Rust appends `.json`.
fn loot_resource_rel_path(namespace: &str, name: &str) -> Result<(), String> {
    if namespace.is_empty() || namespace.contains('/') || namespace.contains('\\') {
        return Err("Namespace must be a bare resource namespace".to_string());
    }
    if namespace == "." || namespace == ".." {
        return Err("Namespace cannot be a traversal sequence".to_string());
    }
    if name.is_empty() || name == "." || name == ".." {
        return Err("Loot table name cannot be empty or a traversal sequence".to_string());
    }
    if name.starts_with('/') || name.starts_with('\\') {
        return Err("Loot table name cannot start with a path separator".to_string());
    }
    if name.contains("..") {
        return Err("Loot table name cannot contain traversal segments".to_string());
    }
    if name.ends_with(".json") {
        return Err("Loot table name must be the resource path without .json".to_string());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    const TABLE: &str = r#"{"type":"minecraft:chest","pools":[{"rolls":1,"entries":[{"type":"minecraft:item","name":"minecraft:stick"}]}]}"#;

    fn root(tmp: &std::path::Path) -> std::path::PathBuf {
        let root = tmp.join("pack");
        std::fs::create_dir_all(&root).unwrap();
        root
    }

    #[test]
    fn creates_new_table_in_version_dir_and_returns_row() {
        let tmp = std::env::temp_dir().join(format!("loot_create_{}", std::process::id()));
        let root = root(&tmp);

        let row = create_loot_table_cmd(
            root.to_string_lossy().into_owned(),
            "minecraft".to_string(),
            "chests/my_dungeon".to_string(),
            "loot_table".to_string(),
            TABLE.to_string(),
        )
        .unwrap();
        assert_eq!(row.id, "minecraft:chests/my_dungeon");
        assert!(row.editable);
        assert_eq!(row.pools, 1);

        let on_disk = root.join("data/minecraft/loot_table/chests/my_dungeon.json");
        assert!(on_disk.is_file(), "file exists at {}", on_disk.display());
        assert_eq!(std::fs::read_to_string(&on_disk).unwrap(), TABLE, "written verbatim");
        let _ = std::fs::remove_dir_all(&tmp);
    }

    #[test]
    fn create_uses_the_passed_dir_name_not_hardcoded() {
        let tmp = std::env::temp_dir().join(format!("loot_create_old_{}", std::process::id()));
        let root = root(&tmp);

        let row = create_loot_table_cmd(
            root.to_string_lossy().into_owned(),
            "oldmod".to_string(),
            "chest".to_string(),
            "loot_tables".to_string(),
            TABLE.to_string(),
        )
        .unwrap();
        assert_eq!(row.id, "oldmod:chest");
        let on_disk = root.join("data/oldmod/loot_tables/chest.json");
        assert!(on_disk.is_file(), "pre-1.21 dir name honored: {}", on_disk.display());
        let _ = std::fs::remove_dir_all(&tmp);
    }

    #[test]
    fn create_refuses_clobber_unknown_dir_and_traversal() {
        let tmp = std::env::temp_dir().join(format!("loot_create_bad_{}", std::process::id()));
        let root = root(&tmp);

        // Unknown dir name (frontend bug must not corrupt the path).
        let e = create_loot_table_cmd(
            root.to_string_lossy().into_owned(),
            "m".to_string(),
            "a".to_string(),
            "../../evil".to_string(),
            TABLE.to_string(),
        )
        .unwrap_err();
        assert!(e.contains("Unknown loot dir"), "got: {e}");

        // Traversal in namespace.
        let e = create_loot_table_cmd(
            root.to_string_lossy().into_owned(),
            "../outside".to_string(),
            "a".to_string(),
            "loot_table".to_string(),
            TABLE.to_string(),
        )
        .unwrap_err();
        assert!(e.contains("Namespace"), "got: {e}");

        // Traversal in name.
        let e = create_loot_table_cmd(
            root.to_string_lossy().into_owned(),
            "m".to_string(),
            "../escape".to_string(),
            "loot_table".to_string(),
            TABLE.to_string(),
        )
        .unwrap_err();
        assert!(e.contains("traversal"), "got: {e}");

        // Name must be the extension-less resource path.
        let e = create_loot_table_cmd(
            root.to_string_lossy().into_owned(),
            "m".to_string(),
            "a.json".to_string(),
            "loot_table".to_string(),
            TABLE.to_string(),
        )
        .unwrap_err();
        assert!(e.contains("without .json"), "got: {e}");

        // Clobber refusal: create, then create again.
        create_loot_table_cmd(
            root.to_string_lossy().into_owned(),
            "m".to_string(),
            "a".to_string(),
            "loot_table".to_string(),
            TABLE.to_string(),
        )
        .unwrap();
        let e = create_loot_table_cmd(
            root.to_string_lossy().into_owned(),
            "m".to_string(),
            "a".to_string(),
            "loot_table".to_string(),
            TABLE.to_string(),
        )
        .unwrap_err();
        assert!(e.contains("overwrite"), "got: {e}");

        let _ = std::fs::remove_dir_all(&tmp);
    }
}
