import { describe, expect, it } from 'vitest'
import {
  TYPED_CONDITIONS,
  conditionFieldValue,
  editConditionField,
  newConditionValue,
  typedConditionFor,
} from './conditions'

describe('loot typed conditions', () => {
  it('resolves typed forms by condition id and marks others opaque', () => {
    expect(typedConditionFor({ condition: 'minecraft:survives_explosion' })?.id).toBe(
      'minecraft:survives_explosion',
    )
    expect(typedConditionFor({ condition: 'minecraft:random_chance', chance: 0.5 })?.label).toBe(
      'Random chance',
    )
    expect(typedConditionFor({ condition: 'minecraft:some_unknown_thing' })).toBeNull()
    expect(typedConditionFor({ not_a_condition: true })).toBeNull()
    expect(typedConditionFor(null)).toBeNull()
    expect(typedConditionFor('string')).toBeNull()
  })

  it('reads typed fields with neutral defaults when absent', () => {
    const cond = { condition: 'minecraft:weather_check', raining: true }
    const t = typedConditionFor(cond)!
    expect(conditionFieldValue(cond, t.fields[0])).toBe(true) // raining
    expect(conditionFieldValue(cond, t.fields[1])).toBe(false) // thundering default

    const rc = { condition: 'minecraft:random_chance' }
    const rct = typedConditionFor(rc)!
    expect(conditionFieldValue(rc, rct.fields[0])).toBe(0) // min default
  })

  it('edits only the typed key — unknown internals survive', () => {
    const cond = {
      condition: 'minecraft:random_chance_with_looting',
      chance: 0.3,
      custom_field: { nested: true },
    }
    const t = typedConditionFor(cond)!
    const edited = editConditionField(cond, t.fields[1], 0.25) // looting_multiplier
    expect(edited).toEqual({
      condition: 'minecraft:random_chance_with_looting',
      chance: 0.3,
      looting_multiplier: 0.25,
      custom_field: { nested: true },
    })
  })

  it('every typed condition carries at least one testable shape', () => {
    expect(TYPED_CONDITIONS.length).toBeGreaterThanOrEqual(5)
    for (const c of TYPED_CONDITIONS) {
      expect(c.id.startsWith('minecraft:')).toBe(true)
      expect(newConditionValue(c.id)).toEqual({ condition: c.id })
    }
  })
})
