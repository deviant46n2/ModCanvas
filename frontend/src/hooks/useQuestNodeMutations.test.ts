import { describe, it, expect } from 'vitest'
import { cascadePosition } from './useQuestNodeMutations'

describe('cascadePosition (s49 multi-add)', () => {
  it('places every quest in a batch at a distinct position', () => {
    const base = { x: 10, y: 5 }
    const positions = Array.from({ length: 10 }, (_, i) => cascadePosition(base, i))
    const unique = new Set(positions.map((p) => `${p.x},${p.y}`))
    expect(unique.size).toBe(10)
  })

  it('cascades along x with an alternating y offset', () => {
    expect(cascadePosition({ x: 0, y: 0 }, 0)).toEqual({ x: 0, y: 0 })
    expect(cascadePosition({ x: 0, y: 0 }, 1)).toEqual({ x: 2, y: 1 })
    expect(cascadePosition({ x: 0, y: 0 }, 2)).toEqual({ x: 4, y: 0 })
    expect(cascadePosition({ x: 0, y: 0 }, 3)).toEqual({ x: 6, y: 1 })
  })

  it('keeps the base position for the first quest (spawn where clicked)', () => {
    const base = { x: 42, y: -7 }
    expect(cascadePosition(base, 0)).toEqual(base)
  })
})
