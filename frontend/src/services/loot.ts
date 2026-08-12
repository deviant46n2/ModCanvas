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

/** Create a NEW loot table in the pack's own `data/` (loot/editor.rs).
 *  `dirName` is the adapter-derived dir (`loot_table` 1.21+ / `loot_tables`
 *  pre-1.21) — the version boundary lives in the adapter, never here. Returns
 *  the created row for immediate selection. */
export async function createLootTable(
  projectPath: string,
  namespace: string,
  name: string,
  dirName: 'loot_table' | 'loot_tables',
  content: string,
): Promise<DiscoveredLootTable> {
  return invoke<DiscoveredLootTable>('create_loot_table_cmd', {
    projectPath,
    namespace,
    name,
    dirName,
    content,
  })
}

/** A fresh starter table JSON for the New Table form: chest type, one pool,
 *  one item entry — the author fills it in the editor. */
export function starterLootTableContent(namespace: string): string {
  return JSON.stringify(
    {
      type: 'minecraft:chest',
      pools: [
        {
          rolls: 1,
          bonus_rolls: 0,
          entries: [{ type: 'minecraft:item', name: `${namespace}:placeholder`, weight: 1 }],
        },
      ],
    },
    null,
    2,
  )
}
