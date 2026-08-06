import { describe, it, expect } from 'vitest'
import type { Node } from '@xyflow/react'
import { computePhaseBands, phaseColor, PHASE_COLORS, hexToRgba, nodeTypeColor } from './phase-bands'

function node(id: string, phase: string | undefined, x: number, y: number): Node {
  return { id, position: { x, y }, data: { phase } } as Node
}

describe('computePhaseBands', () => {
  it('groups nodes by phase and returns one lane per phase', () => {
    const bands = computePhaseBands([
      node('a', 'The Story', 0, 60),
      node('b', 'The Story', 0, 200),
      node('c', 'The Nether', 520, 60),
    ])
    expect(bands).toHaveLength(2)
    const story = bands.find((b) => b.phase === 'The Story')
    expect(story).toBeDefined()
    expect(story!.x).toBeLessThanOrEqual(0) // left padding
    expect(story!.width).toBeGreaterThanOrEqual(220)
  })

  it('skips nodes without a phase', () => {
    const bands = computePhaseBands([node('x', undefined, 0, 0), node('y', 'Adventure', 10, 10)])
    expect(bands).toHaveLength(1)
    expect(bands[0].phase).toBe('Adventure')
  })

  it('accounts for node width when spanning a column', () => {
    const bands = computePhaseBands([node('a', 'The Story', 0, 60)])
    // right edge must cover position.x + node width, plus right padding
    expect(bands[0].width).toBeGreaterThanOrEqual(176 + 28 * 2)
  })

  it('gives a single isolated node a minimum-width lane', () => {
    const bands = computePhaseBands([node('a', 'Husbandry', 2080, 60)])
    expect(bands[0].width).toBeGreaterThanOrEqual(220)
  })

  it('is deterministic: same nodes → same bands', () => {
    const input = [node('a', 'The End', 1040, 60), node('b', 'The End', 1040, 200)]
    expect(computePhaseBands(input)).toEqual(computePhaseBands(input))
  })
})

describe('phaseColor', () => {
  it('always returns a palette color', () => {
    for (const phase of ['The Story', 'The Nether', 'The End', 'Adventure', 'Husbandry', 'Custom Phase', '']) {
      expect(PHASE_COLORS).toContain(phaseColor(phase))
    }
  })

  it('is stable across calls', () => {
    expect(phaseColor('The Story')).toBe(phaseColor('The Story'))
  })
})

describe('hexToRgba', () => {
  it('converts hex to rgba with the given alpha', () => {
    expect(hexToRgba('#3b82f6', 0.06)).toBe('rgba(59, 130, 246, 0.06)')
  })
})

describe('nodeTypeColor', () => {
  it('falls back to the default color for unknown types', () => {
    expect(nodeTypeColor('unknown')).toBe('#6b7280')
    expect(nodeTypeColor(undefined)).toBe('#6b7280')
  })
})
