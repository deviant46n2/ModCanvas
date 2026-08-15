import { describe, it, expect } from 'vitest'
import {
  parseCompanionRegistry,
  companionRegistryWithTextures,
} from './item-registry-companion'

describe('parseCompanionRegistry (s59 companion dump)', () => {
  it('converts dump entries to registry entries with namespace mod_id', () => {
    const out = parseCompanionRegistry([
      { id: 'minecraft:white_banner', name: 'White Banner' },
      { id: 'minecraft:potion', name: 'Potion' },
      { id: 'ftbquests:chest', name: 'Chest' },
    ])
    expect(out).toEqual([
      { id: 'minecraft:white_banner', name: 'White Banner', mod_id: 'minecraft', texture_data_url: null },
      { id: 'minecraft:potion', name: 'Potion', mod_id: 'minecraft', texture_data_url: null },
      { id: 'ftbquests:chest', name: 'Chest', mod_id: 'ftbquests', texture_data_url: null },
    ])
  })

  it('falls back to the id as name when name is empty', () => {
    const out = parseCompanionRegistry([{ id: 'minecraft:arrow', name: '' }])
    expect(out[0].name).toBe('minecraft:arrow')
  })

  it('survives a name-less or id-less entry without crashing', () => {
    const out = parseCompanionRegistry([
      { id: 'minecraft:stone', name: 'Stone' },
    ] as unknown as Array<{ id: string; name: string }>)
    expect(out.length).toBe(1)
  })
})

describe('companionRegistryWithTextures (s26 backfill)', () => {
  it('fills texture_data_url from the texture index for known items', () => {
    const entries = parseCompanionRegistry([
      { id: 'minecraft:white_banner', name: 'White Banner' },
      { id: 'minecraft:3d_block', name: '3D Block' },
    ])
    const filled = companionRegistryWithTextures(entries, {
      'minecraft:white_banner': 'jar:/x.jar!assets/minecraft/textures/block/oak_planks.png',
    })
    // Flat item gets its jar descriptor → engine queue skips it (s26).
    expect(filled[0].texture_data_url).toContain('jar:')
    // Unknown item stays null → engine-renderable when connected.
    expect(filled[1].texture_data_url).toBeNull()
  })

  it('is reference-stable when nothing changes', () => {
    const entries = parseCompanionRegistry([{ id: 'minecraft:stone', name: 'Stone' }])
    expect(companionRegistryWithTextures(entries, {})).toBe(entries)
  })
})
