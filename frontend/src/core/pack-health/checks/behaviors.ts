// Behavior item-reference checks (P2-BEHAVIOR, roadmap §11.2 / §13): which
// `give_item` targets the registry cannot resolve. Pure, deterministic,
// unit-testable — consumes the already-materialized behaviors list + the
// item registry, no I/O, no IPC (the Pack Health purity rule).
//
// SEVERITY DECISION (s45, Trust Rule): these findings are RECOMMENDED, never
// blocking — the roadmap's "Blocking health finding" line (§11.2) was written
// before the Trust Rule's registry-incompleteness analysis (Project Bible §4;
// see the quest check, checks/quests/items.ts). The scanned registry cannot
// prove an item is absent: custom/KubeJS/data-driven items are outside the
// jar scan, and imported packs have no vanilla jar. A behavior referencing
// `kubejs:custom_item` is "missing" from the registry but valid at runtime;
// a blocking verdict on it would false-GO-block a released pack. Behaviors
// therefore follow the quest rule exactly. The roadmap's "Blocking" line is
// superseded by this decision — recorded as a written deviation.

import type { Behavior } from '../../behavior/behavior-store'
import type { HealthItem } from '../types'
import { normalizeItemReference } from './quests/shared'

/** Count how many behavior item references the registry resolves, as a
 * fraction. `{ total: 0, found: 0 }` when there is nothing checkable. The
 * analyzer folds this into the shared coverage metric so the degraded-
 * registry guard has signal even when only behaviors reference items. */
export function behaviorItemCoverage(
  behaviors: Behavior[],
  knownIds: Set<string>,
): { total: number; found: number } {
  let total = 0
  let found = 0
  const seen = new Set<string>()
  for (const behavior of behaviors) {
    for (const action of behavior.actions) {
      if (action.kind !== 'give_item') continue
      const id = normalizeItemReference(action.item)
      if (!id || seen.has(id)) continue
      seen.add(id)
      total++
      if (knownIds.has(id)) found++
    }
  }
  return { total, found }
}

/** Run all behavior item-reference checks over the authored behavior set. */
export function checkBehaviors(
  behaviors: Behavior[],
  knownIds: Set<string>,
): HealthItem[] {
  const items: HealthItem[] = []
  const seen = new Set<string>()
  for (const behavior of behaviors) {
    for (const action of behavior.actions) {
      if (action.kind !== 'give_item') continue
      const id = normalizeItemReference(action.item)
      if (!id || knownIds.has(id)) continue
      const dedupeKey = `${behavior.id}|${id}`
      if (seen.has(dedupeKey)) continue
      seen.add(dedupeKey)
      items.push({
        id: `behaviors.missing-item.${behavior.id}.${id}`,
        // Recommended, never blocking — same Trust Rule reasoning as quests
        // (checks/quests/items.ts): the registry cannot prove absence.
        severity: 'recommended',
        message: `Behavior "${behavior.name}" gives "${id}" which is not in the pack's item registry.`,
        detail: 'Could be a custom/KubeJS/datapack item outside the jar scan — verify it exists.',
        copyText: `Behavior "${behavior.name}" (${behavior.id}) gives "${id}", which is not in the pack's scanned item registry.`,
        target: { section: 'behaviors' },
      })
    }
  }
  return items
}
