import { describe, expect, it } from 'vitest'
import { parseLootTable, serializeLootTable, type LootTableModel } from './model'
import { findLootItemFindings } from './validation'

/** parse → serialize → parse must be stable (fidelity: nothing dies). */
function roundTripStable(json: Record<string, unknown>) {
  const first = parseLootTable(json)
  expect(first).not.toBeNull()
  const out1 = serializeLootTable(first!)
  const second = parseLootTable(out1)
  expect(second).not.toBeNull()
  expect(serializeLootTable(second!)).toEqual(out1)
}

describe('loot model round-trip', () => {
  it('preserves unknown fields at every level', () => {
    const json = {
      type: 'minecraft:block',
      random_sequence: 'minecraft:chests/simple_dungeon',
      custom_top: { nested: [1, 2, 3] },
      pools: [
        {
          rolls: 1,
          bonus_rolls: 0,
          custom_pool: 'keep',
          entries: [
            {
              type: 'minecraft:item',
              name: 'minecraft:stick',
              weight: 1,
              custom_entry: true,
              functions: [{ function: 'minecraft:set_count', count: 3 }],
            },
          ],
          conditions: [{ condition: 'minecraft:survives_explosion', custom_cond: 'x' }],
        },
      ],
    }
    const t = parseLootTable(json)!
    expect(t.extra.custom_top).toEqual({ nested: [1, 2, 3] })
    expect(t.pools[0].extra.custom_pool).toBe('keep')
    expect(t.pools[0].entries[0].extra.custom_entry).toBe(true)
    expect(t.pools[0].entries[0].functions).toEqual([
      { function: 'minecraft:set_count', count: 3 },
    ])
    expect(t.pools[0].conditions[0]).toEqual({
      condition: 'minecraft:survives_explosion',
      custom_cond: 'x',
    })
    roundTripStable(json)
  })

  it('preserves int-vs-float and uniform rolls', () => {
    const t = parseLootTable({
      pools: [
        { rolls: 1, entries: [] },
        { rolls: 1.5, entries: [] },
        { rolls: { min: 2, max: 5 }, entries: [] },
      ],
    })!
    expect(t.pools[0].rolls).toEqual({ kind: 'count', value: 1 })
    expect(t.pools[1].rolls).toEqual({ kind: 'count', value: 1.5 })
    expect(t.pools[2].rolls).toMatchObject({ kind: 'uniform', min: 2, max: 5 })
    const serializedPool2 = (serializeLootTable(t).pools as Record<string, unknown>[])[2]
    expect(serializedPool2).toEqual({
      rolls: { min: 2, max: 5 },
      entries: [],
    })
  })

  it('keeps exotic rolls providers opaque', () => {
    const json = {
      pools: [
        {
          rolls: { type: 'minecraft:binomial', n: 3, p: 0.5 },
          entries: [{ type: 'minecraft:item', name: 'minecraft:apple' }],
        },
      ],
    }
    const t = parseLootTable(json)!
    expect(t.pools[0].rolls).toEqual({ kind: 'other', raw: { type: 'minecraft:binomial', n: 3, p: 0.5 } })
    roundTripStable(json)
  })

  it('models group children and omits empty fields on serialize', () => {
    const json = {
      type: 'minecraft:chest',
      pools: [
        {
          rolls: 1,
          entries: [
            { type: 'minecraft:loot_table', name: 'minecraft:chests/other' },
            {
              type: 'minecraft:group',
              children: [{ type: 'minecraft:item', name: 'minecraft:coal', weight: 2 }],
            },
          ],
        },
      ],
    }
    const t = parseLootTable(json)!
    expect(t.pools[0].entries[1].children).toHaveLength(1)
    const serializedEntry = (
      (serializeLootTable(t).pools as Record<string, unknown>[])[0].entries as Record<string, unknown>[]
    )[1]
    expect(serializedEntry).toEqual({
      type: 'minecraft:group',
      children: [{ type: 'minecraft:item', name: 'minecraft:coal', weight: 2 }],
    })
  })

  it('rejects non-loot JSON', () => {
    expect(parseLootTable({ hello: 'world' })).toBeNull()
    expect(parseLootTable({ pools: 'nope' })).toBeNull()
    expect(parseLootTable({})).toBeNull()
  })
})

describe('loot item validation', () => {
  const universe = new Set(['minecraft:stick', 'minecraft:coal', 'kubejs:custom_item'])

  it('grades item entries and descends into children', () => {
    const table: LootTableModel = {
      pools: [
        {
          rolls: { kind: 'count', value: 1 },
          entries: [
            { type: 'minecraft:item', name: 'minecraft:stick', functions: [], extra: {} },
            { type: 'minecraft:item', name: 'minecraft:missing', functions: [], extra: {} },
            {
              type: 'minecraft:group',
              children: [
                { type: 'minecraft:item', name: 'minecraft:coal', functions: [], extra: {} },
                { type: 'minecraft:item', name: 'nope:gone', functions: [], extra: {} },
              ],
              functions: [],
              extra: {},
            },
          ],
          conditions: [],
          extra: {},
        },
      ],
      extra: {},
    }
    const findings = findLootItemFindings(table, universe)
    expect(findings).toEqual([
      { itemId: 'minecraft:stick', resolved: true, where: 'pool 1 · entry 1' },
      { itemId: 'minecraft:missing', resolved: false, where: 'pool 1 · entry 2' },
      { itemId: 'minecraft:coal', resolved: true, where: 'pool 1 · entry 3 · entry 1' },
      { itemId: 'nope:gone', resolved: false, where: 'pool 1 · entry 3 · entry 2' },
    ])
  })

  it('skips non-item entries (tag, loot_table, dynamic)', () => {
    const table: LootTableModel = {
      pools: [
        {
          rolls: { kind: 'count', value: 1 },
          entries: [
            { type: 'minecraft:tag', name: 'minecraft:logs', functions: [], extra: {} },
            { type: 'minecraft:loot_table', name: 'minecraft:chests/other', functions: [], extra: {} },
            { type: 'minecraft:dynamic', name: 'minecraft:contents', functions: [], extra: {} },
            { type: 'minecraft:empty', functions: [], extra: {} },
          ],
          conditions: [],
          extra: {},
        },
      ],
      extra: {},
    }
    expect(findLootItemFindings(table, universe)).toEqual([])
  })
})
