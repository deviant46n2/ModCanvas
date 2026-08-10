// Core quest-entity types (chapters, objectives, rewards, quest nodes). Split
// out of `quest-types.ts`; the graph/analysis/registry types import from here.

export interface QuestSize {
  width: number
  height: number
}

export interface ChapterImage {
  x: number
  y: number
  width: number
  height: number
  rotation: number
  image: string
  scale: number
  order: number
  alpha: number
  color: number
  click: string
  hover: string[]
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
  images: ChapterImage[]
  subtitle: string
  default_min_width: number
  always_invisible: boolean
  default_hide_dependency_lines: boolean
  hide_quest_details_until_startable: boolean
  hide_quest_until_deps_visible: boolean
  hide_quest_until_deps_complete: boolean
  hide_text_until_complete: boolean
  autofocus_id: string
  default_repeatable: boolean
  require_sequential_tasks: boolean
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
  smart_filter: string
  consume_items: boolean
  match_nbt: boolean
  ignore_nbt: boolean
  exact_match: boolean
  task_screen_only: boolean
  only_from_crafting: boolean
  match_components: boolean
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
  box_w: number
  box_h: number
  box_d: number
  ignore_dim: boolean
  entity_id: string
  advancement_id: string
  custom_json: string
  description: string
  stat_name: string
  stat_value: number
  biome_id: string
  structure_id: string
  observation_range: number
  custom_name: string
  entity_type_tag: string
  nbt_filter: string
  team_stage: boolean
  criterion: string
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
  count: number
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
  random_bonus: number
  only_one: boolean
  permission_level: number
  silent: boolean
  feedback_message: string
  autoclaim: string
  exclude_from_claim_all: boolean
  ignore_reward_blocking: boolean
  disable_reward_screen_blur: boolean
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
  repeat_cooldown: number
  hide_quest_until_deps_complete: boolean
  hide_quest_until_quest_complete: boolean
  hide_quest_until_all_complete: boolean
  disable_reward: boolean
  pause_reward: boolean
  lock_icon: string
  hide_lock_icon: boolean
  guide_page: string
  max_completable_dependents: number
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
  link_target?: string
}
