import { describe, it, expect } from 'vitest';
import { resolveEdgeState, edgeStyleForState, EDGE_STATE_COLORS, EDGE_DASH_ARRAY, MARCH_FAST_CLASS, MARCH_SLOW_CLASS } from './edge-state';

const edge = { source: 'a', target: 'b' };
const base = {
  progress: {},
  lockedById: {},
  hoveredNodeId: null,
  isCycle: false,
};

describe('resolveEdgeState', () => {
  it('marks an edge completed when the prerequisite quest is complete', () => {
    expect(resolveEdgeState(edge, { ...base, progress: { a: 'complete' } })).toBe('completed');
  });

  it('marks an edge unavailable when the prerequisite quest is locked', () => {
    expect(resolveEdgeState(edge, { ...base, lockedById: { a: true } })).toBe('unavailable');
  });

  it('marks an edge uncompleted when the prerequisite is not started and not locked', () => {
    expect(resolveEdgeState(edge, base)).toBe('uncompleted');
  });

  it('marks a started-but-incomplete prerequisite as uncompleted', () => {
    expect(resolveEdgeState(edge, { ...base, progress: { a: 'started' } })).toBe('uncompleted');
  });

  it('never lets the target quest\u2019s state drive the edge', () => {
    expect(resolveEdgeState(edge, { ...base, progress: { b: 'complete' } })).toBe('uncompleted');
  });

  it('colors the hovered quest\u2019s incoming fan with the requires hue', () => {
    expect(resolveEdgeState(edge, { ...base, hoveredNodeId: 'b' })).toBe('requires');
  });

  it('colors the hovered quest\u2019s outgoing fan with the required-for hue', () => {
    expect(resolveEdgeState(edge, { ...base, hoveredNodeId: 'a' })).toBe('required-for');
  });

  it('leaves unrelated edges in their static state while another quest is hovered', () => {
    expect(resolveEdgeState(edge, { ...base, hoveredNodeId: 'c', progress: { a: 'complete' } })).toBe('completed');
  });

  it('lets cycle red win over fan colors', () => {
    expect(resolveEdgeState(edge, { ...base, hoveredNodeId: 'b', isCycle: true })).toBe('cycle');
  });
});

describe('edgeStyleForState', () => {
  it('gives completed/uncompleted/unavailable a slow marching dash', () => {
    for (const state of ['completed', 'uncompleted', 'unavailable'] as const) {
      const spec = edgeStyleForState(state);
      expect(spec.dashArray).toBe(EDGE_DASH_ARRAY);
      expect(spec.march).toBe('slow');
      expect(spec.stroke).toBe(EDGE_STATE_COLORS[state]);
    }
  });

  it('gives the fan states a fast marching dash', () => {
    for (const state of ['requires', 'required-for'] as const) {
      expect(edgeStyleForState(state).march).toBe('fast');
    }
  });

  it('draws cycles solid, red, and static', () => {
    const spec = edgeStyleForState('cycle');
    expect(spec.dashArray).toBeNull();
    expect(spec.march).toBeNull();
    expect(spec.stroke).toBe(EDGE_STATE_COLORS.cycle);
  });

  it('keeps the march CSS class names in sync with the stylesheet', () => {
    expect(MARCH_SLOW_CLASS).toBe('quest-edge-march');
    expect(MARCH_FAST_CLASS).toBe('quest-edge-march-fast');
  });
});

describe('alpha semantics', () => {
  it('uncompleted and unavailable share the pink hue, differing only in alpha', () => {
    const uncompleted = edgeStyleForState('uncompleted').stroke;
    const unavailable = edgeStyleForState('unavailable').stroke;
    expect(uncompleted).toContain('204, 163, 163');
    expect(unavailable).toContain('204, 163, 163');
    expect(uncompleted).not.toBe(unavailable);
  });
});
