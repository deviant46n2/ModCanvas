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

export interface QuestEdgeData {
  id: string
  source: string
  target: string
  label: string | null
  edge_type: string
  inverted: boolean
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
  default_quest_size: QuestSize
  default_quest_shape: string
  grid_scale: number
  default_reward_team?: boolean
  default_consume_items?: boolean
  default_autoclaim_rewards?: string
  detection_delay?: number
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

export interface PrismInstance {
  name: string
  path: string
}

export interface ImportIssue {
  severity: string
  category: string
  message: string
  file: string | null
  node_id: string | null
}

export interface ImportStats {
  quests_parsed: number
  chapters_parsed: number
  chapter_groups_parsed: number
  tasks_parsed: number
  rewards_parsed: number
  dependencies_resolved: number
  dependencies_missing: number
  unknown_task_types: string[]
  unknown_reward_types: string[]
  files_processed: number
  files_failed: number
  title_from_task: number
  icon_from_task: number
  chapter_images_total: number
}

export interface FtbQuestsImportResult {
  graph: QuestGraphData
  format: string
  layout: string
  quest_count: number
  chapter_count: number
  stats: ImportStats
  issues?: ImportIssue[]
}

export interface ItemRegistryEntry {
  id: string
  name: string
  mod_id: string
  texture_data_url: string | null
}

export interface IngestTextureEntry {
  namespace: string
  path: string
  raw_key: string
  canonical_key: string
  clean_key: string
  data_url: string
}

export interface VirtualAssetRegistry {
  by_id: Record<string, string>
  all_textures: IngestTextureEntry[]
  jars_scanned: number
  textures_indexed: number
}

export interface IngestResult {
  asset_registry: VirtualAssetRegistry
  jars_scanned: number
  textures_indexed: number
  active_instance: string
}
