import { describe, it, expect, beforeEach } from 'vitest'
import {
  SLOT_DRAG_MIME,
  SLOT_DRAG_TEXT_MIME,
  setDragPayload,
  clearDragPayload,
  readDragPayload,
  parsePayload,
  recipeIngredientFromPayload,
  type SlotDragPayload,
} from './dnd'

function writeTarget() {
  const written = new Map<string, string>()
  const dt = {
    setData: (t: string, d: string) => void written.set(t, d),
    effectAllowed: '',
  }
  return { written, dt }
}

const payload: SlotDragPayload = { item: 'minecraft:iron_ingot', name: 'Iron Ingot' }

beforeEach(() => {
  clearDragPayload()
})

describe('setDragPayload / readDragPayload', () => {
  it('writes to the custom MIME and reads it back first', () => {
    const { written, dt } = writeTarget()
    setDragPayload(dt, payload)
    expect(written.get(SLOT_DRAG_MIME)).toBe(JSON.stringify(payload))
    expect(readDragPayload({ getData: (t) => written.get(t) ?? '' })).toEqual(payload)
  })

  it('falls back to text/plain when the custom MIME is stripped', () => {
    const { written, dt } = writeTarget()
    setDragPayload(dt, payload)
    // Simulate webkit2gtk: custom MIME returns empty, text/plain survives.
    const read = readDragPayload({
      getData: (t) => (t === SLOT_DRAG_TEXT_MIME ? written.get(t) ?? '' : ''),
    })
    expect(read).toEqual(payload)
  })

  it('falls back to the module stash when dataTransfer yields nothing', () => {
    const { dt } = writeTarget()
    setDragPayload(dt, payload)
    expect(readDragPayload({ getData: () => '' })).toEqual(payload)
  })

  it('clears the stash on clearDragPayload', () => {
    const { dt } = writeTarget()
    setDragPayload(dt, payload)
    clearDragPayload()
    expect(readDragPayload({ getData: () => '' })).toBeNull()
  })

  it('still stashes when dataTransfer is missing', () => {
    setDragPayload(undefined, payload)
    expect(readDragPayload({ getData: () => '' })).toEqual(payload)
  })
})

describe('parsePayload / recipeIngredientFromPayload', () => {
  it('rejects empty or malformed payloads', () => {
    expect(parsePayload('')).toBeNull()
    expect(parsePayload('not json')).toBeNull()
    expect(parsePayload(undefined)).toBeNull()
  })

  it('turns an item payload into a plain ingredient', () => {
    expect(recipeIngredientFromPayload({ item: 'minecraft:iron_ingot', name: 'Iron' })).toEqual({
      item: 'minecraft:iron_ingot',
      tag: false,
    })
  })

  it('turns a tag payload into a tagged ingredient', () => {
    expect(
      recipeIngredientFromPayload({ item: '#forge:ingots/iron', name: 'forge:ingots/iron', tag: true })
    ).toEqual({ item: '#forge:ingots/iron', tag: true })
  })
})
