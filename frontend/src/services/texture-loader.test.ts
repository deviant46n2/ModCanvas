import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  isUsableTextureValue,
  isTexturePending,
  keyPathOf,
  buildTexturePathIndex,
  findTextureKeysForTarget,
  collectNeededTargets,
  prefetchAllChapterTextures,
  registerBakedKeysFromIndex,
  isBakedTexture,
  subscribeLoadingChange,
  requestMaterialize,
  textureDisplayUrl,
} from './texture-loader';
import type { QuestGraphData, QuestNodeData } from './quest-types';
import { getTextureFiles } from './recipes';

vi.mock('./recipes', () => ({
  getTextureFiles: vi.fn(),
}));

const SAMPLE_KEYS = [
  'minecraft:textures/item/diamond.png',
  'minecraft:item/diamond',
  'minecraft:textures/item/diamond',
  'minecraft:block/stone',
  'atm:textures/questpics/star.png',
  'atm:questpics/star',
  'atm:textures/questpics/star',
];

describe('texture-loader helpers', () => {
  it('classifies usable vs pending texture values', () => {
    expect(isUsableTextureValue('data:image/png;base64,abc')).toBe(true);
    expect(isUsableTextureValue('https://example.com/x.png')).toBe(true);
    expect(isUsableTextureValue('/home/user/mods/foo.jar')).toBe(false);
    expect(isUsableTextureValue(null)).toBe(false);
    expect(isUsableTextureValue('')).toBe(false);
  });

  it('flags compact sources as pending until materialized', () => {
    const index: Record<string, string> = {
      'minecraft:item/diamond': 'jar:/path/to/mods/a.jar!assets/minecraft/textures/item/diamond.png',
      'minecraft:item/stone': 'data:image/png;base64,abc',
      'minecraft:item/iron': 'data:image/png;base64,def',
      'minecraft:item/gold': 'jar:/path/to/mods/a.jar!assets/minecraft/textures/item/gold.png',
    };
    expect(isTexturePending(index, 'minecraft:item/diamond')).toBe(true);
    expect(isTexturePending(index, 'minecraft:item/stone')).toBe(false);
    expect(isTexturePending(index, 'minecraft:item/iron')).toBe(false);
    expect(isTexturePending(index, 'minecraft:item/missing')).toBe(false);
    expect(isTexturePending(index, '')).toBe(false);
  });

  it('normalizes keys to texture paths', () => {
    expect(keyPathOf('minecraft:textures/item/diamond.png')).toBe('item/diamond');
    expect(keyPathOf('minecraft:item/diamond')).toBe('item/diamond');
    expect(keyPathOf('minecraft:diamond')).toBe('diamond');
    expect(keyPathOf('atm:questpics/star')).toBe('questpics/star');
    expect(keyPathOf('atm:textures/questpics/star.png')).toBe('questpics/star');
  });

  it('finds item/block/model keys for bare-name targets', () => {
    const index = buildTexturePathIndex(SAMPLE_KEYS);
    const keys = findTextureKeysForTarget(index, 'minecraft:diamond');
    expect(keys).toEqual(
      expect.arrayContaining(['minecraft:textures/item/diamond.png', 'minecraft:item/diamond', 'minecraft:textures/item/diamond']),
    );
    expect(keys).not.toContain('minecraft:block/stone');
  });

  it('finds canonical questpic keys for texture-path targets', () => {
    const index = buildTexturePathIndex(SAMPLE_KEYS);
    const keys = findTextureKeysForTarget(index, 'atm:questpics/star');
    expect(keys).toEqual(expect.arrayContaining(['atm:textures/questpics/star.png', 'atm:questpics/star', 'atm:textures/questpics/star']));
  });

  it('does not cross namespaces when matching bare names', () => {
    const index = buildTexturePathIndex(['atm:item/diamond', 'minecraft:item/diamond']);
    const keys = findTextureKeysForTarget(index, 'minecraft:diamond');
    expect(keys).toEqual(['minecraft:item/diamond']);
  });

  it('collects needed targets from graph, active chapter and selected node', () => {
    const graph = {
      chapters: [
        { id: 'c1', icon: 'atm:questpics/star', background_image: 'bg.png', images: [{ image: 'img.png' }] },
      ],
      nodes: [
        { id: 'n1', chapter_id: 'c1', shape: 'gear', icon: '', objectives: [{ objective_type: 'item', target: 'minecraft:diamond', item_tag: '', fluid_id: '', entity_id: '' }], rewards: [{ item_id: 'minecraft:iron_ingot', items: [], item_tag: '' }] },
        { id: 'n2', chapter_id: 'c2', icon: '', objectives: [{ objective_type: 'fluid', target: '', item_tag: '', fluid_id: 'minecraft:water', entity_id: '' }], rewards: [] },
      ],
    } as unknown as QuestGraphData;
    const selected = { id: 'n2', icon: '', objectives: [{ objective_type: 'entity_kill', target: '', item_tag: '', fluid_id: '', entity_id: 'minecraft:zombie' }], rewards: [] } as unknown as QuestNodeData;

    const targets = collectNeededTargets(graph, 'c1', selected);
    expect(targets).toEqual(
      expect.arrayContaining(['atm:questpics/star', 'bg.png', 'img.png', 'minecraft:diamond', 'minecraft:iron_ingot', 'minecraft:zombie']),
    );
    expect(targets).not.toContain('minecraft:water');
    expect(targets).toContain('minecraft:zombie');
  });

  it('collects shape texture keys for visible nodes', () => {
    const graph = {
      chapters: [{ id: 'c1', icon: '', background_image: '', images: [] }],
      nodes: [
        { id: 'n1', chapter_id: 'c1', shape: 'rounded_square', icon: '', objectives: [], rewards: [] },
        { id: 'n2', chapter_id: 'c1', shape: 'gear', icon: '', objectives: [], rewards: [] },
      ],
    } as unknown as QuestGraphData;

    const targets = collectNeededTargets(graph, 'c1', null);
    expect(targets).toEqual(
      expect.arrayContaining([
        'ftbquests:textures/shapes/rsquare/background.png',
        'ftbquests:textures/shapes/rsquare/outline.png',
        'ftbquests:textures/shapes/rsquare/shape.png',
        'ftbquests:textures/shapes/gear/background.png',
        'ftbquests:textures/shapes/gear/outline.png',
        'ftbquests:textures/shapes/gear/shape.png',
      ]),
    );
  });
});

describe('texture materialization loading state', () => {
  let resolveBatch: (result: Record<string, string>) => void;

  beforeEach(() => {
    vi.mocked(getTextureFiles).mockReset();
    vi.mocked(getTextureFiles).mockImplementation(() => {
      return new Promise((res) => {
        resolveBatch = (r) => res(r);
      });
    });
  });

  it('emits active with the remaining count, then idle when drained', async () => {
    const seen: Array<[boolean, number]> = [];
    const unsub = subscribeLoadingChange((loading, remaining) => seen.push([loading, remaining]));

    requestMaterialize(['loadtest:item/one', 'loadtest:item/two'], '/tmp/inst');
    expect(seen.at(-1)).toEqual([true, 2]);

    resolveBatch({
      'loadtest:item/one': 'data:image/png;base64,abc',
      'loadtest:item/two': 'data:image/png;base64,def',
    });
    await vi.waitFor(() => expect(seen.at(-1)).toEqual([false, 0]));
    unsub();
  });

  it('stays idle when every requested key is already resolved', () => {
    const seen: Array<[boolean, number]> = [];
    const unsub = subscribeLoadingChange((loading, remaining) => seen.push([loading, remaining]));

    requestMaterialize(['loadtest:item/one'], '/tmp/inst');
    expect(seen).toEqual([]);
    unsub();
  });

  it('resolves a display URL from the materialized cache even while the index still holds a compact descriptor', async () => {
    const index: Record<string, string> = {
      'ftbquests:textures/shapes/octagon/outline.png': 'jar:/inst/mods/ftb.jar!assets/ftbquests/textures/shapes/octagon/outline.png',
    };
    // Only a descriptor in the index -> nothing usable yet.
    expect(textureDisplayUrl(index, 'ftbquests:textures/shapes/octagon/outline.png')).toBeUndefined();

    vi.mocked(getTextureFiles).mockReset();
    vi.mocked(getTextureFiles).mockResolvedValue({
      'ftbquests:textures/shapes/octagon/outline.png': 'data:image/png;base64,outline',
    });
    requestMaterialize(['ftbquests:textures/shapes/octagon/outline.png'], '/tmp/inst');
    await vi.waitFor(() => {
      expect(textureDisplayUrl(index, 'ftbquests:textures/shapes/octagon/outline.png')).toBe('data:image/png;base64,outline');
    });
  });

  it('prefetches textures for every chapter, not just the active one', () => {
    const chapter = (id: string, icon: string): QuestGraphData['chapters'][number] =>
      ({ id, title: id, description: '', order_index: 0, group_id: null, icon, background_image: '' }) as unknown as QuestGraphData['chapters'][number];
    const node = (id: string, chapterId: string, target: string): QuestNodeData =>
      ({ id, chapter_id: chapterId, node_type: 'quest', label: id, x: 0, y: 0, objectives: [{ id: `o_${id}`, objective_type: 'item', target, item_tag: '', icon: '', title: '' }], rewards: [], connections: [], dependencies: [], text: '', icon: '' }) as unknown as QuestNodeData;

    const graph: QuestGraphData = {
      id: 'g', project_id: 'p', name: 'Test', description: '',
      chapters: [chapter('c1', 'minecraft:oak_log'), chapter('c2', 'minecraft:diamond')],
      chapter_groups: [],
      nodes: [node('n1', 'c1', 'minecraft:stone'), node('n2', 'c2', 'minecraft:diamond')],
      edges: [],
    } as unknown as QuestGraphData;

    const all = collectNeededTargets(graph, null, null);
    expect(all).toContain('minecraft:oak_log');   // chapter 1 icon
    expect(all).toContain('minecraft:diamond');    // chapter 2 icon + objective
    expect(all).toContain('minecraft:stone');      // chapter 1 objective

    const count = prefetchAllChapterTextures(graph, '/tmp/inst');
    expect(count).toBeGreaterThan(0);
  });

  it('registers bake: descriptor keys for smooth UI scaling', () => {
    expect(isBakedTexture('minecraft:stone')).toBe(false);
    registerBakedKeysFromIndex({
      'minecraft:stone': 'bake:minecraft:block/stone',
      'minecraft:oak_log': 'jar:/x.jar!assets/minecraft/textures/item/oak_log.png',
    });
    expect(isBakedTexture('minecraft:stone')).toBe(true);
    expect(isBakedTexture('minecraft:oak_log')).toBe(false);
  });
});
