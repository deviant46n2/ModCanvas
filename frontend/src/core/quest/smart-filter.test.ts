import { describe, it, expect } from 'vitest'
import {
  parseSmartFilterDsl,
  scanCalls,
  smartFilterMembers,
  matchingSmartFilterItems,
  smartFilterMatches,
  memberKey,
  type SmartFilterMatchContext,
} from './smart-filter'

describe('smart-filter DSL parser', () => {
  it('parses a simple or() of items', () => {
    const dsl = 'or(item(buildinggadgets2:gadget_building)item(buildinggadgets2:gadget_exchanging))'
    const nodes = parseSmartFilterDsl(dsl)
    expect(nodes).toHaveLength(1)
    expect(nodes[0].type).toBe('or')
  })

  it('flattens or/and/xor into ordered de-duplicated members', () => {
    const dsl = 'or(item(a:one)item(a:two)item(a:one))'
    const members = smartFilterMembers(dsl)
    expect(members).toEqual([
      { type: 'item', id: 'a:one' },
      { type: 'item', id: 'a:two' },
    ])
  })

  it('keeps item_tag and tag members', () => {
    const dsl = 'item_tag(forge:ingots/iron)tag(ftb:t1seeds)'
    const members = smartFilterMembers(dsl)
    expect(members).toEqual([
      { type: 'tag', tag: 'forge:ingots/iron' },
      { type: 'tag', tag: 'ftb:t1seeds' },
    ])
  })

  it('strips the ftbfiltersystem: namespace prefix', () => {
    const dsl = 'ftbfiltersystem:item_tag(elevatorid:elevators)'
    const members = smartFilterMembers(dsl)
    expect(members).toEqual([{ type: 'tag', tag: 'elevatorid:elevators' }])
  })

  it('keeps mod members', () => {
    const dsl = 'or(mod(relics))'
    expect(smartFilterMembers(dsl)).toEqual([{ type: 'mod', mod: 'relics' }])
  })

  it('excludes not() subtrees', () => {
    const dsl = 'item_tag(roots:crops)not(or(item(roots:wildroot)item(roots:spiritleaf)))'
    const members = smartFilterMembers(dsl)
    expect(members).toEqual([{ type: 'tag', tag: 'roots:crops' }])
  })

  it('handles nested wrapper depth', () => {
    const dsl = 'and(or(item(a:1)item(a:2))not(item(a:3)))'
    const members = smartFilterMembers(dsl)
    expect(members).toEqual([
      { type: 'item', id: 'a:1' },
      { type: 'item', id: 'a:2' },
    ])
  })

  it('returns empty for empty/garbage DSL', () => {
    expect(smartFilterMembers('')).toEqual([])
    expect(smartFilterMembers('not-a-call')).toEqual([])
    expect(smartFilterMembers('((((')).toEqual([])
  })

  it('scanCalls splits whitespace-separated top-level calls', () => {
    const calls = scanCalls('or(item(a:1)) item(b:2)')
    expect(calls).toHaveLength(2)
  })

  it('memberKey produces canonical texture-index keys', () => {
    expect(memberKey({ type: 'item', id: 'a:b' })).toBe('a:b')
    expect(memberKey({ type: 'tag', tag: 'a:b' })).toBe('#a:b')
    expect(memberKey({ type: 'mod', mod: 'a' })).toBe('mod:a')
  })

  it('parses the real-world enchantment capturing component filter', () => {
    const dsl = 'or(component(fuzzy:{"minecraft:stored_enchantments":{levels:{"apothic_spawners:capturing":1}}})component(fuzzy:{"minecraft:stored_enchantments":{levels:{"apothic_spawners:capturing":2}}}))item(minecraft:enchanted_book)'
    const nodes = parseSmartFilterDsl(dsl)
    expect(nodes).toHaveLength(2)
    expect(nodes[0]).toMatchObject({ type: 'or' })
    expect(nodes[1]).toEqual({ type: 'item', id: 'minecraft:enchanted_book' })
  })

  it('preserves component/block/stack_size as filter members but excludes them from icon candidates', () => {
    const dsl = 'or(stack_size(>4)item(ae2:quantum_entangled_singularity)block())'
    const members = smartFilterMembers(dsl)
    expect(members).toEqual([{ type: 'item', id: 'ae2:quantum_entangled_singularity' }])
    const nodes = parseSmartFilterDsl(dsl)
    expect(nodes[0]).toMatchObject({ type: 'or' })
  })

  it('parses the real-world roots_4 crop exclusion query', () => {
    const dsl = 'item_tag(roots:crops)not(or(item(roots:wildroot)item(roots:wildewheet)item(roots:spiritleaf)))'
    const members = smartFilterMembers(dsl)
    expect(members).toHaveLength(1)
    expect(members[0]).toEqual({ type: 'tag', tag: 'roots:crops' })
  })

  it('parses only_one as an xor node (FFS serialization)', () => {
    const nodes = parseSmartFilterDsl('only_one(item(a:1)item(a:2))')
    expect(nodes).toHaveLength(1)
    expect(nodes[0]).toEqual({
      type: 'xor',
      children: [
        { type: 'item', id: 'a:1' },
        { type: 'item', id: 'a:2' },
      ],
    })
  })
})

describe('smart-filter matcher (in-game semantics)', () => {
  // roots:crops contains wildroot, wildewheet, spiritleaf, potato.
  const tagItems = (t: string) =>
    t === 'roots:crops' ? ['roots:wildroot', 'roots:wildewheet', 'roots:spiritleaf', 'roots:potato'] : undefined
  const modOf = (id: string) => (id.startsWith('roots:') ? 'roots' : id.startsWith('relics:') ? 'relics' : undefined)
  const ctx: SmartFilterMatchContext = { tagItems, modOf }
  const registry = [
    'minecraft:dirt',
    'roots:wildroot',
    'roots:wildewheet',
    'roots:spiritleaf',
    'roots:potato',
    'relics:some_relic',
  ]

  it('top-level calls are an implicit AND (FFS RootFilter)', () => {
    const dsl = 'item_tag(roots:crops)not(or(item(roots:wildroot)item(roots:wildewheet)item(roots:spiritleaf)))'
    const matched = matchingSmartFilterItems(dsl, registry, ctx)
    expect(matched).toEqual(['roots:potato'])
  })

  it('item() matches exactly', () => {
    expect(smartFilterMatches('item(roots:potato)', 'roots:potato', ctx)).toBe(true)
    expect(smartFilterMatches('item(roots:potato)', 'roots:wildroot', ctx)).toBe(false)
  })

  it('or() is a union of candidates', () => {
    const matched = matchingSmartFilterItems('or(item(roots:wildroot)item(roots:potato))', registry, ctx)
    expect(matched).toEqual(['roots:wildroot', 'roots:potato'])
  })

  it('and() of distinct items matches nothing (like in-game)', () => {
    const matched = matchingSmartFilterItems('and(item(roots:wildroot)item(roots:potato))', registry, ctx)
    expect(matched).toEqual([])
  })

  it('only_one/xor requires exactly one child to match', () => {
    const matched = matchingSmartFilterItems(
      'only_one(item(roots:wildroot)item(roots:potato)item(roots:wildewheet))',
      registry,
      ctx,
    )
    // Each of the three listed items matches exactly one child; the rest match none.
    expect(matched).toEqual(['roots:wildroot', 'roots:wildewheet', 'roots:potato'])
  })

  it('pure negation matches everything except the excluded item', () => {
    const matched = matchingSmartFilterItems('not(item(roots:wildroot))', registry, ctx)
    expect(matched).not.toContain('roots:wildroot')
    expect(matched).toContain('roots:potato')
    expect(matched).toContain('minecraft:dirt')
  })

  it('mod() matches by mod id', () => {
    const matched = matchingSmartFilterItems('mod(relics)', registry, ctx)
    expect(matched).toEqual(['relics:some_relic'])
  })

  it('unknown tags and empty DSL match nothing', () => {
    expect(matchingSmartFilterItems('item_tag(unknown:tag)', registry, ctx)).toEqual([])
    expect(matchingSmartFilterItems('', registry, ctx)).toEqual([])
    expect(matchingSmartFilterItems('   ', registry, ctx)).toEqual([])
  })

  it('passes through registry duplicates (display dedup happens in the icon layer)', () => {
    const dupRegistry = ['roots:potato', 'roots:potato', 'roots:wildroot']
    const matched = matchingSmartFilterItems('or(item(roots:potato)item(roots:wildroot))', dupRegistry, ctx)
    expect(matched).toEqual(['roots:potato', 'roots:potato', 'roots:wildroot'])
  })
})
