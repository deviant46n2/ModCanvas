import { describe, it, expect } from 'vitest'
import { argbAlpha } from './theme-color'

describe('argbAlpha', () => {
  it('reads the alpha of the default theme background tint (#DCFFFFFF ≈ 86%)', () => {
    expect(argbAlpha('#DCFFFFFF')).toBeCloseTo(0.8627, 3)
  })

  it('reads the alpha of the widget background strip (#44000000 ≈ 27%)', () => {
    expect(argbAlpha('#44000000')).toBeCloseTo(0.2667, 3)
  })

  it('is opaque for #FF-prefixed colors', () => {
    expect(argbAlpha('#FF1B1D1E')).toBe(1)
  })

  it('rejects non-8-digit hex and garbage', () => {
    expect(argbAlpha('#FFF')).toBeNull()
    expect(argbAlpha('DCFFFFFF')).toBeNull()
    expect(argbAlpha('')).toBeNull()
    expect(argbAlpha('{{widget_border}}')).toBeNull()
  })
})