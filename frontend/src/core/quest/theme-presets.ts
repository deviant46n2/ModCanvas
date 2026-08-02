// Book-level visual presets. These are ModCanvas's own, clean-room theme
// definitions — NOT derived from any FTB theme file. Each preset restyles the
// whole book: quest plate color, dependency edge colors, default shape and
// size. Applying one writes the resulting book defaults + repaints every quest
// node (and each chapter's defaults) through `applyBookTheme`.
import type { QuestGraphData, QuestChapter } from '../../services/quest-types';

export interface BookThemePreset {
  id: string;
  name: string;
  description: string;
  questColor: string;
  edgeColor: string;
  cycleColor: string;
  defaultShape: string;
  defaultSize: { width: number; height: number };
}

export const BOOK_THEME_PRESETS: BookThemePreset[] = [
  {
    id: 'slate',
    name: 'Slate',
    description: 'Cool steel-blue plates, square tiles, amber edges',
    questColor: '#6b87a8',
    edgeColor: '#f2c94c',
    cycleColor: '#ff6b6b',
    defaultShape: 'square',
    defaultSize: { width: 24, height: 24 },
  },
  {
    id: 'emerald',
    name: 'Emerald Forge',
    description: 'Green plates, rounded tiles, pale mint edges',
    questColor: '#34d399',
    edgeColor: '#6ee7b7',
    cycleColor: '#f87171',
    defaultShape: 'rounded_square',
    defaultSize: { width: 24, height: 24 },
  },
  {
    id: 'amethyst',
    name: 'Royal Amethyst',
    description: 'Violet plates, octagonal tiles, lavender edges',
    questColor: '#a78bfa',
    edgeColor: '#c4b5fd',
    cycleColor: '#fb7185',
    defaultShape: 'octagon',
    defaultSize: { width: 24, height: 24 },
  },
  {
    id: 'forge',
    name: 'Crimson Forge',
    description: 'Ember-red plates, gear tiles, warm amber edges',
    questColor: '#fb923c',
    edgeColor: '#fcd34d',
    cycleColor: '#f87171',
    defaultShape: 'gear',
    defaultSize: { width: 24, height: 24 },
  },
  {
    id: 'abyss',
    name: 'Abyssal Depths',
    description: 'Deep cyan plates, hexagonal tiles, aqua edges',
    questColor: '#22d3ee',
    edgeColor: '#67e8f9',
    cycleColor: '#fda4af',
    defaultShape: 'hexagon',
    defaultSize: { width: 24, height: 24 },
  },
];

export function getThemePreset(id: string): BookThemePreset | undefined {
  return BOOK_THEME_PRESETS.find((p) => p.id === id);
}

// Produce a new graph whose book defaults, chapter defaults, and all quest-node
// colors adopt the preset's palette. Non-quest nodes (links, groups, chapters)
// keep their identity so structure stays visually distinct.
export function applyBookTheme(graph: QuestGraphData, preset: BookThemePreset): QuestGraphData {
  const chapterPatch = (c: QuestChapter): QuestChapter => ({
    ...c,
    quest_color: preset.questColor,
    default_quest_shape: preset.defaultShape,
    default_quest_size: { ...preset.defaultSize },
  });
  return {
    ...graph,
    quest_color: preset.questColor,
    default_quest_shape: preset.defaultShape,
    default_quest_size: { ...preset.defaultSize },
    edge_color: preset.edgeColor,
    edge_cycle_color: preset.cycleColor,
    active_theme: preset.id,
    chapters: graph.chapters.map(chapterPatch),
    nodes: graph.nodes.map((n) =>
      n.node_type === 'quest' || n.node_type === 'side_quest'
        ? { ...n, color: preset.questColor, shape: preset.defaultShape }
        : n
    ),
  };
}
