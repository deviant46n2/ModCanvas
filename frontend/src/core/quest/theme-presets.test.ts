import { describe, it, expect } from 'vitest';
import { BOOK_THEME_PRESETS, applyBookTheme, getThemePreset } from './theme-presets';
import type { QuestGraphData } from '../../services/quest-types';

function graph(): QuestGraphData {
  return {
    id: 'g',
    project_id: 'p',
    name: 'Book',
    description: '',
    chapters: [
      {
        id: 'c1', title: 'C1', description: '', icon: '', background_image: '',
        order_index: 0, hide_until_first_quest_complete: false,
        default_quest_size: { width: 24, height: 24 }, quest_color: '#000',
        group_id: null, default_quest_shape: 'square', default_enabled: true,
        progression_mode: '', images: [], subtitle: '', default_min_width: 0,
        always_invisible: false, default_hide_dependency_lines: false,
        hide_quest_details_until_startable: false, hide_quest_until_deps_visible: false,
        hide_quest_until_deps_complete: false, hide_text_until_complete: false,
        autofocus_id: '', default_repeatable: false, require_sequential_tasks: false,
      },
    ],
    chapter_groups: [],
    reward_tables: [],
    nodes: [
      {
        id: 'n1', node_type: 'quest', label: 'A', description: '',
        position: { x: 0, y: 0 }, data: {}, objectives: [], rewards: [],
        required_items: [], chapter_id: 'c1', icon: '', size: { width: 24, height: 24 },
        color: '#123456', visibility: '', optional: false, silently_complete: false,
        can_be_repeatable: false, repeat_cooldown: 0,
        hide_quest_until_deps_complete: false, hide_quest_until_quest_complete: false,
        hide_quest_until_all_complete: false, disable_reward: false, pause_reward: false,
        lock_icon: '', hide_lock_icon: false, guide_page: '',
        max_completable_dependents: 0, subtitle: '', quest_background: '',
        shape: 'circle', icon_scaling: 1, tags: [], progression_mode: '',
        sequential_tasks: false, disable_completion_toast: false,
        ignore_reward_blocking: false, disable_jei_recipe: false, min_window_width: 0,
        hide_details_until_startable: false, hide_text_until_completed: false,
        invisible_until_completed: false, invisible_until_x_tasks: 0,
        hide_dependency_lines: false, hide_dependent_lines: false,
        min_required_dependencies: 0, dependency_requirement: '',
      },
      {
        id: 'l1', node_type: 'quest_link', label: 'Link', description: '',
        position: { x: 0, y: 0 }, data: {}, objectives: [], rewards: [],
        required_items: [], chapter_id: 'c1', icon: '', size: { width: 24, height: 24 },
        color: '#999999', visibility: '', optional: false, silently_complete: false,
        can_be_repeatable: false, repeat_cooldown: 0,
        hide_quest_until_deps_complete: false, hide_quest_until_quest_complete: false,
        hide_quest_until_all_complete: false, disable_reward: false, pause_reward: false,
        lock_icon: '', hide_lock_icon: false, guide_page: '',
        max_completable_dependents: 0, subtitle: '', quest_background: '',
        shape: 'circle', icon_scaling: 1, tags: [], progression_mode: '',
        sequential_tasks: false, disable_completion_toast: false,
        ignore_reward_blocking: false, disable_jei_recipe: false, min_window_width: 0,
        hide_details_until_startable: false, hide_text_until_completed: false,
        invisible_until_completed: false, invisible_until_x_tasks: 0,
        hide_dependency_lines: false, hide_dependent_lines: false,
        min_required_dependencies: 0, dependency_requirement: '',
      },
    ],
    edges: [],
    book_progression_mode: 'default',
    book_icon: '',
    book_background_image: '',
    quest_color: '',
    default_quest_size: { width: 24, height: 24 },
    default_quest_shape: 'circle',
    grid_scale: 0.5,
  };
}

describe('theme presets', () => {
  it('ships only self-authored presets with distinct ids', () => {
    const ids = new Set(BOOK_THEME_PRESETS.map((p) => p.id));
    expect(ids.size).toBe(BOOK_THEME_PRESETS.length);
    expect(BOOK_THEME_PRESETS.length).toBeGreaterThanOrEqual(3);
    for (const p of BOOK_THEME_PRESETS) {
      expect(p.questColor).toMatch(/^#[0-9a-f]{6}$/i);
      expect(p.edgeColor).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it('resolves a preset by id', () => {
    expect(getThemePreset('slate')?.name).toBe('Slate');
    expect(getThemePreset('nope')).toBeUndefined();
  });

  it('applies book + chapter defaults and repaints quest nodes, not links', () => {
    const preset = BOOK_THEME_PRESETS[0];
    const next = applyBookTheme(graph(), preset);
    expect(next.quest_color).toBe(preset.questColor);
    expect(next.default_quest_shape).toBe(preset.defaultShape);
    expect(next.edge_color).toBe(preset.edgeColor);
    expect(next.active_theme).toBe(preset.id);
    expect(next.chapters[0].quest_color).toBe(preset.questColor);
    const quest = next.nodes.find((n) => n.id === 'n1')!;
    expect(quest.color).toBe(preset.questColor);
    expect(quest.shape).toBe(preset.defaultShape);
    const link = next.nodes.find((n) => n.id === 'l1')!;
    expect(link.color).toBe('#999999');
  });
});
