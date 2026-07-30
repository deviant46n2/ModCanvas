export interface QuestSize {
  width: number
  height: number
}

export interface QuestChapter {
  id: string
  title: string
  description: string
  icon: string
  background_image: string
  order_index: number
  hide_until_first_quest_complete: boolean
  default_quest_size: { width: number; height: number }
  quest_color: string
  group_id: string | null
  default_quest_shape: string
  default_enabled: boolean
  progression_mode: string
}

export interface QuestChapterGroup {
  id: string
  title: string
  description: string
  icon: string
  order_index: number
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

export interface QuestNodeData {
  id: string
  node_type: string
  label: string
  description: string
  position: { x: number; y: number }
  data: Record<string, string>
  objectives: QuestObjectiveData[]
  rewards: QuestRewardData[]
  required_items: string[]
  chapter_id: string | null
  icon: string
  size: QuestSize
  color: string
  visibility: string
  optional: boolean
  silently_complete: boolean
  can_be_repeatable: boolean
  repeat_min_delay: number
  repeat_max_delay: number
  repeat_time: number
  hide_quest_until_deps_complete: boolean
  hide_quest_until_quest_complete: boolean
  hide_quest_until_all_complete: boolean
  disable_reward: boolean
  pause_reward: boolean
  lock_icon: string
  subtitle: string
  quest_background: string
  shape: string
  icon_scaling: number
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
}

export interface QuestEdgeData {
  id: string
  source: string
  target: string
  label: string | null
  edge_type: string
  inverted: boolean
}

export interface QuestGraphData {
  id: string
  project_id: string
  name: string
  description: string
  chapters: QuestChapter[]
  chapter_groups: QuestChapterGroup[]
  nodes: QuestNodeData[]
  edges: QuestEdgeData[]
  book_progression_mode: string
  book_icon: string
  book_background_image: string
  quest_color: string
  default_quest_size: QuestSize
  default_quest_shape: string
}

export interface QuestAnalysis {
  total_quests: number
  total_chapters: number
  total_objectives: number
  total_rewards: number
  orphaned_quests: Array<{ quest_id: string; quest_label: string }>
  incomplete_quests: Array<{ quest_id: string; quest_label: string; missing_objectives: number; missing_rewards: boolean }>
  chapters: Array<{ chapter_id: string; chapter_label: string; quest_count: number }>
  issues: Array<{ severity: string; message: string; node_id: string | null }>
}

export interface FtbQuestsImportResult {
  graph: QuestGraphData
  format: string
  layout: string
  quest_count: number
  chapter_count: number
}
