// Pure reverse-lookup over the Pack Index (P1-PACKINDEX consumer support).
// The index stores forward references (source → item); consumers want the
// inverse — "which recipes/quests/tags use THIS item". Pure function, no I/O.

import type { PackIndex } from '../../services/pack-index'

/** Per-item usage counts grouped by source kind. */
export interface ItemUsage {
  /** Number of recipes (output or ingredient) referencing the item. */
  recipes: number
  /** Number of quests rewarding the item. */
  quests: number
  /** Number of tags whose members include the item. */
  tags: number
}

/**
 * Build item → usage counts from the index references. References are typed
 * by source_kind (`recipe` / `quest` / `tag`); anything else is ignored.
 * Deterministic: same index → same map.
 */
export function itemUsageByItem(index: PackIndex): Map<string, ItemUsage> {
  const out = new Map<string, ItemUsage>()
  for (const ref of index.references) {
    let usage = out.get(ref.item_id)
    if (!usage) {
      usage = { recipes: 0, quests: 0, tags: 0 }
      out.set(ref.item_id, usage)
    }
    if (ref.source_kind === 'recipe') usage.recipes += 1
    else if (ref.source_kind === 'quest') usage.quests += 1
    else if (ref.source_kind === 'tag') usage.tags += 1
  }
  return out
}

/** The usage counts for one item id, or zeros when unreferenced. */
export function usageForItem(index: PackIndex, itemId: string): ItemUsage {
  return itemUsageByItem(index).get(itemId) ?? { recipes: 0, quests: 0, tags: 0 }
}
