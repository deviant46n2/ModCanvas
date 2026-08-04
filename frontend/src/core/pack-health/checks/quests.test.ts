import { describe, it, expect } from 'vitest'
import { checkQuests, checkQuestStructure, questItemCoverage, normalizeItemReference, normalizeTableId } from './quests'
import {
  makeGraph,
  makeNode,
  makeObjective,
  makeReward,
  makeChapter,
  makeRewardTable,
  makeEdge,
} from '../test-fixtures'

const known = new Set(['minecraft:dirt', 'minecraft:diamond', 'minecraft:stone'])

describe('normalizeItemReference', () => {
  it('passes through a namespaced id', () => {
    expect(normalizeItemReference('minecraft:stone')).toBe('minecraft:stone')
  })

  it('skips tags', () => {
    expect(normalizeItemReference('#minecraft:planks')).toBeNull()
  })

  it('skips un-namespaced strings', () => {
    expect(normalizeItemReference('stone')).toBeNull()
    expect(normalizeItemReference('a:b:c')).toBe('a:b:c')
  })

  it('strips quotes and trailing count', () => {
    expect(normalizeItemReference('"minecraft:stone"')).toBe('minecraft:stone')
    expect(normalizeItemReference('minecraft:stone 3')).toBe('minecraft:stone')
  })

  it('skips empty input', () => {
    expect(normalizeItemReference('')).toBeNull()
    expect(normalizeItemReference('   ')).toBeNull()
  })
})

describe('normalizeTableId', () => {
  it('pads short hex ids to 16-digit uppercase', () => {
    expect(normalizeTableId('DEADBEEF')).toBe('00000000DEADBEEF')
    expect(normalizeTableId('deadbeef')).toBe('00000000DEADBEEF')
  })

  it('accepts already-canonical ids', () => {
    expect(normalizeTableId('00000000DEADBEEF')).toBe('00000000DEADBEEF')
  })

  it('strips a leading # and returns non-hex ids unchanged', () => {
    expect(normalizeTableId('#00000000DEADBEEF')).toBe('00000000DEADBEEF')
    expect(normalizeTableId('my-table')).toBe('my-table')
  })
})

describe('checkQuests', () => {
  it('flags a missing objective item as recommended (never blocking)', () => {
    const graph = makeGraph({
      nodes: [
        makeNode({
          id: 'q1',
          label: 'Get Cobble',
          objectives: [makeObjective({ id: 'o1', target: 'minecraft:bedrock' })],
        }),
      ],
    })
    const items = checkQuests(graph, known)
    const missing = items.filter((i) => i.id.startsWith('quest.missing-item.'))
    expect(missing).toHaveLength(1)
    expect(missing[0].severity).toBe('recommended')
    expect(missing[0].copyText).toContain('minecraft:bedrock')
    expect(items.filter((i) => i.severity === 'blocking')).toEqual([])
  })

  it('ignores items present in the registry', () => {
    const graph = makeGraph({
      nodes: [
        makeNode({
          id: 'q1',
          objectives: [makeObjective({ id: 'o1', target: 'minecraft:dirt' })],
          rewards: [makeReward({ id: 'r1', item_id: 'minecraft:diamond' })],
          icon: 'minecraft:stone',
        }),
      ],
    })
    expect(checkQuests(graph, known)).toEqual([])
  })

  it('detects a dependency cycle', () => {
    const graph = makeGraph({
      nodes: [makeNode({ id: 'a' }), makeNode({ id: 'b', label: 'B' })],
      edges: [makeEdge('e1', 'a', 'b'), makeEdge('e2', 'b', 'a')],
    })
    const items = checkQuests(graph, known)
    const cycle = items.find((i) => i.id.startsWith('quest.dependency-cycle.'))
    expect(cycle).toBeDefined()
    expect(cycle!.severity).toBe('blocking')
    expect(cycle!.message).toContain('Circular dependency')
  })

  it('flags an undefined reward table as blocking', () => {
    const graph = makeGraph({
      nodes: [makeNode({ id: 'q1', rewards: [makeReward({ id: 'r1', reward_type: 'random', table_id: 'deadbeef' })] })],
    })
    const items = checkQuests(graph, known)
    expect(items.some((i) => i.id === 'quest.undefined-reward-table.q1|r1')).toBe(true)
    expect(items.find((i) => i.id === 'quest.undefined-reward-table.q1|r1')!.severity).toBe('blocking')
  })

  it('does not flag a defined reward table in a different id form', () => {
    const graph = makeGraph({
      reward_tables: [makeRewardTable({ id: '00000000ABC12345' })],
      nodes: [makeNode({ id: 'q1', rewards: [makeReward({ id: 'r1', reward_type: 'random', table_id: 'abc12345' })] })],
    })
    expect(checkQuests(graph, known).filter((i) => i.id.includes('reward-table'))).toEqual([])
  })

  it('flags an empty chapter as recommended', () => {
    const graph = makeGraph({
      chapters: [makeChapter({ id: 'ch', title: 'Empty' })],
      nodes: [makeNode({ id: 'q1', chapter_id: 'other' })],
    })
    const items = checkQuests(graph, known)
    const empty = items.find((i) => i.id === 'quest.empty-chapter.ch')
    expect(empty).toBeDefined()
    expect(empty!.severity).toBe('recommended')
  })

  it('flags unreachable quests as recommended', () => {
    const graph = makeGraph({
      nodes: [makeNode({ id: 'a' }), makeNode({ id: 'b', label: 'B' })],
      edges: [makeEdge('e1', 'a', 'b'), makeEdge('e2', 'b', 'a')],
    })
    const items = checkQuests(graph, known)
    const orphan = items.find((i) => i.id === 'quest.unreachable.b')
    expect(orphan).toBeDefined()
    expect(orphan!.severity).toBe('recommended')
  })

  it('marks quests reachable through a chain as reachable', () => {
    const graph = makeGraph({
      nodes: [makeNode({ id: 'root' }), makeNode({ id: 'mid' }), makeNode({ id: 'end' })],
      edges: [makeEdge('e1', 'root', 'mid'), makeEdge('e2', 'mid', 'end')],
    })
    const items = checkQuests(graph, known)
    expect(items.some((i) => i.id.startsWith('quest.unreachable.'))).toBe(false)
  })

  it('flags an unused reward table as recommended', () => {
    const graph = makeGraph({
      reward_tables: [makeRewardTable({ id: 'rt1', title: 'Loot' })],
      nodes: [makeNode({ id: 'q1' })],
    })
    const items = checkQuests(graph, known)
    const unused = items.find((i) => i.id === 'quest.unused-reward-table.rt1')
    expect(unused).toBeDefined()
    expect(unused!.severity).toBe('recommended')
  })

  it('ignores tags and un-namespaced smart-filter refs without false positives', () => {
    const graph = makeGraph({
      nodes: [
        makeNode({
          id: 'q1',
          objectives: [makeObjective({ id: 'o1', smart_filter: 'or(item(minecraft:dirt)tag(c:trees))' })],
        }),
      ],
    })
    const items = checkQuests(graph, known)
    expect(items.some((i) => i.id.startsWith('quest.missing-item.'))).toBe(false)
  })

  it('parses smart-filter item refs for existence', () => {
    const graph = makeGraph({
      nodes: [
        makeNode({
          id: 'q1',
          objectives: [makeObjective({ id: 'o1', smart_filter: 'or(item(minecraft:ghost))' })],
        }),
      ],
    })
    const items = checkQuests(graph, known)
    expect(items.some((i) => i.message.includes('minecraft:ghost'))).toBe(true)
  })
})

describe('questItemCoverage', () => {
  it('counts distinct checkable refs and how many the registry resolves', () => {
    const graph = makeGraph({
      nodes: [
        makeNode({
          id: 'q1',
          objectives: [makeObjective({ id: 'o1', target: 'minecraft:dirt' })],
          rewards: [makeReward({ id: 'r1', item_id: 'minecraft:ghost' })],
          icon: 'minecraft:diamond',
        }),
      ],
    })
    const coverage = questItemCoverage(graph, known)
    expect(coverage.total).toBe(2)
    expect(coverage.found).toBe(1)
  })

  it('returns zero when there are no checkable refs', () => {
    const graph = makeGraph({ nodes: [makeNode({ id: 'q1', objectives: [], icon: '' })] })
    expect(questItemCoverage(graph, known)).toEqual({ total: 0, found: 0 })
  })
})

describe('checkQuestStructure', () => {
  it('never emits item-existence findings (structure only)', () => {
    const graph = makeGraph({
      nodes: [makeNode({ id: 'q1', objectives: [makeObjective({ id: 'o1', target: 'minecraft:ghost' })] })],
    })
    const items = checkQuestStructure(graph)
    expect(items.some((i) => i.id.startsWith('quest.missing-item.'))).toBe(false)
  })
})
