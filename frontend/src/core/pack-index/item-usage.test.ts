import { describe, it, expect } from 'vitest'
import { itemUsageByItem, usageForItem, usageSummaryText } from './item-usage'
import type { PackIndex } from '../../services/pack-index'

function index(references: PackIndex['references']): PackIndex {
  return {
    items: [],
    tags: [],
    references,
    dead_references: [],
    recipe_ids: [],
    quest_ids: [],
  }
}

describe('itemUsageByItem', () => {
  it('counts references grouped by source kind', () => {
    const idx = index([
      { source_kind: 'recipe', source_id: 'minecraft:torch', item_id: 'minecraft:coal' },
      { source_kind: 'recipe', source_id: 'minecraft:torch', item_id: 'minecraft:stick' },
      { source_kind: 'quest', source_id: 'n1', item_id: 'minecraft:coal' },
      { source_kind: 'tag', source_id: '#minecraft:coals', item_id: 'minecraft:coal' },
    ])
    const usage = itemUsageByItem(idx)
    expect(usage.get('minecraft:coal')).toEqual({ recipes: 1, quests: 1, tags: 1 })
    expect(usage.get('minecraft:stick')).toEqual({ recipes: 1, quests: 0, tags: 0 })
  })

  it('counts one recipe once when the item appears in multiple slots', () => {
    // A shaped recipe lists the same item in two key slots → two references,
    // ONE recipe. The index keeps duplicates by design (invert.rs); the
    // display layer dedups by (source_kind, source_id) so the footer never
    // says "2 recipes" for a single recipe (s68 review catch).
    const idx = index([
      { source_kind: 'recipe', source_id: 'minecraft:diamond_block', item_id: 'minecraft:diamond' },
      { source_kind: 'recipe', source_id: 'minecraft:diamond_block', item_id: 'minecraft:diamond' },
    ])
    expect(itemUsageByItem(idx).get('minecraft:diamond')?.recipes).toBe(1)
  })

  it('counts distinct recipes separately', () => {
    // Two different recipes both use the item → two recipes.
    const idx = index([
      { source_kind: 'recipe', source_id: 'minecraft:diamond_block', item_id: 'minecraft:diamond' },
      { source_kind: 'recipe', source_id: 'minecraft:diamond_sword', item_id: 'minecraft:diamond' },
    ])
    expect(itemUsageByItem(idx).get('minecraft:diamond')?.recipes).toBe(2)
  })

  it('dedups tags and quests by source too', () => {
    // Same tag referenced twice → one tag; same quest twice → one quest.
    const idx = index([
      { source_kind: 'tag', source_id: '#minecraft:coals', item_id: 'minecraft:coal' },
      { source_kind: 'tag', source_id: '#minecraft:coals', item_id: 'minecraft:coal' },
      { source_kind: 'quest', source_id: 'n1', item_id: 'minecraft:coal' },
      { source_kind: 'quest', source_id: 'n1', item_id: 'minecraft:coal' },
    ])
    expect(itemUsageByItem(idx).get('minecraft:coal')).toEqual({ recipes: 0, quests: 1, tags: 1 })
  })

  it('ignores unknown source kinds', () => {
    const idx = index([
      { source_kind: 'mystery', source_id: 'x', item_id: 'minecraft:coal' },
    ])
    expect(usageForItem(idx, 'minecraft:coal')).toEqual({ recipes: 0, quests: 0, tags: 0 })
  })

  it('returns zeros for unreferenced items', () => {
    expect(usageForItem(index([]), 'minecraft:air')).toEqual({ recipes: 0, quests: 0, tags: 0 })
  })
})

describe('usageSummaryText', () => {
  it('renders the not-referenced line when all counts are zero', () => {
    expect(usageSummaryText({ recipes: 0, quests: 0, tags: 0 })).toBe(
      'Not referenced by any recipe, quest, or tag in this pack',
    )
  })

  it('joins non-zero parts with pluralization', () => {
    expect(usageSummaryText({ recipes: 1, quests: 2, tags: 0 })).toBe(
      'Used in 1 recipe, 2 quests',
    )
  })

  it('omits zero parts and singulars correctly', () => {
    expect(usageSummaryText({ recipes: 0, quests: 0, tags: 1 })).toBe('Used in 1 tag')
    expect(usageSummaryText({ recipes: 3, quests: 0, tags: 0 })).toBe('Used in 3 recipes')
  })
})
