// Graph-level quest types: edges, reward tables and the top-level book graph.
// Split out of `quest-types.ts`; imports the core entity types from `./quest`.

import type {
  QuestChapter,
  QuestChapterGroup,
  QuestNodeData,
  QuestRewardData,
} from './quest'

export interface EdgeControlPoint {
  x: number
  y: number
}

export interface EdgeBezierRel {
  sourceControl: EdgeControlPoint
  targetControl: EdgeControlPoint
}

export interface QuestEdgeData {
  id: string
  source: string
  target: string
  label: string | null
  edge_type: string
  inverted: boolean
  // Optional manual curvature. Control points are offsets relative to the
  // source/target handle anchors so the curve tracks its quests. Editor-only:
  // FTB's quest format has no field for them, so they are not exported to SNBT.
  bezier?: EdgeBezierRel | null
}

export interface RewardTableData {
  id: string
  title: string
  order_index: number
  loot_size: number
  empty_weight: number
  hide_tooltip: boolean
  use_title: boolean
  rewards: QuestRewardData[]
}

export interface EmergencyItem {
  id: string
  count: number
}

export interface LootCrateNoDrop {
  boss: number
  monster: number
  passive: number
}

export interface QuestGraphData {
  id: string
  project_id: string
  name: string
  description: string
  chapters: QuestChapter[]
  chapter_groups: QuestChapterGroup[]
  reward_tables: RewardTableData[]
  nodes: QuestNodeData[]
  edges: QuestEdgeData[]
  book_progression_mode: string
  book_icon: string
  book_background_image: string
  quest_color: string
  default_quest_shape: string
  grid_scale: number
  default_reward_team?: boolean
  default_consume_items?: boolean
  default_autoclaim_rewards?: string
  detection_delay?: number
  emergency_items?: EmergencyItem[]
  emergency_items_cooldown?: number
  lock_message?: string
  show_lock_icons?: boolean
  fallback_locale?: string
  disable_gui?: boolean
  pause_game?: boolean
  drop_book_on_death?: boolean
  drop_loot_crates?: boolean
  hide_excluded_quests?: boolean
  verify_on_load?: boolean
  default_quest_disable_jei?: boolean
  loot_crate_no_drop?: LootCrateNoDrop
  // Book-level visual preset fields (editor-only, not exported to SNBT).
  edge_color?: string
  edge_cycle_color?: string
  active_theme?: string
}
