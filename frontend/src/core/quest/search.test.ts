import { describe, it, expect } from 'vitest';
import { searchQuestNodes } from './search';
import type { QuestNodeData } from '../../services/quest-types';

function node(id: string, label: string, targets: string[] = []): QuestNodeData {
  return {
    id,
    node_type: 'quest',
    label,
    description: '',
    position: { x: 0, y: 0 },
    data: {},
    objectives: targets.map((t) => ({
      id: `o-${id}-${t}`,
      label: '',
      objective_type: 'item',
      target: t,
      target_count: 1,
      required: true,
      item_tag: '',
      nbt_data: '',
      smart_filter: '',
      consume_items: false,
      match_nbt: false,
      ignore_nbt: false,
      exact_match: false,
      task_screen_only: false,
      only_from_crafting: false,
      match_components: false,
      fluid_id: '',
      fluid_amount: 0,
      energy_amount: 0,
      energy_unit: '',
      xp_levels: 0,
      xp_points: 0,
      command: '',
      dimension: '',
      x: 0, y: 0, z: 0,
      radius: 0,
      box_w: 0, box_h: 0, box_d: 0,
      ignore_dim: false,
      entity_id: '',
      advancement_id: '',
      custom_json: '',
      description: '',
      stat_name: '',
      stat_value: 0,
      biome_id: '',
      structure_id: '',
      observation_range: 0,
      custom_name: '',
      entity_type_tag: '',
      nbt_filter: '',
      team_stage: false,
      criterion: '',
    })),
    rewards: [],
    required_items: [],
    chapter_id: null,
    icon: '',
    size: { width: 24, height: 24 },
    color: '',
    visibility: '',
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
    shape: 'circle',
    icon_scaling: 1,
    tags: [],
    progression_mode: '',
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
    dependency_requirement: '',
  };
}

describe('searchQuestNodes', () => {
  const nodes = [
    node('abc', 'Craft a Sword', ['minecraft:iron_sword']),
    node('def', 'Collect Diamonds', ['minecraft:diamond']),
    node('ghi', 'Kill the Warden', ['minecraft:warden']),
  ];

  it('matches against quest labels case-insensitively', () => {
    expect(searchQuestNodes(nodes, 'sword')).toEqual(new Set(['abc']));
    expect(searchQuestNodes(nodes, 'WARDEN')).toEqual(new Set(['ghi']));
  });

  it('matches against objective targets', () => {
    expect(searchQuestNodes(nodes, 'diamond')).toEqual(new Set(['def']));
  });

  it('matches against node ids', () => {
    expect(searchQuestNodes(nodes, 'abc')).toEqual(new Set(['abc']));
  });

  it('returns nothing for an empty or non-matching query', () => {
    expect(searchQuestNodes(nodes, '')).toEqual(new Set());
    expect(searchQuestNodes(nodes, '   ')).toEqual(new Set());
    expect(searchQuestNodes(nodes, 'zzz')).toEqual(new Set());
  });
});
