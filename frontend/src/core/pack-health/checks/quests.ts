// Quest-pack health checks. Pure, deterministic, unit-testable.
//
// Consumes only the already-materialized quest graph plus the pack's item
// registry (the same registry the icon picker uses). No I/O, no IPC — per
// Project Bible §9.2 the panel must be a pure function of cached state.
//
// Trust guardrails (Project Bible §4): we only flag references we can verify
// without guessing. Tags (`#...`) and un-namespaced strings are skipped, and
// smart-filter DSL is parsed with the real parser so `not(...)` members never
// produce findings.

import type {
  QuestGraphData,
  QuestNodeData,
  QuestObjectiveData,
  QuestRewardData,
} from '../../../services/quest-types'
import { findCycles } from '../../validation/quest-validator'
import { smartFilterMembers } from '../../quest/smart-filter'
import type { HealthItem } from '../types'

const ITEM_OBJECTIVE_TYPES = new Set([
  'item_acquisition',
  'item_retrieval',
  'item_crafting',
  'block_break',
  'block_place',
])

const TABLE_REWARD_TYPES = new Set(['choice', 'random', 'all_table'])

interface QuestReference {
  questId: string
  questLabel: string
  field: string
  raw: string
}

/**
 * Normalize a raw item reference into a checkable namespaced id, or `null`
 * when it cannot be verified without risk of a false positive (empty, a tag,
 * or missing a namespace).
 */
export function normalizeItemReference(raw: string): string | null {
  let s = (raw ?? '').trim()
  if (!s) return null
  if (s.startsWith('"') && s.endsWith('"')) s = s.slice(1, -1).trim()
  const first = s.split(/\s+/)[0] ?? ''
  if (!first || first.startsWith('#')) return null
  const colon = first.indexOf(':')
  if (colon <= 0 || colon === first.length - 1) return null
  return first
}

function smartFilterItemRefs(dsl: string, questId: string, questLabel: string): QuestReference[] {
  return smartFilterMembers(dsl)
    .filter((m): m is { type: 'item'; id: string } => m.type === 'item')
    .map((m) => ({ questId, questLabel, field: 'smart filter', raw: m.id }))
}

function collectObjectiveReferences(
  o: QuestObjectiveData,
  questId: string,
  questLabel: string,
): QuestReference[] {
  const refs: QuestReference[] = []
  if (ITEM_OBJECTIVE_TYPES.has(o.objective_type) && o.target) {
    refs.push({ questId, questLabel, field: o.objective_type, raw: o.target })
  }
  refs.push(...smartFilterItemRefs(o.smart_filter, questId, questLabel))
  return refs
}

function collectRewardReferences(
  r: QuestRewardData,
  questId: string,
  questLabel: string,
): QuestReference[] {
  const refs: QuestReference[] = []
  if ((r.reward_type === 'item' || r.reward_type === 'item_weighted') && r.item_id) {
    refs.push({ questId, questLabel, field: 'reward', raw: r.item_id })
  }
  if (TABLE_REWARD_TYPES.has(r.reward_type)) {
    for (const id of r.items ?? []) {
      refs.push({ questId, questLabel, field: 'reward', raw: id })
    }
  }
  refs.push(...smartFilterItemRefs(r.smart_filter, questId, questLabel))
  return refs
}

function collectNodeReferences(node: QuestNodeData): QuestReference[] {
  const refs: QuestReference[] = []
  for (const o of node.objectives ?? []) refs.push(...collectObjectiveReferences(o, node.id, node.label))
  for (const r of node.rewards ?? []) refs.push(...collectRewardReferences(r, node.id, node.label))
  for (const id of node.required_items ?? []) {
    refs.push({ questId: node.id, questLabel: node.label, field: 'required items', raw: id })
  }
  return refs
}

function missingItemChecks(graph: QuestGraphData, knownIds: Set<string>): HealthItem[] {
  const items: HealthItem[] = []
  const seen = new Set<string>()
  for (const node of graph.nodes) {
    for (const ref of collectNodeReferences(node)) {
      const id = normalizeItemReference(ref.raw)
      if (!id || knownIds.has(id)) continue
      const dedupeKey = `${ref.questId}|${ref.field}|${id}`
      if (seen.has(dedupeKey)) continue
      seen.add(dedupeKey)
      items.push({
        id: `quest.missing-item.${ref.questId}.${ref.field}.${id}`,
        // Recommended, never blocking: the scanned item registry cannot prove an
        // item is absent (KubeJS/data-driven/custom items are not in the jar
        // scan, and imported packs have no vanilla jar). Trust Rule (§4) — the
        // panel must not call a released pack "blocking" over a scan gap.
        severity: 'recommended',
        message: `"${ref.questLabel || ref.questId}" references "${id}" (${ref.field}) which is not in the pack's item registry.`,
        detail: 'Could be a custom/KubeJS/datapack item outside the jar scan — verify it exists.',
        copyText: `Quest "${ref.questLabel}" (${ref.questId}) references "${id}" (${ref.field}), which is not in the pack's scanned item registry.`,
        target: { section: 'quests', nodeId: ref.questId },
      })
    }
  }
  return items
}

/** Count how many quest item references the registry actually resolves, as a
 * fraction. `{ total: 0, found: 0 }` when there is nothing checkable. Used by
 * the analyzer to decide whether the registry is trustworthy enough to surface
 * item-existence findings at all. */
export function questItemCoverage(
  graph: QuestGraphData,
  knownIds: Set<string>,
): { total: number; found: number } {
  let total = 0
  let found = 0
  const seen = new Set<string>()
  const consider = (raw: string) => {
    const id = normalizeItemReference(raw)
    if (!id) return
    const key = id
    if (seen.has(key)) return
    seen.add(key)
    total++
    if (knownIds.has(id)) found++
  }
  for (const node of graph.nodes) {
    for (const ref of collectNodeReferences(node)) consider(ref.raw)
  }
  return { total, found }
}

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

/**
 * Normalize a reward-table id to FTB's canonical 16-digit uppercase hex form.
 * FTB keys reward tables by `Long.toHexString(longId)` uppercased (e.g.
 * `00000000DEADBEEF`) while quest files reference the raw numeric id; the
 * importer resolves these with `RewardTable::to_long_id` on both sides. The
 * health check must do the same or every table reference looks "undefined".
 * Non-hex ids are returned unchanged.
 */
export function normalizeTableId(raw: string): string {
  const t = (raw ?? '').trim().replace(/^#/, '')
  if (/^[0-9a-fA-F]{1,16}$/.test(t)) {
    return BigInt(`0x${t}`).toString(16).toUpperCase().padStart(16, '0')
  }
  return t
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

/** Item-reference checks — only meaningful when the item registry is populated
 * and trustworthy (see the analyzer's degraded-registry guard). Never blocking. */
export function checkQuestItemRefs(graph: QuestGraphData, knownIds: Set<string>): HealthItem[] {
  return missingItemChecks(graph, knownIds)
}

/** All quest checks (structure + item refs). Convenience for tests and callers
 * that already know the registry is trustworthy. */
export function checkQuests(graph: QuestGraphData, knownIds: Set<string>): HealthItem[] {
  return [...checkQuestStructure(graph), ...checkQuestItemRefs(graph, knownIds)]
}
