import { describe, it, expect } from 'vitest';
import { resolveAssetUrl } from './asset-resolver';

const IDX: Record<string, string> = {
  'minecraft:item/diamond': 'data:image/png;base64,D',
  'minecraft:block/stone': 'data:image/png;base64,S',
  'minecraft:diamond': 'data:image/png;base64,SHORT',
  'minecraft:textures/item/diamond_horse_armor.png': 'data:image/png;base64,ARMOR',
  'atm:questpics/star': 'data:image/png;base64,STAR',
  'atm:textures/questpics/star.png': 'data:image/png;base64,STAR',
};

describe('resolveAssetUrl', () => {
  it('resolves exact and stripped forms', () => {
    expect(resolveAssetUrl('minecraft:diamond', IDX)).toBe('data:image/png;base64,SHORT');
    expect(resolveAssetUrl('minecraft:textures/item/diamond.png', IDX)).toBe('data:image/png;base64,D');
    expect(resolveAssetUrl('minecraft:item/diamond', IDX)).toBe('data:image/png;base64,D');
  });

  it('falls back to item/block keys for bare names', () => {
    expect(resolveAssetUrl('minecraft:stone', IDX)).toBe('data:image/png;base64,S');
  });

  it('resolves questpic texture-path keys to canonical keys', () => {
    expect(resolveAssetUrl('atm:textures/questpics/star.png', IDX)).toBe('data:image/png;base64,STAR');
  });

  it('does not fuzzy-match unrelated keys containing the term', () => {
    const only = { 'minecraft:textures/item/diamond_horse_armor.png': 'data:image/png;base64,ARMOR' };
    expect(resolveAssetUrl('minecraft:diamond', only)).toBeUndefined();
  });

  it('treats non-displayable index values as pending', () => {
    const pending = { 'minecraft:item/diamond': '/home/user/mods/x.jar' };
    expect(resolveAssetUrl('minecraft:diamond', pending)).toBeUndefined();
  });

  it('passes through remote urls', () => {
    expect(resolveAssetUrl('https://example.com/x.png', IDX)).toBe('https://example.com/x.png');
  });

  it('resolves case-mismatched paths via the case-insensitive fallback', () => {
    const ci = {
      'atm:textures/questpics/ModernIndustrialization/coke_oven': 'data:image/png;base64,COKE',
    };
    expect(resolveAssetUrl('atm:textures/questpics/modernindustrialization/coke_oven.png', ci)).toBe(
      'data:image/png;base64,COKE',
    );
  });
});
