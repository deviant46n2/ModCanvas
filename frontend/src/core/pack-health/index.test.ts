import { describe, it, expect } from 'vitest'
import { analyzePackHealth, MIN_TRUSTED_REGISTRY_ITEMS } from './index'
import {
  makeGraph,
  makeNode,
  makeObjective,
  makeChapter,
  makeEdge,
} from './test-fixtures'
import type { ItemRegistryEntry } from '../../services/quest-types'
import type { Behavior } from '../behavior/behavior-store'

function bigRegistry(missing: string[] = []): ItemRegistryEntry[] {
  const missingSet = new Set(missing)
  const registry: ItemRegistryEntry[] = []
  for (let i = 0; i < Math.max(MIN_TRUSTED_REGISTRY_ITEMS, 500); i++) {
    const id = `minecraft:item_${i}`
    if (missingSet.has(id)) continue
    registry.push({ id, name: `Item ${i}`, mod_id: 'minecraft', texture_data_url: null })
  }
  return registry
}

const baseInput = {
  questGraph: null,
  itemRegistry: [] as ItemRegistryEntry[],
  recipes: [],
  behaviors: [] as Behavior[],
  packMeta: { name: 'Pack', description: 'Desc', author: 'Me', packVersion: '1.0.0' },
  hasCoverImage: true,
  packLoaded: true,
}

const itemNode = (id: string, target: string) =>
  makeNode({ id, objectives: [makeObjective({ id: `${id}-o`, target })] })

describe('analyzePackHealth', () => {
  it('goes GO with no inputs materialized', () => {
    const report = analyzePackHealth(baseInput)
    expect(report.go).toBe(true)
    expect(report.blockingCount).toBe(0)
    expect(report.sections.map((s) => s.key)).toEqual(['quests', 'recipes', 'behaviors', 'pack'])
  })

  it('flags behavior missing-item findings as recommended when the registry is trusted', () => {
    const behaviors: Behavior[] = [
      {
        id: 'starter:kit',
        name: 'Starter Kit',
        backend: 'kubejs',
        trigger: { kind: 'player_joins_game' },
        conditions: [],
        actions: [{ kind: 'give_item', item: 'minecraft:ghost_item', count: 1 }],
      },
    ]
    const report = analyzePackHealth({ ...baseInput, itemRegistry: bigRegistry(), behaviors })
    expect(report.go).toBe(true)
    expect(report.blockingCount).toBe(0)
    const section = report.sections.find((s) => s.key === 'behaviors')!
    const missing = section.items.filter((i) => i.id.startsWith('behaviors.missing-item.'))
    expect(missing).toHaveLength(1)
    expect(missing[0].severity).toBe('recommended')
  })

  it('suppresses behavior item findings when the registry is degraded', () => {
    const behaviors: Behavior[] = [
      {
        id: 'starter:kit',
        name: 'Starter Kit',
        backend: 'kubejs',
        trigger: { kind: 'player_joins_game' },
        conditions: [],
        actions: [{ kind: 'give_item', item: 'minecraft:item_0', count: 1 }],
      },
    ]
    const report = analyzePackHealth({ ...baseInput, itemRegistry: [{ id: 'minecraft:item_0', name: 'x', mod_id: 'm', texture_data_url: null }], behaviors })
    const section = report.sections.find((s) => s.key === 'behaviors')!
    expect(section.items.filter((i) => i.id.startsWith('behaviors.missing-item.'))).toEqual([])
    const pack = report.sections.find((s) => s.key === 'pack')!
    expect(pack.items.some((i) => i.id === 'pack.item-registry-degraded')).toBe(true)
  })

  it('flags a degraded registry with one diagnostic instead of item floods', () => {
    const questGraph = makeGraph({
      nodes: [itemNode('q1', 'minecraft:item_0'), itemNode('q2', 'minecraft:item_1')],
      chapters: [makeChapter({ id: 'ch' })],
    })
    // Registry below the trust threshold -> item-existence checks suppressed.
    const report = analyzePackHealth({ ...baseInput, itemRegistry: [{ id: 'minecraft:item_0', name: 'x', mod_id: 'm', texture_data_url: null }], questGraph })
    expect(report.go).toBe(true)
    const pack = report.sections.find((s) => s.key === 'pack')!
    expect(pack.items.some((i) => i.id === 'pack.item-registry-degraded')).toBe(true)
    const quests = report.sections.find((s) => s.key === 'quests')!
    expect(quests.items.some((i) => i.id.startsWith('quest.missing-item.'))).toBe(false)
  })

  it('surfaces missing items as recommended when the registry is trustworthy', () => {
    const questGraph = makeGraph({
      nodes: [itemNode('q1', 'minecraft:item_0'), itemNode('q2', 'minecraft:ghost_item')],
      chapters: [makeChapter({ id: 'ch' })],
    })
    const report = analyzePackHealth({ ...baseInput, itemRegistry: bigRegistry(), questGraph })
    expect(report.go).toBe(true)
    expect(report.blockingCount).toBe(0)
    const quests = report.sections.find((s) => s.key === 'quests')!
    const missing = quests.items.filter((i) => i.id.startsWith('quest.missing-item.'))
    expect(missing).toHaveLength(1)
    expect(missing[0].severity).toBe('recommended')
    expect(report.stats.indexedItems).toBeGreaterThanOrEqual(MIN_TRUSTED_REGISTRY_ITEMS)
    expect(report.stats.itemCoverage).toBeGreaterThanOrEqual(0.5)
  })

  it('keeps structural blockers blocking even with a degraded registry', () => {
    const questGraph = makeGraph({
      nodes: [makeNode({ id: 'a' }), makeNode({ id: 'b' })],
      edges: [makeEdge('e1', 'a', 'b'), makeEdge('e2', 'b', 'a')],
      chapters: [makeChapter({ id: 'ch' })],
    })
    const report = analyzePackHealth({ ...baseInput, itemRegistry: [], questGraph })
    expect(report.go).toBe(false)
    expect(report.blockingCount).toBeGreaterThanOrEqual(1)
    const quests = report.sections.find((s) => s.key === 'quests')!
    expect(quests.items.some((i) => i.id.startsWith('quest.dependency-cycle.'))).toBe(true)
  })

  it('adds recommended coverage items without blocking', () => {
    const report = analyzePackHealth({
      ...baseInput,
      hasCoverImage: false,
      packMeta: { name: '', description: '', author: '', packVersion: '' },
    })
    expect(report.go).toBe(true)
    expect(report.recommendedCount).toBeGreaterThan(0)
    expect(report.optionalCount).toBe(0)
  })

  it('populates registry stats', () => {
    const report = analyzePackHealth({ ...baseInput, itemRegistry: bigRegistry(), questGraph: makeGraph({}) })
    expect(report.stats.indexedItems).toBeGreaterThanOrEqual(MIN_TRUSTED_REGISTRY_ITEMS)
    expect(report.stats.itemCoverage).toBeNull() // no checkable refs
  })
})
