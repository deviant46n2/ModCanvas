import { describe, it, expect } from 'vitest';
import type { ChapterImage, QuestChapter } from '../../services/api';

describe('ChapterImage Data Model', () => {
  it('preserves all fields through serialization', () => {
    const image: ChapterImage = {
      x: 0.0,
      y: -5.0,
      width: 10.0,
      height: 2.0,
      rotation: 0.0,
      image: 'atm:textures/quest/atm_star_text.png',
      scale: 1.0,
      order: -1,
      alpha: 255,
      color: 0,
      click: '',
      hover: [],
    };

    const json = JSON.stringify(image);
    const parsed = JSON.parse(json) as ChapterImage;

    expect(parsed.x).toBe(0.0);
    expect(parsed.y).toBe(-5.0);
    expect(parsed.width).toBe(10.0);
    expect(parsed.height).toBe(2.0);
    expect(parsed.rotation).toBe(0.0);
    expect(parsed.image).toBe('atm:textures/quest/atm_star_text.png');
    expect(parsed.scale).toBe(1.0);
    expect(parsed.order).toBe(-1);
    expect(parsed.alpha).toBe(255);
    expect(parsed.color).toBe(0);
    expect(parsed.click).toBe('');
    expect(parsed.hover).toEqual([]);
  });

  it('supports multiple images with different order values', () => {
    const images: ChapterImage[] = [
      {
        x: 0, y: 0, width: 10, height: 2, rotation: 0,
        image: 'ftb:textures/quest/background.png', scale: 1, order: 0,
        alpha: 255, color: 0, click: '', hover: [],
      },
      {
        x: 5, y: 5, width: 3, height: 3, rotation: 45,
        image: 'minecraft:textures/block/stone.png', scale: 1, order: 1,
        alpha: 200, color: 0, click: '', hover: [],
      },
      {
        x: -2, y: -2, width: 4, height: 4, rotation: 90,
        image: 'minecraft:textures/item/diamond.png', scale: 1.5, order: -1,
        alpha: 128, color: 0xFF0000, click: 'https://example.com', hover: ['Click me!'],
      },
    ];

    const sorted = [...images].sort((a, b) => a.order - b.order);
    expect(sorted[0].order).toBe(-1);
    expect(sorted[1].order).toBe(0);
    expect(sorted[2].order).toBe(1);
  });

  it('handles empty images array in chapter', () => {
    const chapter: QuestChapter = {
      id: 'test-id',
      title: 'Test Chapter',
      description: '',
      icon: '',
      background_image: '',
      order_index: 0,
      hide_until_first_quest_complete: false,
      default_quest_size: { width: 24, height: 24 },
      quest_color: '',
      group_id: null,
      default_quest_shape: 'default',
      default_enabled: true,
      progression_mode: 'flexible',
      images: [],
      subtitle: '',
      default_min_width: 0,
      always_invisible: false,
      default_hide_dependency_lines: false,
      hide_quest_details_until_startable: false,
      hide_quest_until_deps_visible: false,
      hide_quest_until_deps_complete: false,
      hide_text_until_complete: false,
      autofocus_id: '',
      default_repeatable: false,
      require_sequential_tasks: false,
    };

    expect(chapter.images).toBeDefined();
    expect(chapter.images).toHaveLength(0);
  });
});

describe('Chapter Image URL Resolution', () => {
  it('resolves modded texture paths via texture index (exact match)', () => {
    const textureIndex: Record<string, string> = {
      'atm:textures/quest/atm_star_text.png': 'data:image/png;base64,test123',
    };

    const imagePath = 'atm:textures/quest/atm_star_text.png';
    const resolved = textureIndex[imagePath];
    expect(resolved).toBe('data:image/png;base64,test123');
  });

  it('resolves texture paths by stripping .png', () => {
    const textureIndex: Record<string, string> = {
      'atm:textures/quest/atm_star_text': 'data:image/png;base64,stripped',
    };

    const imagePath = 'atm:textures/quest/atm_star_text.png';
    const key = imagePath.replace(/\.png$/, '');
    const resolved = textureIndex[key];
    expect(resolved).toBe('data:image/png;base64,stripped');
  });

  it('returns undefined for unresolvable paths', () => {
    const textureIndex: Record<string, string> = {};
    const imagePath = 'unknown:path/to/texture.png';
    const key = imagePath.replace(/^textures\//, '').replace(/\.png$/, '');
    const resolved = textureIndex[key];
    expect(resolved).toBeUndefined();
  });
});
