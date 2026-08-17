// Quest-task availability check (P1-HEALTH-2, roadmap §10.2): which quest
// tasks cannot be satisfied because the pack has no recipe for the required
// item. SHARP SCOPE by student ruling (s68): only objectives that ASSERT
// crafting — `item_crafting` tasks, or acquisition/retrieval tasks marked
// `only_from_crafting` — are checked. A plain acquisition task ("get oak
// logs") with no recipe is NOT a finding: the item can be mined, looted, or
// otherwise obtained, and the check cannot prove otherwise (Trust Rule —
// measurements, never opinions).
//
// Craftability comes from the Pack Index's `recipe_outputs` (distinct recipe
// output ids) — NOT the `references` list, which confluates output and
// ingredient. Recommended severity, never blocking: the recipe scan cannot
// prove absence (a custom recipe outside data/ + kubejs + scripts/ could
// exist), same Trust Rule as item-existence checks.

import type { QuestGraphData } from '../../../../services/quest-types'
import { ITEM_OBJECTIVE_TYPES, collectObjectiveReferences, normalizeItemReference } from './shared'
import type { HealthItem } from '../../types'

/** Objective types where `only_from_crafting` is a meaningful assertion. */
const CRAFTABLE_ONLY_TYPES = new Set(['item_acquisition', 'item_retrieval'])

/** True when the objective asserts the item must be crafted: an item_crafting
 *  task by definition, or an acquisition/retrieval task marked only-from-
 *  crafting. The sharp-scope gate — everything else is never flagged. */
function assertsCrafting(
  objectiveType: string,
  onlyFromCrafting: boolean,
): boolean {
  if (objectiveType === 'item_crafting') return true
  return onlyFromCrafting && CRAFTABLE_ONLY_TYPES.has(objectiveType)
}

/**
 * Availability findings: quest tasks that assert crafting of an item with no
 * recipe output in the pack. One finding per (quest, item); the same item in
 * two objectives of one quest is one finding. Rewards and node-level
 * `required_items` are never checked (they carry no crafting assertion).
 */
export function checkQuestAvailability(
  graph: QuestGraphData,
  recipeOutputs: Set<string>,
): HealthItem[] {
  const items: HealthItem[] = []
  const seen = new Set<string>()
  for (const node of graph.nodes) {
    for (const objective of node.objectives ?? []) {
      if (!ITEM_OBJECTIVE_TYPES.has(objective.objective_type)) continue
      if (!assertsCrafting(objective.objective_type, objective.only_from_crafting)) continue
      for (const ref of collectObjectiveReferences(objective, node.id, node.label)) {
        const id = normalizeItemReference(ref.raw)
        if (!id || recipeOutputs.has(id)) continue
        const dedupeKey = `${node.id}|${id}`
        if (seen.has(dedupeKey)) continue
        seen.add(dedupeKey)
        items.push({
          id: `quest.no-recipe.${node.id}.${id}`,
          // Recommended, never blocking: the recipe scan (data/ + kubejs +
          // scripts/) cannot prove a recipe is absent — a mod could register
          // one at runtime. Trust Rule (§4).
          severity: 'recommended',
          message: `"${ref.questLabel || ref.questId}" requires crafting "${id}" (${ref.field}) but no recipe for it was found in the pack.`,
          detail: 'Only-from-crafting tasks complete only when the item is crafted; verify the recipe exists (a mod may register it at runtime).',
          copyText: `Quest "${ref.questLabel}" (${ref.questId}) requires crafting "${id}" (${ref.field}), but no recipe for it was found in the pack.`,
          target: { section: 'quests', nodeId: ref.questId },
        })
      }
    }
  }
  return items
}
