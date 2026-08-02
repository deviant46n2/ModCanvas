import type { Node } from '@xyflow/react';
import type { QuestGraphData, QuestObjectiveData, QuestRewardData } from '../../services/api';

export const CHAPTER_SPACING_X = 250;
export const QUEST_SPACING_Y = 160;

export function autoLayoutNodes(nodes: Node[], chapters: QuestGraphData['chapters']): Node[] {
  if (!chapters || chapters.length === 0) return nodes;

  const chapterQuests: Record<string, Node[]> = {};
  for (const node of nodes) {
    if (node.type === 'chapter') continue;
    const chId = (node.data?.chapter_id as string) || chapters[0]?.id || 'default';
    if (!chapterQuests[chId]) chapterQuests[chId] = [];
    chapterQuests[chId].push(node);
  }

  return nodes.map(node => {
    if (node.type === 'chapter') return node;
    const chId = (node.data?.chapter_id as string) || chapters[0]?.id || 'default';
    const chIndex = chapters.findIndex(c => c.id === chId);
    const questsInChapter = chapterQuests[chId] || [];
    const questIndex = questsInChapter.findIndex(q => q.id === node.id);
    const x = (chIndex >= 0 ? chIndex : 0) * CHAPTER_SPACING_X + 100;
    const y = questIndex * QUEST_SPACING_Y + 100;
    const currentX = node.position.x;
    const currentY = node.position.y;
    if (Math.abs(currentX) < 10 && Math.abs(currentY) < 10) {
      return { ...node, position: { x, y } };
    }
    return node;
  });
}

export function generateFtbHexId(): string {
  const array = new Uint8Array(8);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0').toUpperCase()).join('');
}

export function resolveIconKey(icon: string): string {
  if (icon.includes(':') && !icon.includes('/')) return icon;
  if (!icon.includes(':')) return `minecraft:${icon}`;
  const parts = icon.split(':');
  if (parts.length === 2) {
    const namespace = parts[0];
    let path = parts[1];
    path = path.replace(/^textures\/(item|block)\//, '').replace(/\.png$/, '');
    if (path.startsWith('block/')) return `${namespace}:${path.substring(6)}`;
    if (path.startsWith('item/')) return `${namespace}:${path.substring(5)}`;
    return `${namespace}:${path}`;
  }
  return icon;
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
    match_nbt: false, ignore_nbt: false, exact_match: false,
    fluid_id: '', fluid_amount: 0, energy_amount: 0, energy_unit: 'FE',
    xp_levels: 0, xp_points: 0, command: '', dimension: '',
    x: 0, y: 0, z: 0, radius: 0,
    entity_id: '', advancement_id: '', custom_json: '', description: '',
    stat_name: '', stat_value: 0, biome_id: '', structure_id: '',
    observation_range: 4,
  };
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
  };
}

export const OBJECTIVE_TYPES = [
  { value: 'item_acquisition', label: 'Item Detection' },
  { value: 'item_retrieval', label: 'Item Retrieval' },
  { value: 'item_crafting', label: 'Item Crafting' },
  { value: 'block_break', label: 'Block Breaking' },
  { value: 'block_place', label: 'Block Placing' },
  { value: 'entity_kill', label: 'Entity Kill' },
  { value: 'location_visit', label: 'Location Visit' },
  { value: 'advancement', label: 'Advancement' },
  { value: 'observation', label: 'Observation' },
  { value: 'visit_biome', label: 'Visit Biome' },
  { value: 'find_structure', label: 'Find Structure' },
  { value: 'fluid', label: 'Fluid Detection' },
  { value: 'energy', label: 'Energy Detection' },
  { value: 'xp', label: 'Experience' },
  { value: 'stat', label: 'Statistics' },
  { value: 'command', label: 'Command' },
  { value: 'game_stage', label: 'Game Stage' },
  { value: 'checkmark', label: 'Checkmark' },
  { value: 'custom', label: 'Custom' },
];

export const REWARD_TYPES = [
  { value: 'item', label: 'Item Reward' },
  { value: 'choice', label: 'Choice Reward' },
  { value: 'item_weighted', label: 'Weighted Item' },
  { value: 'random', label: 'Random Reward' },
  { value: 'all_table', label: 'All Table Reward' },
  { value: 'loot_table', label: 'Loot Reward' },
  { value: 'experience', label: 'XP Reward' },
  { value: 'xp_levels', label: 'XP Levels Reward' },
  { value: 'command', label: 'Command Reward' },
  { value: 'advancement', label: 'Advancement Reward' },
  { value: 'toast', label: 'Toast Notification' },
  { value: 'unlock', label: 'Stage Unlock' },
  { value: 'game_stage', label: 'Game Stage' },
  { value: 'custom', label: 'Custom' },
];

export const SHAPES = [
  { value: 'Default', label: 'Default' },
  { value: 'Circle', label: 'Circle' },
  { value: 'Square', label: 'Square' },
  { value: 'RoundedSquare', label: 'Rounded Square' },
  { value: 'Diamond', label: 'Diamond' },
  { value: 'Pentagon', label: 'Pentagon' },
  { value: 'Hexagon', label: 'Hexagon' },
  { value: 'Octagon', label: 'Octagon' },
  { value: 'Heart', label: 'Heart' },
  { value: 'Gear', label: 'Gear' },
];

export const PROGRESSION_MODES = [
  { value: 'Default', label: 'Inherit from Chapter' },
  { value: 'Linear', label: 'Linear (must complete in order)' },
  { value: 'Flexible', label: 'Flexible (any order)' },
];

export const DEPENDENCY_REQUIREMENTS = [
  { value: 'AllCompleted', label: 'All Completed' },
  { value: 'OneCompleted', label: 'One Completed' },
  { value: 'AllStarted', label: 'All Started' },
  { value: 'OneStarted', label: 'One Started' },
];

export const VISIBILITY_OPTIONS = [
  { value: 'Normal', label: 'Normal' },
  { value: 'AlwaysVisible', label: 'Always Visible' },
  { value: 'NeverVisible', label: 'Never Visible' },
  { value: 'WhenDependenciesComplete', label: 'When Deps Complete' },
  { value: 'WhenQuestComplete', label: 'When Quest Complete' },
  { value: 'WhenAllComplete', label: 'When All Complete' },
];

export function isItemObjective(ot: string): boolean {
  return ['item_acquisition', 'item_retrieval', 'item_crafting'].includes(ot);
}
export function isFluidObjective(ot: string): boolean { return ot === 'fluid'; }
export function isEnergyObjective(ot: string): boolean { return ot === 'energy'; }
export function isXpObjective(ot: string): boolean { return ot === 'xp'; }
export function isEntityObjective(ot: string): boolean { return ot === 'entity_kill'; }
export function isLocationObjective(ot: string): boolean { return ot === 'location_visit'; }
export function isCommandObjective(ot: string): boolean { return ot === 'command'; }
export function isAdvancementObjective(ot: string): boolean { return ot === 'advancement'; }
export function isStatObjective(ot: string): boolean { return ot === 'stat'; }
export function isObservationObjective(ot: string): boolean { return ot === 'observation'; }
export function isBiomeObjective(ot: string): boolean { return ot === 'visit_biome'; }
export function isStructureObjective(ot: string): boolean { return ot === 'find_structure'; }
export function isItemReward(rt: string): boolean { return ['item', 'item_weighted'].includes(rt); }
export function isTableReward(rt: string): boolean { return ['all_table', 'random', 'loot_table'].includes(rt); }

export interface QuestGraphProps {
  projectId: string;
  projectPath?: string;
}
