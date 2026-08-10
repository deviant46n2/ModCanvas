// Shared quest-check helpers: reference collection + normalization. Split out
// of `checks/quests.ts`; used by both the structure and item-reference checks.

import { smartFilterMembers } from '../../../quest/smart-filter'
import type { QuestNodeData, QuestObjectiveData, QuestRewardData } from '../../../../services/quest-types'

export const ITEM_OBJECTIVE_TYPES = new Set([
  'item_acquisition',
  'item_retrieval',
  'item_crafting',
  'block_break',
  'block_place',
])

export const TABLE_REWARD_TYPES = new Set(['choice', 'random', 'all_table'])

export interface QuestReference {
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

export function collectObjectiveReferences(
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

export function collectRewardReferences(
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

export function collectNodeReferences(node: QuestNodeData): QuestReference[] {
  const refs: QuestReference[] = []
  for (const o of node.objectives ?? []) refs.push(...collectObjectiveReferences(o, node.id, node.label))
  for (const r of node.rewards ?? []) refs.push(...collectRewardReferences(r, node.id, node.label))
  for (const id of node.required_items ?? []) {
    refs.push({ questId: node.id, questLabel: node.label, field: 'required items', raw: id })
  }
  return refs
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
