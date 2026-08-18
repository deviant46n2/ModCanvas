import { invoke } from '@tauri-apps/api/core'

/** A discovered loot table, as returned by the Rust scan (loot/mod.rs). */
export interface DiscoveredLootTable {
  id: string
  source: string
  table_type: string
  pools: number
  entries: number
  editable: boolean
  /** True when the table came from the vanilla game jar (s72 re-scope). */
  vanilla: boolean
}

/** Scan a pack for its loot tables (pack data folder + mod jars + the vanilla
 *  jar when an instance path is known — s72: a zero-mod pack gets vanilla
 *  loot to work with). */
export async function scanPackLootTables(
  projectPath: string,
  instancePath?: string,
): Promise<DiscoveredLootTable[]> {
  return invoke<DiscoveredLootTable[]>('scan_loot_tables_cmd', {
    projectPath,
    instancePath: instancePath || null,
  })
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

/** Copy a jar's loot table into the pack's own `data/` (B1, s72 re-scope:
 *  "copy to pack" — makes a read-only vanilla/mod table editable). `source`
 *  is the scan's `jar:<abs>!<internal>` descriptor; the target id + dir come
 *  from the jar entry + the adapter-derived dir name. Returns the new
 *  editable row for immediate selection. */
export async function copyLootTableToPack(
  projectPath: string,
  source: string,
  dirName: 'loot_table' | 'loot_tables',
): Promise<DiscoveredLootTable> {
  return invoke<DiscoveredLootTable>('copy_loot_table_to_pack_cmd', {
    projectPath,
    source,
    dirName,
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
