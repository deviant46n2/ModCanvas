import type {
  QuestNodeData,
  QuestObjectiveData,
  QuestRewardData,
} from '../../services/api'

export const SHAPES = [
  { value: 'default', label: 'Default' },
  { value: 'circle', label: 'Circle' },
  { value: 'square', label: 'Square' },
  { value: 'rounded_square', label: 'Rounded Square' },
  { value: 'diamond', label: 'Diamond' },
  { value: 'pentagon', label: 'Pentagon' },
  { value: 'hexagon', label: 'Hexagon' },
  { value: 'octagon', label: 'Octagon' },
  { value: 'heart', label: 'Heart' },
  { value: 'gear', label: 'Gear' },
]

export const PROGRESSION_MODES = [
  { value: 'default', label: 'Inherit from Chapter' },
  { value: 'linear', label: 'Linear (must complete in order)' },
  { value: 'flexible', label: 'Flexible (any order)' },
]

export function generateFtbHexId(): string {
  const array = new Uint8Array(8)
  crypto.getRandomValues(array)
  return Array.from(array, byte => byte.toString(16).padStart(2, '0').toUpperCase()).join('')
}

export function defaultObjective(): QuestObjectiveData {
  return {
    id: generateFtbHexId(),
    label: '',
    objective_type: 'item_acquisition',
    target: '',
    target_count: 1,
    required: true,
    item_tag: '', nbt_data: '', smart_filter: '', consume_items: false,
    match_nbt: false, ignore_nbt: false, exact_match: false, task_screen_only: false, only_from_crafting: false, match_components: false,
    fluid_id: '', fluid_amount: 0, energy_amount: 0, energy_unit: 'FE',
    xp_levels: 0, xp_points: 0, command: '', dimension: '',
    x: 0, y: 0, z: 0, radius: 0,
    box_w: 0, box_h: 0, box_d: 0, ignore_dim: false,
    entity_id: '', advancement_id: '', custom_json: '', description: '',
    stat_name: '', stat_value: 0, biome_id: '', structure_id: '',
    observation_range: 4, custom_name: '', entity_type_tag: '', nbt_filter: '',
    team_stage: false, criterion: '',
  }
}

export function defaultReward(): QuestRewardData {
  return {
    id: generateFtbHexId(),
    label: '',
    reward_type: 'item',
    items: [],
    description: '',
    item_id: '', item_tag: '', item_count: 1, nbt_data: '', smart_filter: '',
    xp_amount: 0, xp_levels: 0, command: '', loot_table: '',
    game_stage: '', weight: 1.0, reward_chests: [], team_reward: false,
    toast_message: '', table_id: '', choices: [], advancement_id: '',
    random_bonus: 0.0, only_one: false, permission_level: 0, silent: false,
    feedback_message: '', autoclaim: '', exclude_from_claim_all: false,
    ignore_reward_blocking: false, disable_reward_screen_blur: false,
  }
}

export function defaultQuestNodeData(overrides?: Partial<QuestNodeData>): QuestNodeData {
  return {
    id: generateFtbHexId(),
    node_type: 'quest',
    label: 'New Quest',
    description: '',
    position: { x: 0, y: 0 },
    data: {},
    objectives: [],
    rewards: [],
    required_items: [],
    chapter_id: null,
    icon: '',
    size: { width: 24, height: 24 },
    color: '',
    visibility: 'normal',
    optional: false,
    silently_complete: false,
    can_be_repeatable: false,
    repeat_cooldown: 0,
    hide_quest_until_deps_complete: false,
    hide_quest_until_quest_complete: false,
    hide_quest_until_all_complete: false,
    disable_reward: false,
    pause_reward: false,
    lock_icon: '',
    hide_lock_icon: false,
    guide_page: '',
    max_completable_dependents: 0,
    subtitle: '',
    quest_background: '',
    shape: 'default',
    icon_scaling: 1.0,
    tags: [],
    progression_mode: 'default',
    sequential_tasks: false,
    disable_completion_toast: false,
    ignore_reward_blocking: false,
    disable_jei_recipe: false,
    min_window_width: 0,
    hide_details_until_startable: false,
    hide_text_until_completed: false,
    invisible_until_completed: false,
    invisible_until_x_tasks: 0,
    hide_dependency_lines: false,
    hide_dependent_lines: false,
    min_required_dependencies: 0,
    dependency_requirement: 'all_completed',
    link_target: '',
    ...overrides,
  }
}
