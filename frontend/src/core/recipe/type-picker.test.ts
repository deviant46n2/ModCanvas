import { describe, it, expect } from 'vitest'
import { typeSwitchDiscards, typeSwitchConfirmMessage, TYPE_OPTIONS, TYPE_LABELS } from './type-picker'

describe('typeSwitchDiscards', () => {
  it('confirms crafting → non-crafting switches', () => {
    expect(typeSwitchDiscards('shaped', 'smelting')).toBe(true)
    expect(typeSwitchDiscards('shaped', 'blasting')).toBe(true)
    expect(typeSwitchDiscards('shapeless', 'smoking')).toBe(true)
    expect(typeSwitchDiscards('shapeless', 'campfire')).toBe(true)
    expect(typeSwitchDiscards('shaped', 'stonecutting')).toBe(true)
    expect(typeSwitchDiscards('shapeless', 'smithing')).toBe(true)
  })

  it('does not confirm crafting ↔ crafting', () => {
    expect(typeSwitchDiscards('shaped', 'shapeless')).toBe(false)
    expect(typeSwitchDiscards('shapeless', 'shaped')).toBe(false)
    expect(typeSwitchDiscards('shaped', 'shaped')).toBe(false)
  })

  it('does not confirm furnace-family ↔ stonecutting/smithing swaps', () => {
    expect(typeSwitchDiscards('smelting', 'stonecutting')).toBe(false)
    expect(typeSwitchDiscards('stonecutting', 'smelting')).toBe(false)
    expect(typeSwitchDiscards('smelting', 'smithing')).toBe(false)
    expect(typeSwitchDiscards('smithing', 'campfire')).toBe(false)
    expect(typeSwitchDiscards('blasting', 'smoking')).toBe(false)
  })
})

describe('typeSwitchConfirmMessage', () => {
  it('mentions the target label and what is kept', () => {
    expect(typeSwitchConfirmMessage('smelting')).toContain('Smelting')
    expect(typeSwitchConfirmMessage('smelting')).toContain('only the first ingredient')
    expect(typeSwitchConfirmMessage('smithing')).toContain('the first two ingredients')
    expect(typeSwitchConfirmMessage('stonecutting')).toContain('Stonecutting')
  })
})

describe('type card metadata', () => {
  it('covers every recipe type exactly once', () => {
    expect(TYPE_OPTIONS.map((o) => o.type)).toEqual(Object.keys(TYPE_LABELS))
  })
})
