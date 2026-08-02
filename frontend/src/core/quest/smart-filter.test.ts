import { describe, it, expect } from 'vitest'
import {
  parseSmartFilterDsl,
  scanCalls,
  smartFilterMembers,
  memberKey,
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
})
