import { describe, it, expect } from 'vitest'
import { validateRecipe, hasErrors } from './validation'
import { patternToGrid, gridToPattern } from './grid'
import { normalizeLoader } from './loader'
import { readSlot, writeSlot, slotsForType } from './specialized'
import { importRecipeJson, parseRecipeJson } from './json-import'
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
    name: 'Test',
    pattern: ['A A', ' A ', 'A A'],
    key: { A: ing('minecraft:diamond') },
    ingredients: [],
    output: { item: 'minecraft:diamond_block', count: 1 },
    ...over,
  }
}

describe('validateRecipe', () => {
  it('passes a valid shaped recipe', () => {
    expect(validateRecipe(baseRecipe())).toEqual([])
  })
  it('flags unbound pattern keys', () => {
    const r = baseRecipe({ pattern: ['AB'], key: { A: ing('minecraft:stone') } })
    const issues = validateRecipe(r)
    expect(issues.some((i) => i.code === 'unbound_key')).toBe(true)
  })
  it('flags unused keys as warnings', () => {
    const r = baseRecipe({ pattern: ['A'], key: { A: ing('minecraft:stone'), B: ing('minecraft:dirt') } })
    expect(hasErrors(validateRecipe(r))).toBe(false)
    expect(validateRecipe(r).some((i) => i.code === 'unused_key')).toBe(true)
  })
  it('flags empty output', () => {
    const r = baseRecipe({ output: { item: '', count: 1 } })
    const issues = validateRecipe(r)
    expect(hasErrors(issues)).toBe(true)
    expect(issues.some((i) => i.code === 'empty_output')).toBe(true)
  })
  it('flags invalid item ids and bad tags', () => {
    const r = baseRecipe({ pattern: ['A'], key: { A: ing('not valid id') } })
    expect(hasErrors(validateRecipe(r))).toBe(true)
    const r2 = baseRecipe({ pattern: ['A'], key: { A: { item: 'not a tag either', tag: true } } })
    expect(hasErrors(validateRecipe(r2))).toBe(true)
  })
  it('flags ragged patterns', () => {
    const r = baseRecipe({ pattern: ['AA', 'B'] })
    expect(validateRecipe(r).some((i) => i.code === 'ragged_pattern')).toBe(true)
  })
  it('flags shapeless with no ingredients', () => {
    const r = baseRecipe({ type: 'shapeless', pattern: undefined, key: undefined })
    expect(validateRecipe(r).some((i) => i.code === 'empty_shapeless')).toBe(true)
  })
  it('flags smithing missing second ingredient', () => {
    const r = baseRecipe({
      type: 'smithing',
      pattern: undefined,
      key: undefined,
      ingredients: [ing('minecraft:diamond')],
    })
    expect(validateRecipe(r).some((i) => i.code === 'missing_ingredient')).toBe(true)
  })
})

describe('grid conversions', () => {
  it('patternToGrid fills key-bound letters and nulls spaces', () => {
    const grid = patternToGrid(['A A'], { A: ing('minecraft:diamond') })
    expect(grid[0].length).toBe(3)
    expect(grid[0][0]!.item).toBe('minecraft:diamond')
    expect(grid[0][1]).toBeNull()
  })
  it('round-trips through gridToPattern preserving letters', () => {
    const recipe = baseRecipe()
    const grid = patternToGrid(recipe.pattern!, recipe.key!)
    const { pattern, key } = gridToPattern(grid, recipe.key!)
    expect(pattern).toEqual(recipe.pattern)
    expect(key).toEqual({ A: recipe.key!.A })
  })
  it('allocates fresh letters for new ingredients', () => {
    const grid = [
      [ing('minecraft:stone'), null],
      [null, ing('minecraft:dirt')],
    ]
    const { pattern, key } = gridToPattern(grid, {})
    expect(Object.keys(key).length).toBe(2)
    expect(pattern[0][0]).not.toBe(' ')
    expect(pattern[0][0]).not.toBe(pattern[1][1])
  })
})

describe('normalizeLoader', () => {
  it('maps common spellings to LoaderType', () => {
    expect(normalizeLoader('NeoForge')).toBe('neoforge')
    expect(normalizeLoader('neoforge')).toBe('neoforge')
    expect(normalizeLoader('Forge')).toBe('forge')
    expect(normalizeLoader('Fabric')).toBe('fabric')
    expect(normalizeLoader('Quilt')).toBe('quilt')
  })
  it('falls back to neoforge for unknown/empty', () => {
    expect(normalizeLoader('')).toBe('neoforge')
    expect(normalizeLoader(null)).toBe('neoforge')
    expect(normalizeLoader('Paper')).toBe('neoforge')
  })
})

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