// Topology analysis (P1-HEALTH-2, roadmap §10.2): pure graph math over the
// quest graph. Bottlenecks, walls, and chain lengths are MEASUREMENTS, never
// opinions (Trust Rule — no opinion labels). The unreachable-from-edges
// check already lives in `checks/quests/structure.ts` (Tier 1); this module
// adds the Tier-2 measurements only.
//
// Deliberately scoped: the quest→item→recipe "unreachable via satisfiable
// tasks" half is PARKED with a written reason — it needs the Pack Index
// consumer plumbing + the full objective model, and the roadmap names it as
// the hard part; the measurements here are provable from edges alone.
//
// Definitions (mirroring FTB dependency semantics):
//   - dependency edges: prerequisite/optional edges; a quest is gated by its
//     incoming dependency edges' sources.
//   - bottleneck: a quest whose removal disconnects the most quests from the
//     root set (gates a disproportionate share of the graph).
//   - wall: a stage (quest) reachable only through a single dependency chain
//     — a single quest whose absence strands a downstream subgraph.
//   - chain: a longest dependency path; length = number of quests in it.

import type { QuestGraphData } from '../../../services/quest-types'

export interface TopologyMetrics {
  /** Quest ids whose indegree (number of quests depending ON them) is a
   *  local maximum — gates a disproportionate share. */
  bottlenecks: string[]
  /** Quest ids that are the ONLY path from the root set to some downstream
   *  quest. Removing one strands that subgraph. */
  walls: string[]
  /** Longest dependency chains, as ordered quest-id paths. */
  longestChains: string[][]
  /** Length (quest count) of the longest chain. */
  maxChainLength: number
}

function dependencyPairs(graph: QuestGraphData): Array<{ source: string; target: string }> {
  return graph.edges
    .filter((e) => e.edge_type === 'prerequisite' || e.edge_type === 'optional')
    .map((e) => ({ source: e.source, target: e.target }))
}

/** Root quests: no incoming dependency edges (the graph's entry points). */
export function rootQuests(graph: QuestGraphData): Set<string> {
  const hasIncoming = new Set(dependencyPairs(graph).map((e) => e.target))
  return new Set(graph.nodes.map((n) => n.id).filter((id) => !hasIncoming.has(id)))
}

/** Quest ids reachable from the root set via dependency edges. */
export function reachableQuests(graph: QuestGraphData): Set<string> {
  const pairs = dependencyPairs(graph)
  const bySource = new Map<string, string[]>()
  for (const e of pairs) {
    const list = bySource.get(e.source) ?? []
    list.push(e.target)
    bySource.set(e.source, list)
  }
  const roots = rootQuests(graph)
  const seen = new Set<string>()
  const stack = [...roots]
  while (stack.length > 0) {
    const id = stack.pop()!
    if (seen.has(id)) continue
    seen.add(id)
    for (const next of bySource.get(id) ?? []) stack.push(next)
  }
  return seen
}

/**
 * Bottleneck score for a quest: how many quests become unreachable from the
 * root set when this quest is removed. Higher = gates more of the graph.
 *
 * Model: removing the quest removes it AND every edge incident to it. A
 * downstream quest is lost only when EVERY path from the roots passes through
 * the removed quest — removing edges must not promote a downstream quest to a
 * root (a node with no incoming edges is only a root if it was one before).
 * O(n·(n+e)) — fine for pack-sized graphs, kept out of the fast path.
 */
export function bottleneckScore(graph: QuestGraphData, questId: string): number {
  const allEdges = dependencyPairs(graph)
  const edges = allEdges.filter((e) => e.source !== questId && e.target !== questId)
  const bySource = new Map<string, string[]>()
  for (const e of edges) {
    const list = bySource.get(e.source) ?? []
    list.push(e.target)
    bySource.set(e.source, list)
  }
  // Roots are the ORIGINAL roots, minus the removed quest itself. Downstream
  // quests whose only path went through the removed quest simply vanish —
  // they are not re-promoted to roots.
  const roots = rootQuests(graph)
  roots.delete(questId)
  const seen = new Set<string>()
  const stack = [...roots]
  while (stack.length > 0) {
    const id = stack.pop()!
    if (seen.has(id)) continue
    seen.add(id)
    for (const next of bySource.get(id) ?? []) stack.push(next)
  }
  // Unreachable = all quests minus (reachable ∪ the removed quest itself).
  const all = new Set(graph.nodes.map((n) => n.id))
  const reachable = new Set([...seen].filter((id) => id !== questId))
  return all.size - reachable.size - 1
}

/** Walls: quests that are the ONLY path to any OTHER quest — removing them
 *  strands a non-empty downstream subgraph (`bottleneckScore > 0`). Roots are
 *  never walls: they are entry points, and their removal strands the graph by
 *  definition — not a gated progression stage. */
export function findWalls(graph: QuestGraphData): string[] {
  const roots = rootQuests(graph)
  return graph.nodes
    .filter((n) => !n.optional)
    .map((n) => n.id)
    .filter((id) => !roots.has(id) && bottleneckScore(graph, id) > 0)
}

/**
 * Bottlenecks: quests that gate a DISPROPORTIONATE share of the graph —
 * removing them disconnects more than half of all quests. An explicit
 * measurement threshold, not an opinion label (Trust Rule).
 */
export function findBottlenecks(graph: QuestGraphData): string[] {
  const total = graph.nodes.length
  if (total === 0) return []
  return graph.nodes
    .filter((n) => !n.optional)
    .map((n) => n.id)
    .filter((id) => {
      const gates = dependencyPairs(graph).filter((e) => e.source === id)
      if (gates.length === 0) return false
      return bottleneckScore(graph, id) > total / 2
    })
}

/** Longest dependency chains (pacing). Top N by length. Cycle-safe: quest
 *  graphs can contain dependency cycles (reported separately by the structure
 *  check); a chain path never repeats a quest. */
export function findLongestChains(graph: QuestGraphData, max: number = 5): string[][] {
  const pairs = dependencyPairs(graph)
  const bySource = new Map<string, string[]>()
  for (const e of pairs) {
    const list = bySource.get(e.source) ?? []
    list.push(e.target)
    bySource.set(e.source, list)
  }
  const longestFrom = (id: string, path: Set<string>): { length: number; path: string[] } => {
    const next = (bySource.get(id) ?? []).filter((n) => !path.has(n))
    if (next.length === 0) return { length: 1, path: [id] }
    let best = { length: 0, path: [] as string[] }
    for (const n of next) {
      const sub = longestFrom(n, new Set(path).add(id))
      if (sub.length > best.length) best = sub
    }
    return { length: best.length + 1, path: [id, ...best.path] }
  }
  const all: Array<{ length: number; path: string[] }> = []
  for (const node of graph.nodes) all.push(longestFrom(node.id, new Set()))
  all.sort((a, b) => b.length - a.length)
  return all.slice(0, max).map((c) => c.path)
}

export function computeTopology(graph: QuestGraphData): TopologyMetrics {
  const longestChains = findLongestChains(graph)
  return {
    bottlenecks: findBottlenecks(graph),
    walls: findWalls(graph),
    longestChains,
    maxChainLength: longestChains.length > 0 ? longestChains[0].length : 0,
  }
}
