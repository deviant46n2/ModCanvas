import { describe, it, expect } from 'vitest'
import { parseItemQuery, filterRegistryItems } from './item-registry'
import type { ItemRegistryEntry } from './quest-types'

function entry(id: string, mod_id = '', name = ''): ItemRegistryEntry {
  return { id, name: name || id, mod_id, texture_data_url: null }
}

describe('parseItemQuery', () => {
  it('extracts an @modid filter and the text remainder', () => {
    expect(parseItemQuery('@create iron')).toEqual({ modFilter: 'create', textSearch: 'iron' })
    expect(parseItemQuery('iron ingot')).toEqual({ modFilter: undefined, textSearch: 'iron ingot' })
    expect(parseItemQuery('  @AE2  ')).toEqual({ modFilter: 'ae2', textSearch: '' })
    expect(parseItemQuery('')).toEqual({ modFilter: undefined, textSearch: '' })
  })
})

describe('filterRegistryItems', () => {
  const items = [
    entry('minecraft:iron_ingot', 'minecraft', 'Iron Ingot'),
    entry('create:brass_ingot', 'create', 'Brass Ingot'),
    entry('create:copper_nugget', 'create', 'Copper Nugget'),
  ]

  it('matches by name and id text', () => {
    expect(filterRegistryItems(items, 'iron').map((i) => i.id)).toEqual(['minecraft:iron_ingot'])
    expect(filterRegistryItems(items, 'ingot').map((i) => i.id)).toEqual(['minecraft:iron_ingot', 'create:brass_ingot'])
  })

  it('narrows by @modid', () => {
    expect(filterRegistryItems(items, '@create').map((i) => i.id)).toEqual(['create:brass_ingot', 'create:copper_nugget'])
  })

  it('combines @modid and text', () => {
    expect(filterRegistryItems(items, '@create copper').map((i) => i.id)).toEqual(['create:copper_nugget'])
  })

  it('is case-insensitive', () => {
    expect(filterRegistryItems(items, 'IRON').map((i) => i.id)).toEqual(['minecraft:iron_ingot'])
  })

  it('returns everything for an empty query', () => {
    expect(filterRegistryItems(items, '')).toHaveLength(3)
  })
})
