import { describe, it, expect } from 'vitest';
import {
  isDecorationKey,
  decorationCandidates,
  searchTextureCandidates,
  defaultDecorationImage,
  chapterImageRect,
} from './decoration-picker';
import { GRID_SCALE, NODE_BASE_PX } from './QuestCanvas';

describe('isDecorationKey', () => {
  it('flags questpic paths', () => {
    expect(isDecorationKey('atm:questpics/basicarmor/armor_title')).toBe(true);
    expect(isDecorationKey('atm:textures/questpics/star.png')).toBe(true);
  });

  it('flags chapter/background/quest art', () => {
    expect(isDecorationKey('ftb:textures/quest/atm_star_text.png')).toBe(true);
    expect(isDecorationKey('atm:backgrounds/custom')).toBe(true);
    expect(isDecorationKey('my:chapter/deco_border')).toBe(true);
  });

  it('rejects item/block/model art', () => {
    expect(isDecorationKey('minecraft:textures/item/diamond.png')).toBe(false);
    expect(isDecorationKey('minecraft:textures/block/stone.png')).toBe(false);
    expect(isDecorationKey('mekanism:textures/block/models/powered.png')).toBe(false);
    expect(isDecorationKey('minecraft:textures/entity/creeper.png')).toBe(false);
  });

  it('rejects plain item ids resolved through models', () => {
    expect(isDecorationKey('minecraft:diamond')).toBe(false);
    expect(isDecorationKey('apotheosis:gem')).toBe(false);
  });

  it('rejects empty and GUI art', () => {
    expect(isDecorationKey('')).toBe(false);
    expect(isDecorationKey('minecraft:textures/gui/sprites/hud.png')).toBe(false);
  });
});

describe('decorationCandidates', () => {
  it('only returns usable data-url candidates, sorted, capped', () => {
    const index = {
      'atm:questpics/star': 'data:image/png;base64,aaa',
      'minecraft:textures/item/diamond': 'data:image/png;base64,bbb',
      'atm:questpics/zebra': 'raw/path',
      'minecraft:diamond': 'data:image/png;base64,ccc',
      'atm:chapter/banner': 'data:image/png;base64,ddd',
    };
    const got = decorationCandidates(index, 100).map((c) => c.key);
    expect(got).toEqual(['atm:chapter/banner', 'atm:questpics/star']);
  });

  it('caps the result size', () => {
    const index: Record<string, string> = {};
    for (let i = 0; i < 50; i++) {
      index[`atm:questpics/deco_${i}`] = 'data:image/png;base64,x';
    }
    expect(decorationCandidates(index, 10)).toHaveLength(10);
  });
});

describe('searchTextureCandidates', () => {
  it('returns decoration candidates on empty query', () => {
    const index = { 'atm:questpics/star': 'data:image/png;base64,x' };
    expect(searchTextureCandidates(index, '')).toEqual([{ key: 'atm:questpics/star', url: 'data:image/png;base64,x' }]);
  });

  it('filters by path and excludes item art', () => {
    const index: Record<string, string> = {
      'minecraft:textures/item/diamond.png': 'data:image/png;base64,a',
      'atm:questpics/diamond_dark': 'data:image/png;base64,b',
      'atm:deco/big_diamond': 'data:image/png;base64,c',
    };
    const got = searchTextureCandidates(index, 'diamond').map((c) => c.key);
    expect(got).toContain('atm:questpics/diamond_dark');
    expect(got).toContain('atm:deco/big_diamond');
    expect(got).not.toContain('minecraft:textures/item/diamond.png');
  });

  it('prefers keys whose path starts with the query', () => {
    const index: Record<string, string> = {
      'atm:questpics/star_glow': 'data:image/png;base64,a',
      'atm:star_banner': 'data:image/png;base64,b',
    };
    const got = searchTextureCandidates(index, 'star').map((c) => c.key);
    expect(got[0]).toBe('atm:star_banner');
  });
});

describe('defaultDecorationImage', () => {
  it('produces a sane default placement', () => {
    const img = defaultDecorationImage('atm:questpics/star');
    expect(img.image).toBe('atm:questpics/star');
    expect(img.width).toBe(8);
    expect(img.height).toBe(4);
    expect(img.x).toBe(0);
    expect(img.y).toBe(0);
    expect(img.alpha).toBe(255);
  });
});

describe('chapterImageRect', () => {
  const img = { x: 4.5, y: -1.5, width: 13, height: 2 };

  it('centers the box on the grid position (FTB x/y is the box center)', () => {
    const rect = chapterImageRect(img, { positionScale: 48, bodyScale: 28 });
    // body: 13*28 x 2*28, centered on (4.5*48, -1.5*48)
    expect(rect.left).toBe(34);
    expect(rect.top).toBe(-100);
    expect(rect.width).toBe(364);
    expect(rect.height).toBe(56);
  });

  it('uses the body scale for size, independent of the position scale', () => {
    const rect = chapterImageRect(img, { positionScale: 48, bodyScale: 24 });
    expect(rect.width).toBe(312);
    expect(rect.left).toBe(60);
  });
});

describe('editor scale fidelity (FTB in-game quest panel)', () => {
  it('keeps grid pitch:quest body at the in-game 7:6 ratio', () => {
    // FTB QuestScreen: pitch = zoom*(3/2 + quest_spacing/4), body = zoom*(3/2).
    // With the default quest_spacing=1.0 that is a 1.75:1.5 = 7:6 ratio, and it
    // is zoom-independent. The editor constants must mirror it so decorations
    // line up 1:1 with the quests they frame in-game.
    expect(GRID_SCALE / NODE_BASE_PX).toBeCloseTo(7 / 6, 10);
  });

  it('scales a 1.0x node body so a width-7 decoration spans a full pitch', () => {
    const body = NODE_BASE_PX;
    const pitch = GRID_SCALE;
    expect(body).toBe(36);
    expect(pitch).toBe(42);
    expect(pitch - body).toBe(6);
  });
});
