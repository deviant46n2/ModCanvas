import { invoke } from '@tauri-apps/api/core'

/** A discovered loot table, as returned by the Rust scan (loot/mod.rs). */
export interface DiscoveredLootTable {
  id: string
  source: string
  table_type: string
  pools: number
  entries: number
  editable: boolean
}

/** Scan a pack for its loot tables (pack data folder + mod jars). */
export async function scanPackLootTables(projectPath: string): Promise<DiscoveredLootTable[]> {
  return invoke<DiscoveredLootTable[]>('scan_loot_tables_cmd', { projectPath })
}

/** Load one table as its canonical model (loot/editor.rs). Returns the raw
 *  JSON object the frontend parses with `parseLootTable` (core/loot/model.ts). */
export async function readLootTable(
  projectPath: string,
  source: string,
): Promise<Record<string, unknown>> {
  return invoke<Record<string, unknown>>('read_loot_table_cmd', { projectPath, source })
}

/** Save a loot table verbatim after structural validation (loot/editor.rs). */
export async function saveLootTable(
  projectPath: string,
  source: string,
  content: string,
): Promise<void> {
  return invoke<void>('save_loot_table_cmd', { projectPath, source, content })
}
