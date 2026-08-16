import { describe, it, expect } from 'vitest'
import {
  isTextureReference,
  questRuntimeNamespaces,
  runtimeTextureKeyForms,
  mergeRuntimeTextures,
} from './runtime-textures'
import type { QuestGraphData } from './quest-types'

function graph(partial: Partial<QuestGraphData>): QuestGraphData {
  return {
    id: 'g1',
    project_id: 'p1',
    name: 'Test',
    description: '',
    chapters: [],
    chapter_groups: [],
    reward_tables: [],
    nodes: [],
    edges: [],
    book_progression_mode: 'LINEAR',
    book_icon: '',
    book_background_image: '',
    quest_color: '',
    default_quest_shape: 'circle',
    grid_scale: 1,
    ...partial,
  }
}

describe('isTextureReference', () => {
  it('accepts texture paths', () => {
    expect(isTextureReference('atm:textures/questpics/star.png')).toBe(true)
    expect(isTextureReference('atm:questpics/star')).toBe(true)
    expect(isTextureReference('ftbquests:textures/gui/quests.png')).toBe(true)
    expect(isTextureReference('minecraft:textures/block/stone.png')).toBe(true)
  })

  it('rejects item ids and non-texture refs', () => {
    expect(isTextureReference('minecraft:diamond')).toBe(false)
    expect(isTextureReference('minecraft:item/diamond')).toBe(false)
    expect(isTextureReference('minecraft:block/stone')).toBe(false)
    expect(isTextureReference('#minecraft:planks')).toBe(false)
    expect(isTextureReference('https://example.com/x.png')).toBe(false)
    expect(isTextureReference('')).toBe(false)
    expect(isTextureReference(null)).toBe(false)
  })
})

describe('questRuntimeNamespaces', () => {
  it('collects namespaces from non-item assets plus ftbquests', () => {
    const g = graph({
      book_background_image: 'atm:textures/questpics/banner.png',
      chapters: [
        {
          id: 'c1', title: 'C', description: '', order_index: 0, group_id: null,
          icon: 'minecraft:diamond', background_image: 'ftbquests:textures/gui/cbg.png',
          images: [{ id: 'i1', image: 'kubejs:assets/pics/hero.png', x: 0, y: 0, width: 1, height: 1 }],
        } as unknown as QuestGraphData['chapters'][number],
      ],
      nodes: [{ id: 'n1', node_type: 'quest', chapter_id: 'c1', icon: 'atm:questpics/star', label: 'Q' } as QuestGraphData['nodes'][number]],
    })
    const namespaces = questRuntimeNamespaces(g)
    // item icons (minecraft:diamond) are excluded; item/block-prefixed excluded.
    expect(namespaces).toContain('ftbquests')
    expect(namespaces).toContain('atm')
    expect(namespaces).toContain('kubejs')
    expect(namespaces).not.toContain('minecraft')
  })
})

describe('runtimeTextureKeyForms', () => {
  it('expands a location into the index key forms', () => {
    expect(runtimeTextureKeyForms('atm:textures/questpics/star.png')).toEqual([
      'atm:questpics/star',
      'atm:textures/questpics/star',
      'atm:textures/questpics/star.png',
    ])
  })
})

describe('mergeRuntimeTextures', () => {
  it('registers every key form and lets runtime captures win', () => {
    const index = { 'atm:questpics/star': 'data:image/png;base64,OFFLINE' }
    const merged = mergeRuntimeTextures(index, {
      'atm:textures/questpics/star.png': 'data:image/png;base64,RUNTIME',
    })
    expect(merged['atm:questpics/star']).toBe('data:image/png;base64,RUNTIME')
    expect(merged['atm:textures/questpics/star']).toBe('data:image/png;base64,RUNTIME')
    expect(merged['atm:textures/questpics/star.png']).toBe('data:image/png;base64,RUNTIME')
  })

  it('returns the same reference when nothing changes', () => {
    const index = { a: 'data:image/png;base64,X' }
    const merged = mergeRuntimeTextures(index, {})
    expect(merged).toBe(index)
    const merged2 = mergeRuntimeTextures(index, { 'x:y': 'data:image/png;base64,Z' })
    expect(merged2).not.toBe(index)
  })

  it('skips empty urls', () => {
    const index = { a: 'data:image/png;base64,X' }
    const merged = mergeRuntimeTextures(index, { 'minecraft:textures/item/x.png': '' })
    expect(merged).toBe(index)
  })
})
