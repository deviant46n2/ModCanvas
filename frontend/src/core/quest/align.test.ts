import { describe, it, expect } from 'vitest';
import { alignPositions, distributePositions } from './align';

const items = (positions: Array<[number, number]>) =>
  positions.map(([x, y], i) => ({ id: `n${i}`, position: { x, y } }));

describe('alignPositions', () => {
  it('aligns centers to the leftmost / rightmost / center X', () => {
    const sel = items([[0, 10], [20, 20], [40, 30]]);
    expect(alignPositions(sel, 'left')).toEqual({
      n0: { x: 0, y: 10 }, n1: { x: 0, y: 20 }, n2: { x: 0, y: 30 },
    });
    expect(alignPositions(sel, 'right')).toEqual({
      n0: { x: 40, y: 10 }, n1: { x: 40, y: 20 }, n2: { x: 40, y: 30 },
    });
    expect(alignPositions(sel, 'centerX')).toEqual({
      n0: { x: 20, y: 10 }, n1: { x: 20, y: 20 }, n2: { x: 20, y: 30 },
    });
  });

  it('aligns centers to the topmost / bottommost / center Y', () => {
    const sel = items([[0, 10], [20, 20], [40, 30]]);
    expect(alignPositions(sel, 'top')).toEqual({
      n0: { x: 0, y: 10 }, n1: { x: 20, y: 10 }, n2: { x: 40, y: 10 },
    });
    expect(alignPositions(sel, 'bottom')).toEqual({
      n0: { x: 0, y: 30 }, n1: { x: 20, y: 30 }, n2: { x: 40, y: 30 },
    });
    expect(alignPositions(sel, 'centerY')).toEqual({
      n0: { x: 0, y: 20 }, n1: { x: 20, y: 20 }, n2: { x: 40, y: 20 },
    });
  });

  it('is a no-op for an empty selection', () => {
    expect(alignPositions([], 'centerX')).toEqual({});
  });

  it('does not mutate the input items', () => {
    const sel = items([[0, 10], [20, 20]]);
    alignPositions(sel, 'left');
    expect(sel[0].position).toEqual({ x: 0, y: 10 });
    expect(sel[1].position).toEqual({ x: 20, y: 20 });
  });
});

describe('distributePositions', () => {
  it('spreads centers evenly along X between the extremes', () => {
    const sel = items([[0, 0], [4, 0], [10, 0]]);
    expect(distributePositions(sel, 'horizontal')).toEqual({
      n0: { x: 0, y: 0 }, n1: { x: 5, y: 0 }, n2: { x: 10, y: 0 },
    });
  });

  it('spreads centers evenly along Y, preserving the other axis', () => {
    const sel = items([[1, 0], [1, 8], [1, 20]]);
    expect(distributePositions(sel, 'vertical')).toEqual({
      n0: { x: 1, y: 0 }, n1: { x: 1, y: 10 }, n2: { x: 1, y: 20 },
    });
  });

  it('leaves fewer than 3 items untouched', () => {
    const sel = items([[0, 0], [10, 0]]);
    expect(distributePositions(sel, 'horizontal')).toEqual({});
  });
});
