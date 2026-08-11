import { describe, it, expect } from 'vitest'
import type { QuestGraphData } from '../../../services/quest-types'
import { makeNode, makeEdge, makeGraph as makeFixtureGraph } from '../test-fixtures'
import {
  rootQuests,
  reachableQuests,
  bottleneckScore,
  findWalls,
  findBottlenecks,
  findLongestChains,
  computeTopology,
} from './topology'

function makeGraph(edges: Array<[string, string]>, optional: string[] = []): QuestGraphData {
  const ids = new Set<string>()
  for (const [s, t] of edges) { ids.add(s); ids.add(t) }
  const nodes = [...ids].map((id) => makeNode({ id, label: id, optional: optional.includes(id) }))
  return makeFixtureGraph({
    nodes,
    edges: edges.map(([source, target], i) => makeEdge(`e${i}`, source, target)),
  })
}

describe('topology — roots and reachability', () => {
  it('root quests have no incoming dependency edges', () => {
    const g = makeGraph([['a', 'b'], ['b', 'c'], ['d', 'c']])
    expect([...rootQuests(g)].sort()).toEqual(['a', 'd'])
  })

  it('reachable set is the closure from roots', () => {
    const g = makeGraph([['a', 'b'], ['b', 'c'], ['d', 'c'], ['x', 'y']])
    // x->y is a disconnected component; y is still reachable from x.
    expect(reachableQuests(g)).toEqual(new Set(['a', 'b', 'c', 'd', 'x', 'y']))
  })
})

describe('topology — bottleneckScore', () => {
  it('linear chain: every quest gates all downstream', () => {
    // a -> b -> c -> d.
    // Removing a strands b,c,d (3); removing b strands c,d (2); d strands none.
    const g = makeGraph([['a', 'b'], ['b', 'c'], ['c', 'd']])
    expect(bottleneckScore(g, 'a')).toBe(3)
    expect(bottleneckScore(g, 'b')).toBe(2)
    expect(bottleneckScore(g, 'd')).toBe(0) // nothing depends on d
  })

  it('parallel branches: removing a shared gate strands a branch', () => {
    // a -> b -> c; a -> d -> e. Removing b strands only c (1).
    const g = makeGraph([['a', 'b'], ['b', 'c'], ['a', 'd'], ['d', 'e']])
    expect(bottleneckScore(g, 'b')).toBe(1)
    expect(bottleneckScore(g, 'd')).toBe(1)
    expect(bottleneckScore(g, 'a')).toBe(4) // root strands the whole graph
  })
})

describe('topology — walls', () => {
  it('a single-path gate is a wall; a parallel-path gate is not', () => {
    // b is the ONLY path to c. d has an alternative e -> d, so d is reachable
    // two ways — but f depends ONLY on d, so d still walls f. b and d are
    // walls; a (a root, nothing walled behind it beyond the graph it gates)
    // is not a wall.
    const g = makeGraph([['a', 'b'], ['b', 'c'], ['a', 'd'], ['e', 'd'], ['d', 'f']])
    expect(findWalls(g)).toContain('b')
    expect(findWalls(g)).toContain('d') // f has no alternative to d
    expect(findWalls(g)).not.toContain('a')
  })

  it('optional quests are never walls', () => {
    const g = makeGraph([['a', 'b'], ['b', 'c']], ['b'])
    expect(findWalls(g)).not.toContain('b')
    expect(findWalls(g)).not.toContain('c')
  })
})

describe('topology — bottlenecks', () => {
  it('gates more than half the graph are bottlenecks', () => {
    // 6 quests: a -> b -> {c,d,e} and a -> f.
    // Removing b strands c,d,e = 3 of 6 — NOT more than half (3 !> 3).
    // Removing a strands b,c,d,e,f = 5 of 6 — a IS a bottleneck (> 3).
    const g = makeGraph([
      ['a', 'b'], ['b', 'c'], ['b', 'd'], ['b', 'e'], ['a', 'f'],
    ])
    expect(findBottlenecks(g)).toEqual(['a'])
  })

  it('gates strictly more than half are bottlenecks', () => {
    // 6 quests: a -> b -> {c,d,e,f} = removing b strands 4 > 3.
    const g = makeGraph([
      ['a', 'b'], ['b', 'c'], ['b', 'd'], ['b', 'e'], ['b', 'f'],
    ])
    expect(findBottlenecks(g)).toContain('b')
  })
})

describe('topology — longest chains', () => {
  it('finds the longest dependency chain', () => {
    const g = makeGraph([['a', 'b'], ['b', 'c'], ['a', 'd']])
    const chains = findLongestChains(g, 1)
    expect(chains[0]).toEqual(['a', 'b', 'c'])
  })

  it('maxChainLength is the longest path length', () => {
    const g = makeGraph([['a', 'b'], ['b', 'c'], ['c', 'd']])
    expect(computeTopology(g).maxChainLength).toBe(4)
  })

  it('is cycle-safe — a dependency cycle terminates', () => {
    // a -> b -> a is a cycle; longest chain must terminate.
    const g = makeGraph([['a', 'b'], ['b', 'a'], ['b', 'c']])
    const chains = findLongestChains(g, 5)
    expect(chains.length).toBeGreaterThan(0)
    for (const c of chains) {
      expect(new Set(c).size).toBe(c.length) // no repeated quests
    }
  })
})

describe('topology — computeTopology integration', () => {
  it('empty graph is safe', () => {
    const g = makeGraph([])
    const t = computeTopology(g)
    expect(t.bottlenecks).toEqual([])
    expect(t.walls).toEqual([])
    expect(t.longestChains).toEqual([])
    expect(t.maxChainLength).toBe(0)
  })
})
