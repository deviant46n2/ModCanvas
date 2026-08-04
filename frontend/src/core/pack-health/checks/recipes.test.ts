import { describe, it, expect } from 'vitest'
import { checkRecipes } from './recipes'
import type { Recipe } from '../../recipe/recipe-store'

const good: Recipe = {
  id: 'r1',
  type: 'shaped',
  name: 'Good',
  pattern: ['AAA', 'AAA', 'AAA'],
  key: { A: { item: 'minecraft:dirt' } },
  output: { item: 'minecraft:diamond', count: 1 },
  origin: 'authored',
}

describe('checkRecipes', () => {
  it('returns no findings for a valid authored recipe', () => {
    expect(checkRecipes([good])).toEqual([])
  })

  it('flags an erroring authored recipe as blocking', () => {
    const bad: Recipe = { ...good, id: 'r2', pattern: [], key: {} }
    const items = checkRecipes([bad])
    expect(items).toHaveLength(1)
    expect(items[0].severity).toBe('blocking')
    expect(items[0].message).toContain('Good')
  })

  it('skips discovered recipes (vanilla / kubejs / crafttweaker)', () => {
    const bad: Recipe = { ...good, id: 'r3', origin: 'vanilla', pattern: [], key: {} }
    const kube: Recipe = { ...good, id: 'r4', origin: 'kubejs', pattern: [], key: {} }
    expect(checkRecipes([bad, kube])).toEqual([])
  })

  it('flags warnings as recommended, never blocking', () => {
    const warn: Recipe = {
      ...good,
      id: 'r5',
      pattern: ['AAA'],
      key: { A: { item: 'minecraft:dirt' }, B: { item: 'minecraft:stone' } },
    }
    const items = checkRecipes([warn])
    expect(items).toHaveLength(1)
    expect(items[0].severity).toBe('recommended')
    expect(items[0].copyText).toContain('r5')
  })
})
