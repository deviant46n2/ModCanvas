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
