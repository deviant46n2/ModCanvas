/**
 * Objective/reward types whose in-game icon is a fixed item, not the task's
 * own target: FTB shows the enchanting bottle for every XP task. The drawer
 * resolves these from the instance texture index at runtime (descriptor →
 * lazy materialization — never bundled), so the strip renders the real
 * in-game icon even when the task carries no target item. This is the
 * *single* source: the materialization plan collects these keys (targets.ts)
 * and the slot icons resolve them (quest-slot-icon.tsx), so the two can
 * never drift.
 */
export const TYPE_TEXTURE_KEYS: Record<string, string> = {
  xp: 'minecraft:experience_bottle',
  experience: 'minecraft:experience_bottle',
  xp_levels: 'minecraft:experience_bottle',
}
