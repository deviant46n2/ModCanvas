// Validation tests for authored recipes (was part of recipe-editor.test.ts).

import { describe, it, expect } from 'vitest'
import { validateRecipe, hasErrors } from './validation'
import { ing, baseRecipe } from './recipe-editor.fixtures'

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
  it('does not warn on a null (Rust None) ingredient count', () => {
    // Loaded pack recipes serialize `count: Option` as null; absent counts are
    // valid, only an explicit out-of-range number warns.
    const r = baseRecipe({ pattern: ['A'], key: { A: { item: 'minecraft:stone', count: null, tag: false } } })
    expect(validateRecipe(r).some((i) => i.code === 'bad_count')).toBe(false)
  })
  it('warns when an explicit ingredient count is out of range', () => {
    const r = baseRecipe({ pattern: ['A'], key: { A: { item: 'minecraft:stone', count: 0, tag: false } } })
    expect(validateRecipe(r).some((i) => i.code === 'bad_count')).toBe(true)
    const r2 = baseRecipe({ pattern: ['A'], key: { A: { item: 'minecraft:stone', count: 65, tag: false } } })
    expect(validateRecipe(r2).some((i) => i.code === 'bad_count')).toBe(true)
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
