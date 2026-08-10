// JSON recipe import tests (was part of recipe-editor.test.ts).

import { describe, it, expect } from 'vitest'
import { importRecipeJson, parseRecipeJson } from './json-import'

describe('JSON import', () => {
  it('parses a vanilla shaped recipe (pre-1.20.5 item style)', () => {
    const r = parseRecipeJson({
      type: 'minecraft:crafting_shaped',
      pattern: ['A A', ' A ', 'A A'],
      key: { A: { item: 'minecraft:diamond' } },
      result: { item: 'minecraft:diamond_block', count: 1 },
    })
    expect(r?.recipe.type).toBe('shaped')
    expect(r?.recipe.pattern).toEqual(['A A', ' A ', 'A A'])
    expect(r?.recipe.key?.A).toEqual({ item: 'minecraft:diamond' })
    expect(r?.recipe.output.item).toBe('minecraft:diamond_block')
  })

  it('parses a 1.21 result/id object spellings', () => {
    const r = parseRecipeJson({
      type: 'minecraft:crafting_shapeless',
      ingredients: [{ id: 'minecraft:iron_ingot' }],
      result: { id: 'minecraft:iron_block', count: 9 },
    })
    expect(r?.recipe.type).toBe('shapeless')
    expect(r?.recipe.ingredients?.[0]).toEqual({ item: 'minecraft:iron_ingot' })
    expect(r?.recipe.output.count).toBe(9)
  })

  it('parses smelting with experience and cookingtime', () => {
    const r = parseRecipeJson({
      type: 'minecraft:smelting',
      ingredient: { item: 'minecraft:iron_ore' },
      result: { item: 'minecraft:iron_ingot' },
      experience: 0.7,
      cookingtime: 200,
    })
    expect(r?.recipe.type).toBe('smelting')
    expect(r?.recipe.experience).toBe(0.7)
    expect(r?.recipe.cookingTime).toBe(200)
  })

  it('parses smithing base/addition and drops template', () => {
    const r = parseRecipeJson({
      type: 'minecraft:smithing_transform',
      template: { item: 'minecraft:netherite_upgrade_smithing_template' },
      base: { item: 'minecraft:diamond_sword' },
      addition: { item: 'minecraft:netherite_ingot' },
      result: { item: 'minecraft:netherite_sword' },
    })
    expect(r?.recipe.type).toBe('smithing')
    expect(r?.recipe.ingredients).toHaveLength(2)
    expect(r?.recipe.ingredients?.[0].item).toBe('minecraft:diamond_sword')
    expect(r?.warnings.some((w) => w.includes('template'))).toBe(true)
  })

  it('parses tag-based ingredients', () => {
    const r = parseRecipeJson({
      type: 'minecraft:crafting_shaped',
      pattern: ['A'],
      key: { A: { tag: 'forge:ingots/iron' } },
      result: { item: 'minecraft:iron_ingot', count: 1 },
    })
    expect(r?.recipe.key?.A).toEqual({ item: 'forge:ingots/iron', tag: true })
  })

  it('handles a whole array of recipes and reports per-entry errors', () => {
    const res = importRecipeJson(JSON.stringify([
      { type: 'minecraft:crafting_shapeless', ingredients: [{ item: 'minecraft:dirt' }], result: { item: 'minecraft:stone' } },
      { type: 'unknown:mod_recipe', result: { item: 'x' } },
    ]))
    expect(res.recipes).toHaveLength(1)
    expect(res.errors).toHaveLength(1)
  })

  it('reports invalid JSON', () => {
    const res = importRecipeJson('this is not json')
    expect(res.recipes).toHaveLength(0)
    expect(res.errors[0].message).toContain('Invalid JSON')
  })
})
