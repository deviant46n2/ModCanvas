import { describe, it, expect } from 'vitest'
import { itemUsageByItem, usageForItem } from './item-usage'
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

  it('counts a duplicate recipe ingredient once per reference', () => {
    // A shaped recipe lists the same item in two key slots → two references,
    // two counts (the index keeps duplicates by design).
    const idx = index([
      { source_kind: 'recipe', source_id: 'minecraft:diamond_block', item_id: 'minecraft:diamond' },
      { source_kind: 'recipe', source_id: 'minecraft:diamond_block', item_id: 'minecraft:diamond' },
    ])
    expect(itemUsageByItem(idx).get('minecraft:diamond')?.recipes).toBe(2)
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
