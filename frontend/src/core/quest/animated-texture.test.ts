import { describe, it, expect } from 'vitest'
import {
  parseAnimationMeta,
  frameGeometry,
  frameOrder,
  isSequentialOrder,
  frameDurationMs,
  rebuiltFrameCount,
  interpolatedSteps,
  needsStripRebuild,
} from './animated-texture'

describe('parseAnimationMeta', () => {
  it('returns null for empty or malformed input', () => {
    expect(parseAnimationMeta(null)).toBeNull()
    expect(parseAnimationMeta('')).toBeNull()
    expect(parseAnimationMeta('not json')).toBeNull()
    expect(parseAnimationMeta('{"no_animation":true}')).toBeNull()
    expect(parseAnimationMeta('{"animation": 42}')).toBeNull()
  })

  it('parses frametime, interpolate, frames and frameheight', () => {
    const meta = parseAnimationMeta(
      '{"animation":{"frametime":3,"interpolate":true,"frames":[0,2,1],"frameheight":16}}'
    )
    expect(meta).not.toBeNull()
    expect(meta!.frameTime).toBe(3)
    expect(meta!.interpolate).toBe(true)
    expect(meta!.frames).toEqual([0, 2, 1])
    expect(meta!.frameHeight).toBe(16)
  })

  it('defaults a bare animation object', () => {
    const meta = parseAnimationMeta('{"animation":{}}')
    expect(meta).not.toBeNull()
    expect(meta!.frameTime).toBeUndefined()
    expect(meta!.interpolate).toBeUndefined()
    expect(meta!.frames).toBeUndefined()
  })
})

describe('frameGeometry', () => {
  it('defaults frame height to texture width and counts rows', () => {
    const g = frameGeometry(16, 64, null)
    expect(g.frameWidth).toBe(16)
    expect(g.frameHeight).toBe(16)
    expect(g.count).toBe(4)
  })

  it('uses an explicit frameheight and/or frames length', () => {
    const g = frameGeometry(32, 128, parseAnimationMeta('{"animation":{"frameheight":16}}'))
    expect(g.frameHeight).toBe(16)
    expect(g.count).toBe(8)

    const g2 = frameGeometry(32, 128, parseAnimationMeta('{"animation":{"frames":[0,1,0]}}'))
    expect(g2.count).toBe(3)
  })
})

describe('frameOrder', () => {
  it('defaults to natural order', () => {
    const order = frameOrder(null, 4)
    expect(order).toEqual([0, 1, 2, 3])
    expect(isSequentialOrder(order)).toBe(true)
  })

  it('respects the frames array and clamps out-of-range refs', () => {
    const meta = parseAnimationMeta('{"animation":{"frames":[1,0,5,2,2]}}')
    const order = frameOrder(meta, 4)
    expect(order).toEqual([1, 0, 2])
    expect(isSequentialOrder(order)).toBe(false)
  })
})

describe('timing', () => {
  it('frameDurationMs honors frametime ticks vs interpolated 1-tick frames', () => {
    const meta = parseAnimationMeta('{"animation":{"frametime":2}}')
    expect(frameDurationMs(meta, false)).toBe(100)
    expect(frameDurationMs(meta, true)).toBe(50)
    expect(frameDurationMs(null, false)).toBe(50)
  })

  it('rebuiltFrameCount accounts for interpolation steps', () => {
    const plain = parseAnimationMeta('{"animation":{}}')
    expect(rebuiltFrameCount(plain, [0, 1, 2])).toBe(3)

    const meta = parseAnimationMeta('{"animation":{"frametime":4,"interpolate":true}}')
    expect(rebuiltFrameCount(meta, [0, 1, 2])).toBe(9)
  })

  it('interpolatedSteps blends consecutive display frames', () => {
    const meta = parseAnimationMeta('{"animation":{"frametime":2,"interpolate":true,"frames":[2,0]}}')
    const steps = interpolatedSteps(meta, [2, 0])
    expect(steps).toEqual([
      { from: 2, to: 0, t: 0.5 },
      { from: 2, to: 0, t: 1 },
    ])
  })

  it('needsStripRebuild is false for natural sequential order without interpolation', () => {
    expect(needsStripRebuild(null, [0, 1, 2])).toBe(false)
    expect(needsStripRebuild(parseAnimationMeta('{"animation":{"frametime":2}}'), [0, 1])).toBe(false)
    expect(needsStripRebuild(parseAnimationMeta('{"animation":{"frames":[1,0]}}'), [1, 0])).toBe(true)
    expect(needsStripRebuild(parseAnimationMeta('{"animation":{"interpolate":true}}'), [0, 1])).toBe(true)
  })
})
