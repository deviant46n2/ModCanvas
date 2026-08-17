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
//
// Implementation split: reference helpers in `./quests/shared`, structural
// checks in `./quests/structure`, and item-reference checks in `./quests/items`.

import type { QuestGraphData } from '../../../services/quest-types'
import type { HealthItem } from '../types'
import { checkQuestStructure } from './quests/structure'
import { checkQuestItemRefs } from './quests/items'

export { normalizeItemReference, normalizeTableId } from './quests/shared'
export { questItemCoverage, checkQuestItemRefs } from './quests/items'
export { checkQuestStructure } from './quests/structure'
export { checkQuestAvailability } from './quests/availability'

/** All quest checks (structure + item refs). Convenience for tests and callers
 *  that already know the registry is trustworthy. */
export function checkQuests(graph: QuestGraphData, knownIds: Set<string>): HealthItem[] {
  return [...checkQuestStructure(graph), ...checkQuestItemRefs(graph, knownIds)]
}
