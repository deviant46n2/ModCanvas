// Loot-table item validation (P3-LOOT, roadmap §13). Pure: walks a loot
// table model and reports item references that do not resolve in the pack's
// item universe. The universe is the same `scan_instance_items` set the Pack
// Index builds from (build.rs step 1) — validating against it IS validating
// against the Pack Index's reference universe.
//
// Warnings, never failures (the s46 lesson): a dead id in a loot table can be
// a KubeJS-registered item the index missed, a data-component item, or an
// actual mistake. The editor surfaces it, the user decides.

import type { LootTableModel } from './model'

/** A resolved-or-dead item reference inside a loot table, with a human path
 *  to the entry ("pool 1 · entry 2"). */
export interface LootItemFinding {
  /** The referenced item id, canonical `ns:path`. */
  itemId: string
  /** True when the id resolves in the item universe. */
  resolved: boolean
  /** Human-readable location, e.g. `pool 2 · entry 1`. */
  where: string
}

const ITEM_ENTRY_TYPE = 'minecraft:item'

/** Walk every `minecraft:item` entry in the table (top-level and inside
 *  group/alternatives children) and grade its `name` against `itemIds`.
 *  Other entry types (tag, loot_table, dynamic, empty) reference non-item
 *  ids and are not graded. Deterministic: pool order, entry order. */
export function findLootItemFindings(
  table: LootTableModel,
  itemIds: Set<string>,
): LootItemFinding[] {
  const findings: LootItemFinding[] = []
  table.pools.forEach((pool, poolIdx) => {
    walkEntries(pool.entries, `pool ${poolIdx + 1}`, itemIds, findings)
  })
  return findings
}

function walkEntries(
  entries: LootTableModel['pools'][number]['entries'],
  at: string,
  itemIds: Set<string>,
  out: LootItemFinding[],
): void {
  entries.forEach((entry, idx) => {
    const where = `${at} · entry ${idx + 1}`
    if (entry.type === ITEM_ENTRY_TYPE && entry.name) {
      out.push({
        itemId: entry.name,
        resolved: itemIds.has(entry.name),
        where,
      })
    }
    if (entry.children) {
      walkEntries(entry.children, where, itemIds, out)
    }
  })
}
