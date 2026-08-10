// selectSaveableRecipes tests (was part of recipe-editor.test.ts).

import { describe, it, expect } from 'vitest'
import { selectSaveableRecipes } from './validation'
import { ing, baseRecipe } from './recipe-editor.fixtures'

describe('selectSaveableRecipes', () => {
  it('keeps only authored recipes with an output item and no blocking errors', () => {
    const authored = baseRecipe({ origin: 'authored' })
    const emptyOutput = baseRecipe({ origin: 'authored', output: { item: '', count: 1 } })
    const broken = baseRecipe({ origin: 'authored', pattern: ['AA', 'B'] })
    const discovered = baseRecipe({ origin: 'vanilla' })
    const kubejs = baseRecipe({ origin: 'kubejs' })
    const out = selectSaveableRecipes([authored, emptyOutput, broken, discovered, kubejs])
    expect(out.map((r) => r.name)).toEqual(['Test'])
  })

  it('excludes disabled authored recipes', () => {
    const enabled = baseRecipe({ origin: 'authored', disabled: false })
    const disabled = baseRecipe({ origin: 'authored', disabled: true, name: 'off' })
    const out = selectSaveableRecipes([enabled, disabled])
    expect(out.map((r) => r.name)).toEqual(['Test'])
  })

  it('keeps recipes with only warnings', () => {
    const warnOnly = baseRecipe({
      origin: 'authored',
      pattern: ['A'],
      key: { A: ing('minecraft:stone'), B: ing('minecraft:dirt') },
    })
    expect(selectSaveableRecipes([warnOnly])).toHaveLength(1)
  })
})
