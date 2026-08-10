// Structural quest checks: provable from the graph alone (cycles, undefined
// reward tables, empty chapters, unreachable quests, unused tables) — the only
// quest checks that can be blocking. Split out of `checks/quests.ts`.

import type { QuestGraphData } from '../../../../services/quest-types'
import { findCycles } from '../../../validation/quest-validator'
import { normalizeTableId } from './shared'
import type { HealthItem } from '../../types'

function dependencyEdgePairs(graph: QuestGraphData): Array<{ source: string; target: string }> {
  return graph.edges
    .filter((e) => e.edge_type === 'prerequisite' || e.edge_type === 'optional')
    .map((e) => ({ source: e.source, target: e.target }))
}

function cycleChecks(graph: QuestGraphData): HealthItem[] {
  const pairs = dependencyEdgePairs(graph)
  const cycles = findCycles(pairs.map((e) => ({ source: e.source, target: e.target })))
  if (cycles.length === 0) return []
  const labelById = new Map(graph.nodes.map((n) => [n.id, n.label]))
  return cycles.slice(0, 10).map((cycle, i) => {
    const path = cycle.map((id) => labelById.get(id) || id).join(' → ')
    return {
      id: `quest.dependency-cycle.${i}.${cycle.join('+')}`,
      severity: 'blocking',
      message: `Circular dependency detected: ${path}`,
      detail: 'Locked quests in the cycle can never all complete.',
      copyText: `Circular dependency: ${path}`,
      target: { section: 'quests', nodeId: cycle[0] },
    }
  })
}

function undefinedRewardTableChecks(graph: QuestGraphData): HealthItem[] {
  const items: HealthItem[] = []
  const known = new Set(graph.reward_tables.map((t) => normalizeTableId(t.id)))
  const seen = new Set<string>()
  for (const node of graph.nodes) {
    for (const r of node.rewards ?? []) {
      if (!r.table_id || known.has(normalizeTableId(r.table_id))) continue
      const key = `${node.id}|${r.id}`
      if (seen.has(key)) continue
      seen.add(key)
      items.push({
        id: `quest.undefined-reward-table.${key}`,
        severity: 'blocking',
        message: `"${node.label || node.id}" references reward table "${r.table_id}" which is not defined.`,
        detail: 'A random/choice/all-table reward points at a table that no longer exists.',
        copyText: `Quest "${node.label}" (${node.id}) references undefined reward table "${r.table_id}".`,
        target: { section: 'quests', nodeId: node.id },
      })
    }
  }
  return items
}

function emptyChapterChecks(graph: QuestGraphData): HealthItem[] {
  const items: HealthItem[] = []
  const countByChapter = new Map<string, number>()
  for (const node of graph.nodes) {
    if (!node.chapter_id) continue
    countByChapter.set(node.chapter_id, (countByChapter.get(node.chapter_id) ?? 0) + 1)
  }
  for (const chapter of graph.chapters) {
    if ((countByChapter.get(chapter.id) ?? 0) > 0) continue
    items.push({
      id: `quest.empty-chapter.${chapter.id}`,
      severity: 'recommended',
      message: `Chapter "${chapter.title}" has no quests.`,
      detail: 'An empty chapter leaves the book feeling unfinished.',
      copyText: `Chapter "${chapter.title}" (${chapter.id}) has no quests.`,
      target: { section: 'quests' },
    })
  }
  return items
}

function unreachableQuestChecks(graph: QuestGraphData): HealthItem[] {
  const nodeIds = new Set(graph.nodes.map((n) => n.id))
  const pairs = dependencyEdgePairs(graph)
  const incoming = new Map<string, number>()
  const outgoing = new Map<string, string[]>()
  for (const id of nodeIds) {
    incoming.set(id, 0)
    outgoing.set(id, [])
  }
  for (const e of pairs) {
    if (!nodeIds.has(e.source) || !nodeIds.has(e.target)) continue
    incoming.set(e.target, (incoming.get(e.target) ?? 0) + 1)
    outgoing.get(e.source)!.push(e.target)
  }

  const roots = [...nodeIds].filter((id) => (incoming.get(id) ?? 0) === 0)
  const reachable = new Set<string>()
  const stack = [...roots]
  while (stack.length > 0) {
    const id = stack.pop()!
    if (reachable.has(id)) continue
    reachable.add(id)
    for (const next of outgoing.get(id) ?? []) stack.push(next)
  }

  const items: HealthItem[] = []
  for (const node of graph.nodes) {
    if (reachable.has(node.id)) continue
    items.push({
      id: `quest.unreachable.${node.id}`,
      severity: 'recommended',
      message: `"${node.label || node.id}" is unreachable — no dependency path leads to it.`,
      detail: 'Players can never start this quest.',
      copyText: `Quest "${node.label}" (${node.id}) is unreachable (no dependency path from a root quest).`,
      target: { section: 'quests', nodeId: node.id },
    })
  }
  return items
}

function unusedRewardTableChecks(graph: QuestGraphData): HealthItem[] {
  const referenced = new Set<string>()
  for (const node of graph.nodes) {
    for (const r of node.rewards ?? []) {
      if (r.table_id) referenced.add(normalizeTableId(r.table_id))
    }
  }
  const items: HealthItem[] = []
  for (const table of graph.reward_tables) {
    if (referenced.has(normalizeTableId(table.id))) continue
    items.push({
      id: `quest.unused-reward-table.${table.id}`,
      severity: 'recommended',
      message: `Reward table "${table.title || table.id}" is never referenced by a quest.`,
      detail: 'Unused tables add clutter but do not break the pack.',
      copyText: `Reward table "${table.title || table.id}" (${table.id}) is unused.`,
      target: { section: 'quests' },
    })
  }
  return items
}

/** Structural quest checks — always safe to run and always truthful. These are
 * provable from the graph alone, so they are the only quest checks that can be
 * blocking. */
export function checkQuestStructure(graph: QuestGraphData): HealthItem[] {
  return [
    ...cycleChecks(graph),
    ...undefinedRewardTableChecks(graph),
    ...emptyChapterChecks(graph),
    ...unreachableQuestChecks(graph),
    ...unusedRewardTableChecks(graph),
  ]
}
