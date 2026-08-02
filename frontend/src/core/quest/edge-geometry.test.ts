import { describe, it, expect } from 'vitest';
import {
  computeEdgeGeometry,
  pickEdgeHandles,
  handleAnchor,
  controlOffset,
} from './edge-geometry';
import { Position } from '@xyflow/react';
import type { EdgeBezierRel } from './edge-geometry';

describe('controlOffset', () => {
  it('mirrors getBezierPath curvature-0.25 math', () => {
    expect(controlOffset(100)).toBe(50);
    expect(controlOffset(-100)).toBe(0.25 * 25 * 10);
  });
});

describe('computeEdgeGeometry', () => {
  it('builds a cubic path for the default curvature', () => {
    const g = computeEdgeGeometry(0, 0, Position.Right, 100, 50, Position.Left);
    expect(g.path).toBe(`M 0 0 C 50 0 50 50 100 50`);
  });

  it('uses custom control points when provided', () => {
    const bezier: EdgeBezierRel = {
      sourceControl: { x: 200, y: 100 },
      targetControl: { x: -200, y: -100 },
    };
    const g = computeEdgeGeometry(0, 0, Position.Right, 100, 50, Position.Left, bezier);
    expect(g.c1x).toBe(200);
    expect(g.c1y).toBe(100);
    expect(g.c2x).toBe(-100);
    expect(g.c2y).toBe(-50);
    expect(g.path).toContain('C 200 100 -100 -50');
  });

  it('reports a midpoint and a non-degenerate tangent', () => {
    const g = computeEdgeGeometry(0, 0, Position.Right, 100, 50, Position.Left);
    expect(g.mx).toBeGreaterThan(0);
    expect(g.my).toBeGreaterThan(0);
    expect(Math.hypot(g.tx, g.ty)).toBeGreaterThan(1e-4);
  });
});

describe('pickEdgeHandles', () => {
  it('prefers the longer axis and the direction sign', () => {
    expect(pickEdgeHandles(0, 0, 100, 10)).toEqual({ sourceHandle: 'sr', targetHandle: 'l' });
    expect(pickEdgeHandles(0, 0, -100, 10)).toEqual({ sourceHandle: 'sl', targetHandle: 'r' });
    expect(pickEdgeHandles(0, 0, 10, 100)).toEqual({ sourceHandle: 'sb', targetHandle: 't' });
    expect(pickEdgeHandles(0, 0, 10, -100)).toEqual({ sourceHandle: 'st', targetHandle: 'b' });
  });
});

describe('handleAnchor', () => {
  it('returns boundary points for each side', () => {
    expect(handleAnchor(100, 100, 50, 40, 'sr')).toEqual({ x: 150, y: 100 });
    expect(handleAnchor(100, 100, 50, 40, 'l')).toEqual({ x: 50, y: 100 });
    expect(handleAnchor(100, 100, 50, 40, 'b')).toEqual({ x: 100, y: 140 });
    expect(handleAnchor(100, 100, 50, 40, 't')).toEqual({ x: 100, y: 60 });
  });
});
