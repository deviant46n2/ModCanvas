import { it, expect } from 'vitest'
import { generateFtbHexId } from './quest-helpers'

// FTB ids must fit Long.parseLong(s, 16) — values > Long.MAX_VALUE throw, and
// FTB then registers the quest under a random id while dependencies resolve to
// 0 and are silently dropped (the s42 "no dependency lines" bug). The
// generator must always produce a positive, 16-char hex id.
it('generates ids FTB can parse (positive 16-hex)', () => {
  for (let i = 0; i < 500; i++) {
    const id = generateFtbHexId()
    expect(id).toMatch(/^[0-7][0-9A-F]{15}$/)
    const parsed = BigInt(`0x${id}`)
    expect(parsed).toBeLessThanOrEqual(BigInt('0x7FFFFFFFFFFFFFFF'))
    expect(parsed).toBeGreaterThan(0n)
  }
})
