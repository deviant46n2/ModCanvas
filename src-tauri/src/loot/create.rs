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
use std::io::Read;

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
    let root = std::path::PathBuf::from(&project_path);
    write_new_pack_table(&root, &namespace, &name, &dir_name, &content)
}

/// The shared write tail for new pack tables: whitelist the dir name, validate
/// namespace/name as a safe resource path, refuse to clobber, write atomically.
/// Used by `create_loot_table_cmd` and `copy_loot_table_to_pack_cmd` so both
/// paths carry identical safety semantics.
fn write_new_pack_table(
    root: &std::path::Path,
    namespace: &str,
    name: &str,
    dir_name: &str,
    content: &str,
) -> Result<DiscoveredLootTable, String> {
    if !LOOT_DIR_NAMES.contains(&dir_name) {
        return Err(format!("Unknown loot dir name: {dir_name} (expected loot_table or loot_tables)"));
    }

    loot_resource_rel_path(namespace, name)?;
    let full_rel = format!("data/{namespace}/{dir_name}/{name}.json");

    let json: Value = serde_json::from_str(content).map_err(|e| format!("Invalid JSON: {e}"))?;
    let table = LootTable::from_value(&json)
        .ok_or_else(|| "Refusing to create: not a modelable loot table (pools missing)".to_string())?;

    let path = validate_under_root(root, &full_rel)?;
    if path.exists() {
        return Err(format!("Refusing to overwrite existing loot table {namespace}:{name}"));
    }
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create directory {}: {e}", parent.display()))?;
    }
    atomic_write_str(&path, content).map_err(|e| e.to_string())?;

    Ok(DiscoveredLootTable {
        id: format!("{namespace}:{name}"),
        source: path.to_string_lossy().to_string(),
        table_type: table.table_type.unwrap_or_else(|| "minecraft:unknown".to_string()),
        pools: table.pools.len(),
        entries: table.pools.iter().map(|p| p.entries.len()).sum(),
        editable: true,
        vanilla: false,
    })
}

/// Copy a loot table OUT of a jar into the pack's own `data/` (B1, s72 re-scope:
/// "copy to pack" for vanilla/mod-jar tables so a zero-mod pack has editable
/// content). `source` is the scan's `jar:<abs_path>!<zip_internal_path>`
/// descriptor; the target id + dir come from the jar entry name + the
/// version-derived dir name (adapter matrix), exactly like a create.
#[tauri::command]
pub fn copy_loot_table_to_pack_cmd(
    project_path: String,
    source: String,
    dir_name: String,
) -> Result<DiscoveredLootTable, String> {
    let (jar_path, internal) = source
        .strip_prefix("jar:")
        .and_then(|s| s.split_once('!'))
        .ok_or_else(|| format!("Not a jar source: {source}"))?;

    let file = std::fs::File::open(jar_path)
        .map_err(|e| format!("Failed to open jar {}: {e}", jar_path))?;
    let mut archive = zip::ZipArchive::new(file)
        .map_err(|e| format!("Failed to read jar {}: {e}", jar_path))?;
    let mut entry = archive
        .by_name(internal)
        .map_err(|e| format!("Table {} not found in jar: {e}", internal))?;
    let mut content = String::new();
    entry
        .read_to_string(&mut content)
        .map_err(|e| format!("Failed to read {}: {e}", internal))?;

    let (ns, id_path) = crate::loot::pack_scan::loot_id_from_jar_entry(internal)
        .ok_or_else(|| format!("Not a loot-table path: {internal}"))?;

    let root = std::path::PathBuf::from(&project_path);
    write_new_pack_table(&root, &ns, &id_path, &dir_name, &content)
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
