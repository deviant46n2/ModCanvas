import { describe, it, expect } from 'vitest'
import { defaultChild, deleteAt, duplicateAt, getAt, matchesQuery, moveArrayAt, setAt, findMatchingPaths } from './tree'
import type { ConfigValue } from './types'

const tree: ConfigValue = {
  type: 'object',
  fields: {
    server: {
      type: 'group',
      label: 'Server',
      fields: {
        port: { type: 'number', value: 25565, step: 1 },
        host: { type: 'string', value: '0.0.0.0', comment: '# bind addr' },
      },
    },
    whitelist: { type: 'array', items: [{ type: 'string', value: 'alice' }] },
  },
}

describe('getAt', () => {
  it('walks object fields', () => {
    expect(getAt(tree, ['server', 'port'])?.value).toBe(25565)
  })
  it('walks array indices', () => {
    expect(getAt(tree, ['whitelist', '0'])?.value).toBe('alice')
  })
  it('returns undefined for missing paths', () => {
    expect(getAt(tree, ['server', 'nope'])).toBeUndefined()
    expect(getAt(tree, ['nope'])).toBeUndefined()
  })
})

describe('defaultChild', () => {
  it('templates from an existing sibling', () => {
    const next = defaultChild({ type: 'string', value: 'alice' })
    expect(next.type).toBe('string')
    expect(next.value).toBe('')
  })
  it('templates enum options', () => {
    const next = defaultChild({ type: 'enum', value: 'a', options: ['a', 'b'] })
    expect(next.type).toBe('enum')
    expect(next.value).toBe('a')
  })
  it('falls back to string', () => {
    expect(defaultChild(undefined).type).toBe('string')
  })
})

describe('matchesQuery', () => {
  it('matches keys, comments, and values', () => {
    expect(matchesQuery(tree.fields!.server!, 'server', 'port', [])).toBe(true)
    expect(matchesQuery(tree.fields!.server!, 'server', 'bind', [])).toBe(true)
    expect(matchesQuery(tree.fields!.server!, 'server', 'alice', [])).toBe(false)
  })
  it('matches nested array values', () => {
    expect(matchesQuery(tree.fields!.whitelist!, 'whitelist', 'alice', [])).toBe(true)
  })
  it('empty query matches everything', () => {
    expect(matchesQuery(tree, 'root', '', [])).toBe(true)
  })
})

describe('setAt / deleteAt', () => {
  it('setAt inserts an object field non-mutating', () => {
    const before = JSON.stringify(tree)
    const next = setAt(tree, ['server', 'motd'], { type: 'string', value: 'hi' })
    expect(getAt(next, ['server', 'motd'])?.value).toBe('hi')
    expect(JSON.stringify(tree)).toBe(before)
  })
  it('setAt replaces an array element', () => {
    const next = setAt(tree, ['whitelist', '0'], { type: 'string', value: 'bob' })
    expect(getAt(next, ['whitelist', '0'])?.value).toBe('bob')
    expect(getAt(tree, ['whitelist', '0'])?.value).toBe('alice')
  })
  it('deleteAt removes a field', () => {
    const next = deleteAt(tree, ['server', 'host'])
    expect(getAt(next, ['server', 'host'])).toBeUndefined()
    expect(getAt(next, ['server', 'port'])?.value).toBe(25565)
  })
  it('deleteAt removes an array element', () => {
    const next = deleteAt(tree, ['whitelist', '0'])
    expect(getAt(next, ['whitelist', '0'])).toBeUndefined()
  })
})

describe('moveArrayAt / duplicateAt', () => {
  const arr: ConfigValue = {
    type: 'array',
    items: [
      { type: 'string', value: 'a' },
      { type: 'string', value: 'b' },
      { type: 'string', value: 'c' },
    ],
  }
  const arrayRoot: ConfigValue = { type: 'object', fields: { list: arr } }

  it('moveArrayAt moves an item up non-mutating', () => {
    const next = moveArrayAt(arrayRoot, ['list'], 2, 0)
    expect((getAt(next, ['list']) as any).items.map((i: any) => i.value)).toEqual(['c', 'a', 'b'])
    expect((getAt(arrayRoot, ['list']) as any).items.map((i: any) => i.value)).toEqual(['a', 'b', 'c'])
  })
  it('moveArrayAt ignores out-of-bounds moves', () => {
    expect(JSON.stringify(moveArrayAt(arrayRoot, ['list'], 0, 5))).toBe(JSON.stringify(arrayRoot))
    expect(JSON.stringify(moveArrayAt(arrayRoot, ['list'], 0, 0))).toBe(JSON.stringify(arrayRoot))
  })
  it('duplicateAt clones an array element after itself', () => {
    const next = duplicateAt(arrayRoot, ['list', '1'])
    const items = (getAt(next, ['list']) as any)?.items.map((i: any) => i.value)
    expect(items).toEqual(['a', 'b', 'b', 'c'])
  })
  it('duplicateAt clones an object field with a suffixed key', () => {
    const next = duplicateAt(tree, ['server', 'port'])
    const fields = getAt(next, ['server'])?.fields
    expect(Object.keys(fields!)).toContain('port copy')
    expect(getAt(next, ['server', 'port copy'])?.value).toBe(25565)
  })
})

describe('findMatchingPaths', () => {
  function root(fields: Record<string, ConfigValue>): ConfigValue {
    return { type: 'object', fields }
  }

  it('matches leaf keys by plain word (path substring)', () => {
    const tree = root({
      general: { type: 'group', fields: { keepInventory: { type: 'boolean', value: true } } },
    })
    expect(findMatchingPaths(tree, 'keepinventory')).toEqual([['general', 'keepInventory']])
  })

  it('matches string values, not just keys', () => {
    const tree = root({ difficulty: { type: 'string', value: 'hard' } })
    expect(findMatchingPaths(tree, 'hard')).toEqual([['difficulty']])
  })

  it('matches comments', () => {
    const tree = root({ tps: { type: 'number', value: 20, comment: 'ticks per second' } })
    expect(findMatchingPaths(tree, 'per second')).toEqual([['tps']])
  })

  it('returns the container path when only the container matches', () => {
    const tree = root({
      general: { type: 'group', fields: { keepInventory: { type: 'boolean', value: true } } },
    })
    expect(findMatchingPaths(tree, 'general')).toEqual([['general', 'keepInventory']])
  })

  it('returns nothing for a no-match query', () => {
    const tree = root({ difficulty: { type: 'string', value: 'hard' } })
    expect(findMatchingPaths(tree, 'zzz')).toEqual([])
  })

  it('handles arrays', () => {
    const tree = root({
      blacklist: { type: 'array', items: [{ type: 'string', value: 'minecraft:bedrock' }] },
    })
    expect(findMatchingPaths(tree, 'bedrock')).toEqual([['blacklist', '0']])
  })
})
