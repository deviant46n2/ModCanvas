// Tag catalog filter tests (was part of recipe-editor.test.ts).

import { describe, it, expect } from 'vitest'
import { filterTagCatalog } from './tag-filter'

describe('filterTagCatalog', () => {

  const tags = [
    { id: 'minecraft:logs', member_count: 11 },
    { id: 'forge:ingots/iron', member_count: 3 },
    { id: 'kubejs:copper_ingot', member_count: 1 },
    { id: 'minecraft:logs_that_burn', member_count: 9 },
  ]

  it('returns everything on an empty query', () => {
    expect(filterTagCatalog(tags, '')).toEqual(tags)
    expect(filterTagCatalog(tags, '   ')).toEqual(tags)
  })

  it('filters by case-insensitive id substring', () => {
    const out = filterTagCatalog(tags, 'logs')
    expect(out.map((t) => t.id)).toEqual(['minecraft:logs', 'minecraft:logs_that_burn'])
  })

  it('filters by @namespace', () => {
    const out = filterTagCatalog(tags, '@minecraft')
    expect(out.map((t) => t.id)).toEqual(['minecraft:logs', 'minecraft:logs_that_burn'])
  })

  it('combines @namespace and text', () => {
    const out = filterTagCatalog(tags, '@minecraft logs_that')
    expect(out.map((t) => t.id)).toEqual(['minecraft:logs_that_burn'])
  })

  it('matches a slash path inside an id', () => {
    const out = filterTagCatalog(tags, 'ingots')
    expect(out.map((t) => t.id)).toEqual(['forge:ingots/iron'])
  })

  it('does not strip # prefixes from queries (tags are bare in the catalog)', () => {
    const out = filterTagCatalog(tags, '#minecraft')
    expect(out).toEqual([])
  })
})
