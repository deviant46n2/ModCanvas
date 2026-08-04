import { describe, it, expect } from 'vitest'
import { checkPack } from './pack'
import { makeGraph, makeChapter } from '../test-fixtures'
import type { PackCoverageMeta } from './pack'

const meta: PackCoverageMeta = { name: 'Pack', description: 'Desc', author: 'Me', packVersion: '1.0.0' }
const input = (overrides: Partial<Parameters<typeof checkPack>[0]> = {}) => ({
  meta,
  hasCoverImage: true,
  packLoaded: true,
  questGraph: makeGraph({ chapters: [makeChapter({})] }),
  ...overrides,
})

describe('checkPack', () => {
  it('returns nothing when the pack is healthy', () => {
    expect(checkPack(input())).toEqual([])
  })

  it('returns nothing before the pack is loaded', () => {
    expect(checkPack(input({ packLoaded: false, hasCoverImage: false }))).toEqual([])
  })

  it('recommends a cover image when missing', () => {
    const items = checkPack(input({ hasCoverImage: false }))
    const cover = items.find((i) => i.id === 'pack.cover-image')
    expect(cover).toBeDefined()
    expect(cover!.severity).toBe('recommended')
  })

  it('recommends filling empty pack info fields', () => {
    const items = checkPack(input({ meta: { name: '', description: '', author: '', packVersion: '1.0.0' } }))
    expect(items.some((i) => i.id === 'pack.info.name')).toBe(true)
    expect(items.some((i) => i.id === 'pack.info.description')).toBe(true)
    expect(items.some((i) => i.id === 'pack.info.author')).toBe(true)
  })

  it('recommends adding chapters when the book is empty', () => {
    const items = checkPack(input({ questGraph: makeGraph({ chapters: [] }) }))
    const empty = items.find((i) => i.id === 'pack.zero-chapters')
    expect(empty).toBeDefined()
    expect(empty!.severity).toBe('recommended')
  })
})
