// Pure reverse-lookup over the Pack Index (P1-PACKINDEX consumer support).
// The index stores forward references (source → item); consumers want the
// inverse — "which recipes/quests/tags use THIS item". Pure function, no I/O.

import type { PackIndex } from '../../services/pack-index'

/** Per-item usage counts grouped by source kind. Counts DISTINCT SOURCES —
 *  a shaped recipe listing an item in two slots is one recipe, not two
 *  (deduped by source_kind + source_id; the index keeps duplicate references
 *  by design, invert.rs). */
export interface ItemUsage {
  /** Number of DISTINCT recipes (output or ingredient) referencing the item. */
  recipes: number
  /** Number of DISTINCT quests rewarding the item. */
  quests: number
  /** Number of DISTINCT tags whose members include the item. */
  tags: number
}

/**
 * Build item → usage counts from the index references. References are typed
 * by source_kind (`recipe` / `quest` / `tag`); anything else is ignored.
 *
 * Counts DISTINCT SOURCES, not references: a shaped recipe listing the same
 * item in two key slots emits two references with the same source_id, but the
 * user-facing truth is "used in one recipe" — the footer presents these as
 * recipe/quest/tag counts, so references are deduped by (source_kind,
 * source_id) per item. The Rust index keeps duplicates by design (invert.rs);
 * the dedup lives at the display layer. Deterministic: same index → same map.
 */
export function itemUsageByItem(index: PackIndex): Map<string, ItemUsage> {
  const out = new Map<string, ItemUsage>()
  const seen = new Map<string, Set<string>>()
  for (const ref of index.references) {
    const key = `${ref.source_kind}:${ref.source_id}`
    let seenKeys = seen.get(ref.item_id)
    if (!seenKeys) {
      seenKeys = new Set()
      seen.set(ref.item_id, seenKeys)
    }
    if (seenKeys.has(key)) continue
    seenKeys.add(key)
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

/**
 * The hover-footer copy for one item's usage, matching the icon-picker's
 * wording exactly so both consumers read the same. Pure — the component
 * decides when to render it. Zero counts render the "not referenced" line.
 */
export function usageSummaryText(usage: ItemUsage): string {
  if (usage.recipes === 0 && usage.quests === 0 && usage.tags === 0) {
    return 'Not referenced by any recipe, quest, or tag in this pack'
  }
  const parts: string[] = []
  if (usage.recipes > 0) parts.push(`${usage.recipes} recipe${usage.recipes === 1 ? '' : 's'}`)
  if (usage.quests > 0) parts.push(`${usage.quests} quest${usage.quests === 1 ? '' : 's'}`)
  if (usage.tags > 0) parts.push(`${usage.tags} tag${usage.tags === 1 ? '' : 's'}`)
  return `Used in ${parts.join(', ')}`
}
