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

describe('s58 upgradeable gate (flat inject must never block the engine render)', () => {
  // plan.ts excludes engine-upgradeable keys from the materialized inject, so
  // the index keeps their bare descriptor and the engine render can clobber it
  // via mergeIndex. Without the gate, the flat URL would enter the index and
  // s26's no-clobber rule would keep stone flat forever.
  const upgradeableFilter = (inject: Record<string, string>, upgradeable: Set<string>) =>
    Object.fromEntries(Object.entries(inject).filter(([k]) => !upgradeable.has(k)));

  it('engine render replaces the descriptor for an upgradeable key (stone)', () => {
    const idx = { 'minecraft:stone': 'minecraft:block/stone' }; // bare descriptor
    const inject = { 'minecraft:stone': BRIGHT }; // flat materialized URL
    const filtered = upgradeableFilter(inject, new Set(['minecraft:stone']));
    // Gate: flat URL excluded from the index.
    const afterPlan = mergeIndexUpgradeOnly(idx, filtered);
    expect(afterPlan['minecraft:stone']).toBe('minecraft:block/stone');
    // Engine render lands — clobbers the descriptor freely.
    const afterRender = mergeIndex(afterPlan, { 'minecraft:stone': DARK });
    expect(afterRender['minecraft:stone']).toBe(DARK);
  });

  it('WITHOUT the gate the flat URL would block the 3D render (the s26 trap)', () => {
    const idx = { 'minecraft:stone': 'minecraft:block/stone' };
    // Ungated: flat URL enters the index...
    const afterPlan = mergeIndexUpgradeOnly(idx, { 'minecraft:stone': BRIGHT });
    expect(afterPlan['minecraft:stone']).toBe(BRIGHT);
    // ...and s26 refuses to clobber it with the render.
    const afterRender = mergeIndex(afterPlan, { 'minecraft:stone': DARK });
    expect(afterRender['minecraft:stone']).toBe(BRIGHT);
  });

  it('non-upgradeable flat items keep the s26 protection', () => {
    const idx = { 'minecraft:iron_ingot': DESCRIPTOR };
    const filtered = upgradeableFilter({ 'minecraft:iron_ingot': BRIGHT }, new Set(['minecraft:stone']));
    const afterPlan = mergeIndexUpgradeOnly(idx, filtered);
    expect(afterPlan['minecraft:iron_ingot']).toBe(BRIGHT);
    // A stray engine render of a flat item stays darker — s26 holds.
    const afterRender = mergeIndex(afterPlan, { 'minecraft:iron_ingot': DARK });
    expect(afterRender['minecraft:iron_ingot']).toBe(BRIGHT);
  });
});
