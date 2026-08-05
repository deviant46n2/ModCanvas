import { describe, it, expect } from 'vitest'
import {
  refKey,
  refMatches,
  recipeHasIngredient,
  affectedRecipeIds,
  replaceIngredient,
} from './bulk-replace'
import type { Recipe, RecipeIngredient } from './recipe-store'

const item = (item: string, extra: Partial<RecipeIngredient> = {}): RecipeIngredient => ({
  item,
  tag: false,
  ...extra,
})

function shaped(over: Partial<Recipe> = {}): Recipe {
  return {
    id: 's',
    type: 'shaped',
    name: 'Shaped',
    pattern: ['A'],
    key: { A: item('minecraft:diamond') },
    ingredients: [],
    output: { item: 'minecraft:block', count: 1 },
    origin: 'authored',
    ...over,
  }
}

function shapeless(over: Partial<Recipe> = {}): Recipe {
  return {
    id: 'l',
    type: 'shapeless',
    name: 'Shapeless',
    pattern: undefined,
    key: undefined,
    ingredients: [item('minecraft:diamond'), item('minecraft:stick')],
    output: { item: 'minecraft:pickaxe', count: 1 },
    origin: 'authored',
    ...over,
  }
}

describe('ref helpers', () => {
  it('refKey renders items and tags distinctly', () => {
    expect(refKey({ item: 'minecraft:diamond', tag: false })).toBe('minecraft:diamond')
    expect(refKey({ item: '#forge:ingots/iron', tag: true })).toBe('#forge:ingots/iron')
    expect(refKey({ item: 'forge:ingots/iron', tag: true })).toBe('#forge:ingots/iron')
  })

  it('refMatches compares tag-ness + stripped id', () => {
    expect(refMatches({ item: 'minecraft:diamond', tag: false }, item('minecraft:diamond'))).toBe(true)
    expect(refMatches({ item: 'minecraft:diamond', tag: false }, { item: 'minecraft:diamond', tag: true })).toBe(false)
    expect(refMatches({ item: 'forge:ingots/iron', tag: true }, { item: '#forge:ingots/iron', tag: true })).toBe(true)
    expect(refMatches({ item: 'minecraft:diamond', tag: false }, item('minecraft:stick'))).toBe(false)
    expect(refMatches({ item: 'minecraft:diamond', tag: false }, undefined)).toBe(false)
  })
})

describe('recipeHasIngredient', () => {
  it('finds items in shapeless ingredients and shaped key values', () => {
    expect(recipeHasIngredient(shapeless(), { item: 'minecraft:diamond', tag: false })).toBe(true)
    expect(recipeHasIngredient(shaped(), { item: 'minecraft:diamond', tag: false })).toBe(true)
    expect(recipeHasIngredient(shaped(), { item: 'minecraft:stick', tag: false })).toBe(false)
  })

  it('finds tags', () => {
    const r = shapeless({ ingredients: [{ item: '#forge:ingots/iron', tag: true }, item('minecraft:stick')] })
    expect(recipeHasIngredient(r, { item: 'forge:ingots/iron', tag: true })).toBe(true)
  })
})

describe('affectedRecipeIds', () => {
  it('only reports selected recipes that use from', () => {
    const a = shapeless({ id: 'a', ingredients: [item('minecraft:diamond')] })
    const b = shapeless({ id: 'b', ingredients: [item('minecraft:stick')] })
    const c = shaped({ id: 'c', key: { A: item('minecraft:diamond') } })
    const out = affectedRecipeIds(
      [a, b, c],
      ['a', 'b', 'c'],
      { item: 'minecraft:diamond', tag: false },
    )
    expect(out.sort()).toEqual(['a', 'c'])
  })

  it('respects the selected subset', () => {
    const a = shapeless({ id: 'a', ingredients: [item('minecraft:diamond')] })
    const out = affectedRecipeIds([a], [], { item: 'minecraft:diamond', tag: false })
    expect(out).toEqual([])
  })
})

describe('replaceIngredient', () => {
  it('replaces every occurrence in shapeless ingredients', () => {
    const r = shapeless({ ingredients: [item('minecraft:diamond'), item('minecraft:diamond'), item('minecraft:stick')] })
    const next = replaceIngredient(r, { item: 'minecraft:diamond', tag: false }, { item: 'minecraft:emerald', tag: false })
    expect(next.ingredients).toEqual([item('minecraft:emerald'), item('minecraft:emerald'), item('minecraft:stick')])
    expect(next.key).toBeUndefined()
  })

  it('replaces shaped key values and leaves pattern untouched', () => {
    const r = shaped({ key: { A: item('minecraft:diamond'), B: item('minecraft:stick') } })
    const next = replaceIngredient(r, { item: 'minecraft:diamond', tag: false }, { item: 'minecraft:emerald', tag: false })
    expect(next.key).toEqual({ A: item('minecraft:emerald'), B: item('minecraft:stick') })
    expect(next.pattern).toBeUndefined()
  })

  it('replaces items with tags', () => {
    const r = shaped({ key: { A: item('minecraft:diamond') } })
    const next = replaceIngredient(r, { item: 'minecraft:diamond', tag: false }, { item: 'forge:gems/emerald', tag: true })
    expect(next.key?.A).toEqual({ item: 'forge:gems/emerald', tag: true })
  })

  it('no-ops when from is not present', () => {
    const r = shaped({ key: { A: item('minecraft:stick') } })
    const next = replaceIngredient(r, { item: 'minecraft:diamond', tag: false }, { item: 'minecraft:emerald', tag: false })
    expect(next.key).toEqual({ A: item('minecraft:stick') })
  })
})
