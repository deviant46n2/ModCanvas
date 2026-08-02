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

// Canonicalize any shape string (old/new FTB dialects, empty, default) to the
// frontend's canonical shape keys: circle, square, rounded_square, diamond,
// pentagon, hexagon, octagon, heart, gear. FTB's built-in default shape is
// "circle" (QuestShape.DEF_SHAPE), so empty/"default" resolve to circle.
export function normalizeShape(shape?: string | null): string {
  const s = (shape || '').trim().toLowerCase()
  if (!s || s === 'default' || s === 'none') return 'circle'
  if (s === 'rsquare' || s === 'rounded' || s === 'roundedsquare') return 'rounded_square'
  return s
}

// FTB Quests stores node size in grid units where a 1.0x node is 24x24 units.
// `questScaleFromSize` returns the uniform multiplier for a given size (useful
// for scalar-style packs where width == height), rounded to 1 decimal.
export function questScaleFromSize(size?: { width?: number; height?: number } | null): number {
  const w = size?.width || 24
  return Math.round((w / 24) * 10) / 10
}

// Convert a node's FTB size (grid units, default 24x24) into canvas pixel
// dimensions. `basePx` is the pixel size of a 1.0x node; the result is clamped
// so pathological sizes cannot blow up the canvas.
export function questSizeToPixels(
  size?: { width?: number; height?: number } | null,
  basePx = 28
): { width: number; height: number } {
  const w = size?.width || 24
  const h = size?.height || 24
  return {
    width: Math.min(224, Math.max(14, Math.round((w / 24) * basePx))),
    height: Math.min(224, Math.max(14, Math.round((h / 24) * basePx))),
  }
}

export function setQuestScale(scale: number): { width: number; height: number } {
  const q = Math.max(0.5, scale)
  return { width: Math.round(q * 24), height: Math.round(q * 24) }
}

// Mirror in-game FTB grid snapping (QuestPanel.draw). The snap grain is
// `gridScale × minSize` FTB grid units, where minSize is the smallest selected
// item's width (24 units = 1.0x) and gridScale is data.snbt's `grid_scale`
// (default 0.5). Shift disables snapping entirely. Values are snapped to the
// nearest grid line; the group anchor (min corner) is snapped and offsets are
// preserved by the caller.
export function snapToGridStep(value: number, gridScale: number, minSize: number): number {
  const step = gridScale * Math.max(0.25, minSize)
  if (step <= 0) return value
  return Math.round(value / step) * step
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
]

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
]

export const VISIBILITY_OPTIONS = [
  { value: 'normal', label: 'Normal' },
  { value: 'always_visible', label: 'Always Visible' },
  { value: 'never_visible', label: 'Never Visible' },
  { value: 'when_dependencies_complete', label: 'When Deps Complete' },
  { value: 'when_quest_complete', label: 'When Quest Complete' },
  { value: 'when_all_complete', label: 'When All Complete' },
]

export const PROGRESSION_MODES = [
  { value: 'default', label: 'Inherit from Chapter' },
  { value: 'linear', label: 'Linear' },
  { value: 'flexible', label: 'Flexible' },
]

export const CHAPTER_PROGRESSION_MODES = [
  { value: 'default', label: 'Inherit from File' },
  { value: 'linear', label: 'Linear' },
  { value: 'flexible', label: 'Flexible' },
]
