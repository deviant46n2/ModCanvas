// Loader normalization tests (was part of recipe-editor.test.ts).

import { describe, it, expect } from 'vitest'
import { normalizeLoader } from './loader'

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
