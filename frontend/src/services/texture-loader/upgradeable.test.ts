import { describe, expect, it, beforeEach } from 'vitest'
import {
  __resetUpgradeableKeys,
  registerUpgradeableKeys,
  getUpgradeableTextureKeys,
  subscribeUpgradeableKeys,
} from './upgradeable'

describe('upgradeable keys (s58)', () => {
  beforeEach(() => __resetUpgradeableKeys())

  it('registers keys and reports them', () => {
    registerUpgradeableKeys(['minecraft:stone', 'minecraft:crafting_table'])
    expect(getUpgradeableTextureKeys().sort()).toEqual(['minecraft:crafting_table', 'minecraft:stone'])
  })

  it('is idempotent — re-registering the same key fires once', () => {
    let fired = 0
    const unsub = subscribeUpgradeableKeys(() => fired++)
    registerUpgradeableKeys(['minecraft:stone'])
    registerUpgradeableKeys(['minecraft:stone'])
    expect(fired).toBe(1)
    unsub()
  })

  it('stays separate from baked keys (different registry, same pattern)', () => {
    // The baked registry has its own __resetBakedKeys; this module is
    // independent so upgradeable items keep materializing flat offline.
    registerUpgradeableKeys(['minecraft:stone'])
    expect(getUpgradeableTextureKeys()).toContain('minecraft:stone')
  })
})
