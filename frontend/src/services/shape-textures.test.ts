import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { bakeShapeTile, tintTexture, parseHexColor } from './shape-textures'

/** jsdom has no real image decoder; stub `Image` so `loadImage` resolves with
 *  a fake element whose geometry we control. Canvas `getContext('2d')` is null
 *  in jsdom, which exercises the graceful canvas-unavailable fallback. */
class FakeImage {
  naturalWidth = 32
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

describe('parseHexColor', () => {
  it('parses 6-digit hex colors', () => {
    expect(parseHexColor('#5B9BD5')).toEqual({ r: 0x5b, g: 0x9b, b: 0xd5, a: 255 })
  })

  it('parses 8-digit hex colors with alpha', () => {
    expect(parseHexColor('96FFFFFF')).toEqual({ r: 0xff, g: 0xff, b: 0xff, a: 0x96 })
  })

  it('rejects non-hex colors', () => {
    expect(parseHexColor('var(--color-accent)')).toBeNull()
    expect(parseHexColor('notacolor')).toBeNull()
    expect(parseHexColor('')).toBeNull()
  })
})

describe('bakeShapeTile', () => {
  beforeEach(() => {
    vi.stubGlobal('Image', FakeImage)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns null when the canvas context is unavailable (graceful fallback)', async () => {
    const url = 'data:image/png;base64,AA=='
    const result = await bakeShapeTile({
      backgroundUrl: url,
      outlineUrl: url,
      size: 32,
    })
    expect(result).toBeNull()
  })

  it('rejects invalid sizes', async () => {
    const url = 'data:image/png;base64,AA=='
    const result = await bakeShapeTile({
      backgroundUrl: url,
      outlineUrl: url,
      size: 4,
    })
    expect(result).toBeNull()
  })
})

describe('tintTexture', () => {
  beforeEach(() => {
    vi.stubGlobal('Image', FakeImage)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns null for an unparseable color', async () => {
    const result = await tintTexture('data:image/png;base64,AA==', 'var(--color-accent)')
    expect(result).toBeNull()
  })

  it('returns null when the canvas context is unavailable', async () => {
    const result = await tintTexture('data:image/png;base64,AA==', '#5B9BD5')
    expect(result).toBeNull()
  })
})
