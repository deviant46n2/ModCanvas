import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { prepareAnimatedSheet } from './sprite-sheet'
import type { AnimationMeta } from '../core/quest/animated-texture'

/** jsdom has no real image decoder; stub `Image` so `loadImage` resolves with
 *  a fake element whose geometry we control. Canvas `getContext('2d')` is null
 *  in jsdom, which exercises the graceful canvas-unavailable fallback. */
class FakeImage {
  naturalWidth = 16
  naturalHeight = 32
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  private _src = ''
  set src(v: string) {
    this._src = v
    this.onload?.()
  }
  get src() {
    return this._src
  }
}

describe('prepareAnimatedSheet', () => {
  beforeEach(() => {
    vi.stubGlobal('Image', FakeImage)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns null when there is no animation metadata', async () => {
    await expect(prepareAnimatedSheet('mock://plain', null)).resolves.toBeNull()
  })

  it('keeps the original URL for natural order without interpolation', async () => {
    const meta: AnimationMeta = { frameTime: 2 }
    const sheet = await prepareAnimatedSheet('mock://natural', meta)
    expect(sheet).toEqual({
      url: 'mock://natural',
      count: 2,
      frameHeight: 16,
      interpolated: false,
    })
  })

  it('returns a single frame when the sheet holds one display frame', async () => {
    const meta: AnimationMeta = { frameTime: 1, frames: [0] }
    const sheet = await prepareAnimatedSheet('mock://single', meta)
    expect(sheet).toEqual({
      url: 'mock://single',
      count: 1,
      frameHeight: 16,
      interpolated: false,
    })
  })

  it('resolves null (static fallback) when a canvas rebuild is required but unavailable', async () => {
    const meta: AnimationMeta = { frameTime: 2, frames: [1, 0] }
    await expect(prepareAnimatedSheet('mock://reorder', meta)).resolves.toBeNull()
  })

  it('resolves null (static fallback) when interpolation is requested but canvas is unavailable', async () => {
    const meta: AnimationMeta = { frameTime: 2, interpolate: true }
    await expect(prepareAnimatedSheet('mock://interp', meta)).resolves.toBeNull()
  })
})
