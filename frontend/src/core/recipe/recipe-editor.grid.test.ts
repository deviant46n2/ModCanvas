// Grid conversion + shapeless layout tests (was part of recipe-editor.test.ts).

import { describe, it, expect } from 'vitest'
import { patternToGrid, gridToPattern, ingredientsToGrid, gridToIngredients } from './grid'
import { ing, baseRecipe } from './recipe-editor.fixtures'

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

describe('shapeless grid layout', () => {
  it('lays ingredients out 3-wide row-major', () => {
    const ings = [ing('a'), ing('b'), ing('c'), ing('d')]
    const grid = ingredientsToGrid(ings)
    expect(grid).toHaveLength(3)
    expect(grid[0].map((c) => c?.item)).toEqual(['a', 'b', 'c'])
    expect(grid[1].map((c) => (c ? c.item : null))).toEqual(['d', null, null])
    expect(grid[2]).toEqual([null, null, null])
  })

  it('preserves counts and tags round-trip', () => {
    const ings = [
      { item: 'minecraft:iron', count: 4, tag: false },
      { item: 'forge:ingots/iron', tag: true },
    ]
    expect(gridToIngredients(ingredientsToGrid(ings))).toEqual(ings)
  })

  it('collapses nulls back to a flat list in order', () => {
    const grid = [
      [{ item: 'a', tag: false }, null, { item: 'b', tag: false }],
      [null, { item: 'c', count: 2, tag: false }, null],
      [null, null, null],
    ]
    const out = gridToIngredients(grid)
    expect(out.map((c) => c.item)).toEqual(['a', 'b', 'c'])
    expect(out[2].count).toBe(2)
  })

  it('returns an empty 3x3 for no ingredients', () => {
    const grid = ingredientsToGrid([])
    expect(grid.map((r) => r.length)).toEqual([3, 3, 3])
    expect(grid.flat()).toEqual([null, null, null, null, null, null, null, null, null])
  })
})
