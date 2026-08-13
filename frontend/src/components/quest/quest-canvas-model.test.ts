import { describe, it, expect } from 'vitest'
import { flowToGridPos } from './quest-canvas-model'

describe('flowToGridPos (s49-followup shared spawn mapping)', () => {
  it('maps the pane center (flow px) to grid cells, node-center anchored', () => {
    // NODE_BASE_PX=36 half-offset and GRID_SCALE=42: flow (18,18) is grid (0,0).
    expect(flowToGridPos({ x: 18, y: 18 })).toEqual({ x: 0, y: 0 })
    expect(flowToGridPos({ x: 18 + 42, y: 18 })).toEqual({ x: 1, y: 0 })
    expect(flowToGridPos({ x: 18 + 84, y: 18 + 42 })).toEqual({ x: 2, y: 1 })
  })

  it('rounds nothing — exact grid math so spawn lands on the cursor point', () => {
    expect(flowToGridPos({ x: 438, y: 438 })).toEqual({ x: 10, y: 10 })
  })
})
