// Item-reference quest checks: which references the registry cannot resolve,
// plus the coverage metric the analyzer uses to decide if the registry is
// trustworthy enough to surface findings at all. Never blocking. Split out of
// `checks/quests.ts`.

import type { QuestGraphData } from '../../../../services/quest-types'
import { collectNodeReferences, normalizeItemReference } from './shared'
import type { HealthItem } from '../../types'

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

/** Item-reference checks — only meaningful when the item registry is populated
 * and trustworthy (see the analyzer's degraded-registry guard). Never blocking. */
export function checkQuestItemRefs(graph: QuestGraphData, knownIds: Set<string>): HealthItem[] {
  return missingItemChecks(graph, knownIds)
}
