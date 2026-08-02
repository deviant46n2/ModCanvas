export interface QuestTileData {
  id: string
  label: string
  description: string
  subtitle: string
  icon: string
  iconDataUrl: string
  color: string
  shape: string
  size: { width: number; height: number }
  icon_scaling: number
  nodeType: string
  optional: boolean
  visibility: string
  objectives: QuestObjectiveData[]
  rewards: QuestRewardData[]
  can_be_repeatable: boolean
  silently_complete: boolean
  repeat_cooldown: number
  lock_icon: string
  hide_lock_icon: boolean
  guide_page: string
  max_completable_dependents: number
  quest_background: string
  tags: string[]
  progression_mode: string
  sequential_tasks: boolean
  disable_completion_toast: boolean
  ignore_reward_blocking: boolean
  disable_jei_recipe: boolean
  min_window_width: number
  hide_details_until_startable: boolean
  hide_text_until_completed: boolean
  invisible_until_completed: boolean
  invisible_until_x_tasks: number
  hide_dependency_lines: boolean
  hide_dependent_lines: boolean
  min_required_dependencies: number
  dependency_requirement: string
  textureIndex?: Record<string, string>
  onUpdateNode?: (id: string, data: Partial<QuestTileData>) => void
  onAddObjective?: (nodeId: string) => void
  onAddReward?: (nodeId: string) => void
  onRemoveObjective?: (nodeId: string, objectiveId: string) => void
  onRemoveReward?: (nodeId: string, rewardId: string) => void
  onUpdateObjective?: (nodeId: string, objectiveId: string, field: string, value: unknown) => void
  onUpdateReward?: (nodeId: string, rewardId: string, field: string, value: unknown) => void
  onOpenIconPicker?: (target: 'quest' | 'objective' | 'reward', index?: number) => void
}

export interface QuestObjectiveData {
  id: string
  label: string
  objective_type: string
  target: string
  target_count: number
  required: boolean
  item_tag: string
  nbt_data: string
  smart_filter: string
  consume_items: boolean
  match_nbt: boolean
  ignore_nbt: boolean
  exact_match: boolean
  fluid_id: string
  fluid_amount: number
  energy_amount: number
  energy_unit: string
  xp_levels: number
  xp_points: number
  command: string
  dimension: string
  x: number
  y: number
  z: number
  radius: number
  entity_id: string
  advancement_id: string
  custom_json: string
  description: string
  stat_name: string
  stat_value: number
  biome_id: string
  structure_id: string
  observation_range: number
}

export interface QuestRewardData {
  id: string
  label: string
  reward_type: string
  items: string[]
  description: string
  item_id: string
  item_tag: string
  item_count: number
  nbt_data: string
  smart_filter: string
  xp_amount: number
  xp_levels: number
  command: string
  loot_table: string
  game_stage: string
  weight: number
  reward_chests: string[]
  team_reward: boolean
  toast_message: string
  table_id: string
  choices: string[]
  advancement_id: string
}

export const TILE_WIDTH = 200
export const ICON_SIZE = 32

import { resolveAssetUrl } from '../../services/asset-resolver'

export function getIconUrl(textureIndex: Record<string, string>, itemId: string): string | null {
  if (!itemId) return null
  return resolveAssetUrl(itemId, textureIndex) || null
}

export function getObjectiveIcon(obj: QuestObjectiveData): string | null {
  if (['item', 'item_tag'].includes(obj.objective_type)) return obj.target || obj.item_tag
  return null
}

export function getRewardIcon(rew: QuestRewardData): string | null {
  if (['item', 'item_tag'].includes(rew.reward_type)) return rew.item_id || rew.items[0] || rew.item_tag
  return null
}

export function getFallbackIcon(type: string): string {
  const icons: Record<string, string> = {
    item: '\u{1F4E6}', item_tag: '\u{1F3F7}\uFE0F', fluid: '\u{1F4A7}', energy: '\u26A1',
    xp: '\u2728', entity: '\u{1F47E}', location: '\u{1F4CD}', command: '\u{1F4BB}',
    advancement: '\u{1F3C6}', stat: '\u{1F4CA}', observation: '\u{1F441}\uFE0F', biome: '\u{1F332}', structure: '\u{1F3F0}',
    experience: '\u2728', loot_table: '\u{1F3B0}', game_stage: '\u{1F3AE}', choice: '\u{1F914}',
    xp_levels: '\u2728', toast: '\u{1F4AC}', loot_table_table: '\u{1F3B0}'
  }
  return icons[type] || '\u{1F4E6}'
}

export function resolveIconKey(icon: string): string {
  if (!icon) return ''
  if (icon.includes(':') && !icon.includes('/')) {
    return icon
  }
  if (!icon.includes(':')) {
    return `minecraft:${icon}`
  }
  const parts = icon.split(':')
  if (parts.length === 2) {
    const namespace = parts[0]
    let path = parts[1].replace(/^textures\/(item|block)\//, '').replace(/\.png$/, '')
    if (path.startsWith('block/')) return `${namespace}:${path.substring(6)}`
    if (path.startsWith('item/')) return `${namespace}:${path.substring(5)}`
    return `${namespace}:${path}`
  }
  return icon
}
