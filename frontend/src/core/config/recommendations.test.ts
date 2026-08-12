import { describe, expect, it } from 'vitest'
import {
  CONFIG_RECOMMENDATIONS,
  recommendationFilePresent,
  searchRecommendations,
  type ConfigRecommendation,
} from './recommendations'

const FILES = [
  'config/server.properties',
  'config/ftbquests/quests/chapter1.snbt',
]

const rec = (over: Partial<ConfigRecommendation>): ConfigRecommendation => ({
  id: 'x',
  phrases: ['keep inventory'],
  file: 'server.properties',
  path: ['keepInventory'],
  value: { type: 'boolean', value: true },
  why: '',
  mod: 'vanilla',
  ...over,
})

describe('recommendation file presence', () => {
  it('matches the target file by case-insensitive substring', () => {
    expect(recommendationFilePresent(rec({ file: 'server.properties' }), FILES)).toBe(true)
    expect(recommendationFilePresent(rec({ file: 'SERVER.Properties' }), FILES)).toBe(true)
    expect(recommendationFilePresent(rec({ file: 'server.toml' }), FILES)).toBe(false)
  })
})

describe('searchRecommendations', () => {
  it('returns only recommendations whose file is present in the pack', () => {
    const ghost = rec({ id: 'ghost', file: 'nope.toml' })
    const out = searchRecommendations('keep inventory', FILES, [rec({}), ghost])
    expect(out.map((r) => r.id)).toEqual(['x'])
  })

  it('matches when every query token appears in a phrase', () => {
    // Query tokens [keep, inventory] are all contained in the phrase.
    const out = searchRecommendations('keep inventory', FILES, [rec({})])
    expect(out.map((r) => r.id)).toContain('x')
  })

  it('orders exact phrase matches above containment matches', () => {
    const exact = rec({ id: 'exact', phrases: ['keep inventory'] })
    const loose = rec({ id: 'loose', phrases: ['keep inventory in the chest on death'] })
    const out = searchRecommendations('keep inventory', FILES, [loose, exact])
    expect(out.map((r) => r.id)).toEqual(['exact', 'loose'])
  })

  it('returns nothing for empty query or no match', () => {
    expect(searchRecommendations('', FILES)).toEqual([])
    expect(searchRecommendations('zzz no such tweak', FILES)).toEqual([])
  })

  it('keeps the shipped list small and well-formed', () => {
    expect(CONFIG_RECOMMENDATIONS.length).toBeGreaterThanOrEqual(5)
    for (const r of CONFIG_RECOMMENDATIONS) {
      expect(r.id).toBeTruthy()
      expect(r.path.length).toBeGreaterThan(0)
      expect(r.phrases.length).toBeGreaterThan(0)
      expect(r.value.type).toMatch(/string|boolean|number|enum/)
    }
  })
})
