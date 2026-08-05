import { describe, it, expect } from 'vitest'
import { matchesFilter, groupByProvenance, isMine, isPack, isJars, type FilterState, type FilterDeps } from './filter'
import type { Recipe, RecipeIngredient } from './recipe-store'

const ing = (item: string, extra: Partial<RecipeIngredient> = {}): RecipeIngredient => ({
  item,
  tag: false,
  ...extra,
})

function baseRecipe(over: Partial<Recipe> = {}): Recipe {
  return {
    id: 'r1',
    type: 'shaped',
    name: 'Test Recipe',
    pattern: ['A'],
    key: { A: ing('minecraft:diamond') },
    ingredients: [],
    output: { item: 'minecraft:diamond_block', count: 1 },
    origin: 'authored',
    editable: true,
    disabled: false,
    ...over,
  }
}

const deps: FilterDeps = {
  isDisabled: () => false,
  getTagMembers: (tag) => (tag === 'forge:ingots/iron' ? ['minecraft:iron_ingot'] : []),
  modItemIds: (mod) => (mod === 'adventure' ? new Set(['adventure:shield']) : new Set()),
  hasIssues: () => false,
}

const all: FilterState = {
  query: '',
  ownership: 'all',
  status: 'all',
  attention: false,
  changed: false,
  type: 'all',
}

describe('matchesFilter — provenance grouping', () => {
  const mine = baseRecipe({ origin: 'authored' })
  const pack = baseRecipe({ origin: 'kubejs', editable: true })
  const jar = baseRecipe({ origin: 'vanilla', editable: false })

  it('groups recipes into Mine / Pack / Jars', () => {
    expect(isMine(mine)).toBe(true)
    expect(isPack(pack)).toBe(true)
    expect(isJars(jar)).toBe(true)
    const g = groupByProvenance([mine, pack, jar])
    expect(g.mine).toEqual([mine])
    expect(g.pack).toEqual([pack])
    expect(g.jars).toEqual([jar])
  })

  it('ownership filter narrows each dim', () => {
    expect(matchesFilter(mine, { ...all, ownership: 'mine' }, deps)).toBe(true)
    expect(matchesFilter(pack, { ...all, ownership: 'mine' }, deps)).toBe(false)
    expect(matchesFilter(jar, { ...all, ownership: 'jars' }, deps)).toBe(true)
    expect(matchesFilter(mine, { ...all, ownership: 'jars' }, deps)).toBe(false)
    expect(matchesFilter(pack, { ...all, ownership: 'pack' }, deps)).toBe(true)
    expect(matchesFilter(jar, { ...all, ownership: 'pack' }, deps)).toBe(false)
  })
})

describe('matchesFilter — JEI grammar tokens', () => {
  const shaped = baseRecipe({
    key: { A: ing('minecraft:diamond') },
    output: { item: 'minecraft:diamond_block', count: 1 },
  })
  const tagRecipe = baseRecipe({
    origin: 'kubejs',
    type: 'shapeless',
    key: undefined,
    ingredients: [{ item: 'forge:ingots/iron', tag: true }, ing('minecraft:stick')],
    output: { item: 'minecraft:iron_sword', count: 1 },
  })

  it('matches > output substring', () => {
    expect(matchesFilter(shaped, { ...all, query: '>diamond_bloc' }, deps)).toBe(true)
    expect(matchesFilter(shaped, { ...all, query: '>iron' }, deps)).toBe(false)
  })

  it('matches < ingredient substring', () => {
    expect(matchesFilter(shaped, { ...all, query: '<diamond' }, deps)).toBe(true)
    expect(matchesFilter(shaped, { ...all, query: '<stick' }, deps)).toBe(false)
  })

  it('matches < against tags stripped of #', () => {
    expect(matchesFilter(tagRecipe, { ...all, query: '<ingots/iron' }, deps)).toBe(true)
    expect(matchesFilter(tagRecipe, { ...all, query: '<iron_ingot' }, deps)).toBe(false)
  })

  it('matches #tag against ingredient tags', () => {
    expect(matchesFilter(tagRecipe, { ...all, query: '#ingots/iron' }, deps)).toBe(true)
    expect(matchesFilter(tagRecipe, { ...all, query: '#forge:ingots' }, deps)).toBe(true)
    expect(matchesFilter(tagRecipe, { ...all, query: '#c:planks' }, deps)).toBe(false)
  })

  it('matches @mod by namespace', () => {
    expect(matchesFilter(shaped, { ...all, query: '@minecraft' }, deps)).toBe(true)
    expect(matchesFilter(shaped, { ...all, query: '@othermod' }, deps)).toBe(false)
  })

  it('matches @mod via the registry mod → item ids', () => {
    const adventureRecipe = baseRecipe({ ingredients: [ing('adventure:shield')], key: undefined, pattern: undefined, type: 'shapeless' })
    expect(matchesFilter(adventureRecipe, { ...all, query: '@adventure' }, deps)).toBe(true)
    expect(matchesFilter(shaped, { ...all, query: '@adventure' }, deps)).toBe(false)
  })

  it('bare text matches name/output/group/type/ingredient', () => {
    expect(matchesFilter(shaped, { ...all, query: 'diamond_block' }, deps)).toBe(true)
    expect(matchesFilter(shaped, { ...all, query: 'Test' }, deps)).toBe(true)
    expect(matchesFilter(shaped, { ...all, query: 'shaped' }, deps)).toBe(true)
    expect(matchesFilter(baseRecipe({ group: 'crafting-adv' }), { ...all, query: 'crafting-adv' }, deps)).toBe(true)
    expect(matchesFilter(shaped, { ...all, query: 'bogus' }, deps)).toBe(false)
  })

  it('bare text expands through tags', () => {
    // forge:ingots/iron expands to minecraft:iron_ingot
    expect(matchesFilter(tagRecipe, { ...all, query: 'iron_ingot' }, deps)).toBe(true)
  })

  it('AND-combines tokens', () => {
    expect(matchesFilter(tagRecipe, { ...all, query: '>iron_sword #forge:ingots' }, deps)).toBe(true)
    expect(matchesFilter(tagRecipe, { ...all, query: '>iron_sword #c:planks' }, deps)).toBe(false)
  })
})

describe('matchesFilter — status, attention, changed, type', () => {
  it('status disabled/enabled via isDisabled', () => {
    const r = baseRecipe()
    expect(matchesFilter(r, { ...all, status: 'enabled' }, deps)).toBe(true)
    expect(matchesFilter(r, { ...all, status: 'disabled' }, deps)).toBe(false)
    const disabledDeps = { ...deps, isDisabled: () => true }
    expect(matchesFilter(r, { ...all, status: 'disabled' }, disabledDeps)).toBe(true)
    expect(matchesFilter(r, { ...all, status: 'enabled' }, disabledDeps)).toBe(false)
  })

  it('attention requires issues', () => {
    const r = baseRecipe()
    expect(matchesFilter(r, { ...all, attention: true }, deps)).toBe(false)
    const issueDeps = { ...deps, hasIssues: () => true }
    expect(matchesFilter(r, { ...all, attention: true }, issueDeps)).toBe(true)
  })

  it('changed requires authored + modified', () => {
    const authored = baseRecipe({ origin: 'authored', modified: true })
    const cleanAuthored = baseRecipe({ origin: 'authored', modified: false })
    const pack = baseRecipe({ origin: 'kubejs', editable: true, modified: true })
    expect(matchesFilter(authored, { ...all, changed: true }, deps)).toBe(true)
    expect(matchesFilter(cleanAuthored, { ...all, changed: true }, deps)).toBe(false)
    expect(matchesFilter(pack, { ...all, changed: true }, deps)).toBe(false)
  })

  it('type filter narrows by recipe type', () => {
    const smelt = baseRecipe({ type: 'smelting', ingredients: [ing('minecraft:ore')], key: undefined, pattern: undefined })
    expect(matchesFilter(smelt, { ...all, type: 'smelting' }, deps)).toBe(true)
    expect(matchesFilter(smelt, { ...all, type: 'shaped' }, deps)).toBe(false)
  })
})
