// Loot-table scanning (P3-LOOT, roadmap §13). Read-only MVP: walks the
// pack's real loot-table sources (`data/*/loot_table(s)/*.json` + the same
// path inside mod jars), parses each into a typed summary, and returns the
// list to the frontend for the Loot tab. Mirrors the recipe scan pattern
// (`recipes/pack_scan.rs`) — same dual-directory handling, same
// pack-data-shadows-jar dedup.
//
// Deliberately read-only: the editor (weighted pools, conditions, JSON
// emission) is the remaining P3-LOOT build; this module is the "a scan,
// like recipes" half the roadmap calls out (§7.4.2).

pub mod parse;
pub mod pack_scan;

use serde::{Deserialize, Serialize};

/// A discovered loot table, summarized for the Loot tab list.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiscoveredLootTable {
    /// Resource id, `ns:name` (e.g. `ftbquests:loot_crate_opener`).
    pub id: String,
    /// Absolute source path (or `jar:<path>!<internal>` for jar entries).
    pub source: String,
    /// Top-level table type, e.g. `minecraft:block` or `minecraft:chest`.
    pub table_type: String,
    /// Number of pools in the table.
    pub pools: usize,
    /// Total entries across all pools.
    pub entries: usize,
    /// True when the table lives in the pack's own `data/` (editable on
    /// disk) rather than inside a mod jar.
    pub editable: bool,
}

/// Scan a pack for its loot tables. Walks `data/` and every mod jar/zip,
/// matching `data/<ns>/loot_table(s)/<rest>.json` (pre-1.21 `loot_tables`,
/// 1.21+ singular `loot_table` — the version boundary the adapter matrix
/// documents). Returns every table discovered; unparseable JSON is skipped.
pub fn scan_pack_loot_tables(project_path: &std::path::Path) -> Vec<DiscoveredLootTable> {
    pack_scan::scan_pack_loot_tables(project_path)
}

#[tauri::command]
pub fn scan_loot_tables_cmd(project_path: String) -> Result<Vec<DiscoveredLootTable>, String> {
    Ok(scan_pack_loot_tables(std::path::Path::new(&project_path)))
}
