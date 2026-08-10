import { describe, it, expect } from 'vitest';
import {
  mergeIndex,
  mergeIndexNoDowngrade,
  mergeIndexUpgradeOnly,
  withItemTextures,
} from './texture-merge';
import type { ItemRegistryEntry } from './quest-types';

const DESCRIPTOR = 'jar:/packs/test.jar!assets/minecraft/textures/item/iron_ingot.png';
const BRIGHT = 'data:image/png;base64,iVBORw0KGgo=';
const DARK = 'data:image/png;base64,d2FzSGVyZQ==';

describe('mergeIndex (engine renders — never clobber displayable)', () => {
  it('fills an unknown key', () => {
    const out = mergeIndex({}, { 'minecraft:iron_ingot': DARK });
    expect(out['minecraft:iron_ingot']).toBe(DARK);
  });

  it('replaces a compact descriptor (bake:/unknown) with the render', () => {
    const prev = { 'minecraft:diamond_sword': 'bake:item/diamond_sword' };
    const out = mergeIndex(prev, { 'minecraft:diamond_sword': DARK });
    expect(out['minecraft:diamond_sword']).toBe(DARK);
  });

  it('does NOT clobber an existing displayable value with a later render (s26: dark flat)', () => {
    const prev = { 'minecraft:iron_ingot': BRIGHT };
    const out = mergeIndex(prev, { 'minecraft:iron_ingot': DARK });
    expect(out['minecraft:iron_ingot']).toBe(BRIGHT);
  });

  it('is reference-stable when nothing changes', () => {
    const prev = { a: BRIGHT };
    expect(mergeIndex(prev, { a: BRIGHT })).toBe(prev);
  });
});

describe('mergeIndexNoDowngrade (ingest/scan descriptors — new keys only)', () => {
  it('adds a new key', () => {
    const out = mergeIndexNoDowngrade({}, { a: DESCRIPTOR });
    expect(out.a).toBe(DESCRIPTOR);
  });

  it('never overwrites an existing key, even a descriptor', () => {
    const prev = { a: BRIGHT };
    const out = mergeIndexNoDowngrade(prev, { a: DESCRIPTOR });
    expect(out.a).toBe(BRIGHT);
  });

  it('is reference-stable when nothing changes', () => {
    const prev = { a: BRIGHT };
    expect(mergeIndexNoDowngrade(prev, { a: DESCRIPTOR })).toBe(prev);
  });
});

describe('mergeIndexUpgradeOnly (materialized URLs — upgrade, never downgrade)', () => {
  it('fills a missing key', () => {
    const out = mergeIndexUpgradeOnly({}, { a: BRIGHT });
    expect(out.a).toBe(BRIGHT);
  });

  it('upgrades a descriptor to a data URL', () => {
    const prev = { a: DESCRIPTOR };
    const out = mergeIndexUpgradeOnly(prev, { a: BRIGHT });
    expect(out.a).toBe(BRIGHT);
  });

  it('refuses to downgrade a displayable value to a descriptor', () => {
    const prev = { a: BRIGHT };
    const out = mergeIndexUpgradeOnly(prev, { a: DESCRIPTOR });
    expect(out.a).toBe(BRIGHT);
  });

  it('overwrites a dark engine render with a materialized offline URL (s26 exception)', () => {
    const prev = { a: DARK };
    const out = mergeIndexUpgradeOnly(prev, { a: BRIGHT });
    expect(out.a).toBe(BRIGHT);
  });

  it('is reference-stable when nothing changes', () => {
    const prev = { a: BRIGHT };
    expect(mergeIndexUpgradeOnly(prev, { a: BRIGHT })).toBe(prev);
  });
});

describe('withItemTextures (engine renders onto the item registry)', () => {
  const item = (id: string, url?: string | null): ItemRegistryEntry =>
    ({ id, texture_data_url: url ?? null }) as ItemRegistryEntry;

  it('fills texture_data_url from the updates map', () => {
    const items = [item('minecraft:iron_ingot')];
    const out = withItemTextures(items, { 'minecraft:iron_ingot': DARK });
    expect(out[0].texture_data_url).toBe(DARK);
  });

  it('leaves an item with an existing URL untouched', () => {
    const items = [item('minecraft:iron_ingot', BRIGHT)];
    const out = withItemTextures(items, { 'minecraft:iron_ingot': DARK });
    expect(out[0].texture_data_url).toBe(BRIGHT);
  });

  it('is reference-stable when nothing changes', () => {
    const items = [item('minecraft:iron_ingot')];
    expect(withItemTextures(items, {})).toBe(items);
  });
});
