// Specialized recipe slots (smelting/smithing/etc.) tests (was part of recipe-editor.test.ts).

import { describe, it, expect } from 'vitest'
import { validateRecipe, hasErrors } from './validation'
import { readSlot, writeSlot, slotsForType } from './specialized'
import type { Recipe } from './recipe-store'
import { ing, baseRecipe } from './recipe-editor.fixtures'

describe('specialized slots', () => {
  const smithing = (over: Partial<Recipe> = {}): Recipe =>
    baseRecipe({ type: 'smithing', pattern: undefined, key: undefined, ingredients: [], ...over })

  it('maps slot names per type', () => {
    expect(slotsForType('smithing')).toEqual(['base', 'addition'])
    expect(slotsForType('smelting')).toEqual(['input'])
    expect(slotsForType('shaped')).toEqual([])
  })

  it('reads and writes a furnace input slot', () => {
    const r = smithing({ type: 'smelting', ingredients: [] })
    expect(readSlot(r, 'input')).toBeUndefined()
    const next = writeSlot(r, 'input', ing('minecraft:iron_ore'))
    expect(next).toEqual([{ item: 'minecraft:iron_ore', tag: false }])
    expect(readSlot({ ...r, ingredients: next }, 'input')).toEqual({ item: 'minecraft:iron_ore', tag: false })
  })

  it('clearing the furnace input empties ingredients', () => {
    const r = smithing({ type: 'smelting', ingredients: [ing('minecraft:iron_ore')] })
    expect(writeSlot(r, 'input', null)).toEqual([])
  })

it('positions smithing base/addition stably', () => {
    const r = smithing()
    let next = writeSlot(r, 'base', ing('minecraft:iron_sword'))
    next = writeSlot({ ...r, ingredients: next }, 'addition', ing('minecraft:diamond'))
    expect(readSlot({ ...r, ingredients: next }, 'base')).toEqual({ item: 'minecraft:iron_sword', tag: false })
    expect(readSlot({ ...r, ingredients: next }, 'addition')).toEqual({ item: 'minecraft:diamond', tag: false })
  })

  it('overwriting a smithing slot keeps positions', () => {
    const r = smithing({ ingredients: [ing('minecraft:iron_sword'), ing('minecraft:diamond')] })
    const next = writeSlot(r, 'addition', ing('minecraft:emerald'))
    expect(readSlot({ ...r, ingredients: next }, 'base')).toEqual({ item: 'minecraft:iron_sword', tag: false })
    expect(readSlot({ ...r, ingredients: next }, 'addition')).toEqual({ item: 'minecraft:emerald', tag: false })
  })

  it('smelting emits negative cookingTime warning', () => {
    const r = smithing({ type: 'smelting', ingredients: [ing('minecraft:iron_ore')], cookingTime: 0 })
    expect(validateRecipe(r).some((i) => i.code === 'bad_time')).toBe(true)
  })

  it('smithing template is optional', () => {
    const r = smithing({ ingredients: [ing('minecraft:iron_sword'), ing('minecraft:diamond')] })
    expect(hasErrors(validateRecipe(r))).toBe(false)
  })
})
