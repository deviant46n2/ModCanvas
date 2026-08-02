import { describe, it, expect } from 'vitest';
import {
  normalizeShape,
  questScaleFromSize,
  questSizeToPixels,
  setQuestScale,
  snapToGridStep,
} from './quest-form-constants';

describe('questScaleFromSize', () => {
  it('returns 1 for default 24-unit size', () => {
    expect(questScaleFromSize({ width: 24, height: 24 })).toBe(1);
  });

  it('returns multiplier for scaled sizes', () => {
    expect(questScaleFromSize({ width: 36, height: 36 })).toBe(1.5);
    expect(questScaleFromSize({ width: 48, height: 48 })).toBe(2);
  });

  it('handles missing/empty size', () => {
    expect(questScaleFromSize()).toBe(1);
    expect(questScaleFromSize(null)).toBe(1);
  });

  it('uses width when non-uniform', () => {
    expect(questScaleFromSize({ width: 48, height: 24 })).toBe(2);
  });
});

describe('questSizeToPixels', () => {
  it('maps 1.0x node to base pixel size', () => {
    expect(questSizeToPixels({ width: 24, height: 24 })).toEqual({ width: 28, height: 28 });
  });

  it('scales proportionally', () => {
    expect(questSizeToPixels({ width: 48, height: 24 })).toEqual({ width: 56, height: 28 });
  });

  it('honors custom base pixel size', () => {
    expect(questSizeToPixels({ width: 36, height: 36 }, 48)).toEqual({ width: 72, height: 72 });
  });

  it('clamps pathological sizes', () => {
    expect(questSizeToPixels({ width: 9999, height: 9999 })).toEqual({ width: 224, height: 224 });
    expect(questSizeToPixels({ width: 1, height: 1 })).toEqual({ width: 14, height: 14 });
  });

  it('handles missing size', () => {
    expect(questSizeToPixels()).toEqual({ width: 28, height: 28 });
  });
});

describe('setQuestScale', () => {
  it('writes uniform size in FTB units', () => {
    expect(setQuestScale(1.5)).toEqual({ width: 36, height: 36 });
    expect(setQuestScale(2)).toEqual({ width: 48, height: 48 });
  });

  it('clamps scale to a minimum', () => {
    expect(setQuestScale(0)).toEqual({ width: 12, height: 12 });
  });
});

describe('normalizeShape', () => {
  it('canonicalizes legacy aliases', () => {
    expect(normalizeShape('rsquare')).toBe('rounded_square');
    expect(normalizeShape('rounded')).toBe('rounded_square');
  });

  it('defaults empty values to circle', () => {
    expect(normalizeShape()).toBe('circle');
    expect(normalizeShape('default')).toBe('circle');
  });
});

describe('snapToGridStep', () => {
  // In-game FTB: snap = 1/(gridScale × minSize), so positions round to the
  // nearest gridScale × minSize. ATM10 pack uses grid_scale 0.5 with default
  // size-1 quests, giving a 0.5-unit grid (matches the pack's quest coords).
  it('snaps to 0.5 grid for grid_scale 0.5 and size-1 quests', () => {
    expect(snapToGridStep(1.32, 0.5, 1)).toBe(1.5);
    expect(snapToGridStep(-0.3, 0.5, 1)).toBe(-0.5);
    expect(snapToGridStep(2.0, 0.5, 1)).toBe(2.0);
  });

  it('snaps to integer grid for grid_scale 1', () => {
    expect(snapToGridStep(1.32, 1, 1)).toBe(1);
    expect(snapToGridStep(-0.6, 1, 1)).toBe(-1);
  });

  it('coarsens grain when the smallest selected item is scaled up', () => {
    // A size-2 quest (48 units) makes minSize 2 → step = 1.0
    expect(snapToGridStep(0.3, 0.5, 2)).toBe(0);
    expect(snapToGridStep(0.7, 0.5, 2)).toBe(1);
  });

  it('returns value unchanged when minSize is invalid', () => {
    expect(snapToGridStep(1.5, 0.5, 0)).toBe(1.5);
  });
});
