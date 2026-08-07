import { describe, it, expect } from 'vitest';
import { shapeFolder, shapeTextureKeys, effectiveShape } from './quest-shapes';

describe('quest-shapes texture keys', () => {
  it('maps canonical shapes to their on-disk folders', () => {
    expect(shapeFolder('circle')).toBe('circle');
    expect(shapeFolder('square')).toBe('square');
    expect(shapeFolder('diamond')).toBe('diamond');
    expect(shapeFolder('gear')).toBe('gear');
    expect(shapeFolder('heart')).toBe('heart');
  });

  it('maps rsquare and the legacy rounded_square spelling to the rsquare folder', () => {
    expect(shapeFolder('rsquare')).toBe('rsquare');
    expect(shapeFolder('rounded_square')).toBe('rsquare');
  });

  it('maps none to its own (empty) folder, falling back for unknown/default shapes', () => {
    expect(shapeFolder('none')).toBe('none');
    expect(shapeFolder('default')).toBe('circle');
    expect(shapeFolder('')).toBe('circle');
    expect(shapeFolder('bogus')).toBe('circle');
  });

  it('emits ftbquests jar texture keys for all three layers', () => {
    expect(shapeTextureKeys('gear')).toEqual({
      background: 'ftbquests:textures/shapes/gear/background.png',
      outline: 'ftbquests:textures/shapes/gear/outline.png',
      shape: 'ftbquests:textures/shapes/gear/shape.png',
    });
  });
});

describe('effectiveShape (chapter-default inheritance)', () => {
  it('uses the quest shape when set', () => {
    expect(effectiveShape('hexagon', 'circle')).toBe('hexagon');
    expect(effectiveShape('gear', '')).toBe('gear');
  });

  it('falls back to the chapter default when the quest has no shape', () => {
    expect(effectiveShape('', 'hexagon')).toBe('hexagon');
    expect(effectiveShape(undefined, 'rsquare')).toBe('rsquare');
    expect(effectiveShape(null, 'none')).toBe('none');
  });

  it('returns empty when neither quest nor chapter sets a shape (→ circle via normalizeShape)', () => {
    expect(effectiveShape('', '')).toBe('');
    expect(effectiveShape(undefined, undefined)).toBe('');
    // "default" is FTB's explicit-inherit marker — treat as no override.
    expect(effectiveShape('', 'default')).toBe('');
  });
});
