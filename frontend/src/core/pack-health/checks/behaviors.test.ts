import { describe, it, expect } from 'vitest'
import { checkBehaviors, behaviorItemCoverage } from './behaviors'
import type { Behavior } from '../../behavior/behavior-store'

function behavior(over: Partial<Behavior> = {}): Behavior {
  return {
    id: 'starter:kit',
    name: 'Starter Kit',
    trigger: { kind: 'player_joins_game' },
    conditions: [],
    actions: [{ kind: 'give_item', item: 'minecraft:diamond', count: 1 }],
    ...over,
  }
}

describe('checkBehaviors', () => {
  const known = new Set(['minecraft:diamond', 'minecraft:bread'])

  it('returns nothing for behaviors whose items resolve', () => {
    const items = checkBehaviors(
      [behavior(), behavior({ actions: [{ kind: 'give_item', item: 'minecraft:bread', count: 2 }] })],
      known,
    )
    expect(items).toEqual([])
  })

  it('flags a give_item target missing from the registry as recommended', () => {
    const items = checkBehaviors([behavior({ actions: [{ kind: 'give_item', item: 'minecraft:ghost', count: 1 }] })], known)
    expect(items).toHaveLength(1)
    const [item] = items
    expect(item.severity).toBe('recommended')
    expect(item.id).toBe('behaviors.missing-item.starter:kit.minecraft:ghost')
    expect(item.message).toContain('minecraft:ghost')
    expect(item.target?.section).toBe('behaviors')
    expect(item.copyText).toContain('Starter Kit')
  })

  it('never blocks on a scan gap (Trust Rule)', () => {
    const items = checkBehaviors([behavior({ actions: [{ kind: 'give_item', item: 'kubejs:custom_item', count: 1 }] })], known)
    expect(items[0].severity).not.toBe('blocking')
  })

  it('ignores non-give_item actions and unverifiable refs', () => {
    const items = checkBehaviors(
      [
        behavior({
          actions: [
            // A future action kind (not give_item) — must not produce findings.
            { kind: 'give_item', item: 'minecraft:ghost', count: 1 },
          ],
        }),
        behavior({ actions: [{ kind: 'give_item', item: '#forge:ingots/iron', count: 1 }] }),
        behavior({ actions: [{ kind: 'give_item', item: 'notnamespaced', count: 1 }] }),
      ],
      known,
    )
    // Only the namespaced, non-tag ghost ref is checkable.
    expect(items).toHaveLength(1)
    expect(items[0].message).toContain('minecraft:ghost')
  })

  it('dedupes repeated references to the same item', () => {
    const items = checkBehaviors(
      [
        behavior({ actions: [{ kind: 'give_item', item: 'minecraft:ghost', count: 1 }, { kind: 'give_item', item: 'minecraft:ghost', count: 2 }] }),
      ],
      known,
    )
    expect(items).toHaveLength(1)
  })

  it('empty behaviors produce no findings', () => {
    expect(checkBehaviors([], known)).toEqual([])
  })
})

describe('behaviorItemCoverage', () => {
  it('counts unique checkable references and resolutions', () => {
    const behaviors = [
      behavior({ actions: [{ kind: 'give_item', item: 'minecraft:diamond', count: 1 }] }),
      behavior({ actions: [{ kind: 'give_item', item: 'minecraft:ghost', count: 1 }] }),
      behavior({ actions: [{ kind: 'give_item', item: 'minecraft:ghost', count: 3 }] }),
    ]
    const coverage = behaviorItemCoverage(behaviors, new Set(['minecraft:diamond']))
    expect(coverage).toEqual({ total: 2, found: 1 })
  })

  it('returns zero for uncheckable input', () => {
    expect(behaviorItemCoverage([], new Set())).toEqual({ total: 0, found: 0 })
  })
})
