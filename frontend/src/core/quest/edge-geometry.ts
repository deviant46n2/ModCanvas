// Pure dependency-edge geometry. Kept in the Data/Parsers layer so the path
// math is testable in isolation and shared by the SVG edge renderer
// (quest-edges.tsx) and the on-canvas bezier editor (EdgeBezierEditor.tsx).
import { Position } from '@xyflow/react';

export interface ControlPoint {
  x: number;
  y: number;
}

// A manually curved edge. Control points are stored as offsets relative to the
// source/target handle anchors (the node-boundary points React Flow resolves
// for an edge), so a curve keeps tracking its quests when nodes are dragged.
export interface EdgeBezierRel {
  sourceControl: ControlPoint;
  targetControl: ControlPoint;
}

// Replicates @xyflow/react's `getBezierPath` control-offset math (curvature
// 0.25) so the default curve and the draggable handles agree pixel-for-pixel.
//
// The MIT License (MIT)
// Copyright (c) 2019-2025 webkid GmbH
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
// FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS
// IN THE SOFTWARE.
export function controlOffset(distance: number): number {
  return distance >= 0 ? 0.5 * distance : 0.25 * 25 * Math.sqrt(-distance);
}

export interface EdgeGeometry {
  path: string;
  c1x: number;
  c1y: number;
  c2x: number;
  c2y: number;
  // Bezier midpoint (t = 0.5) plus the path tangent vector there, used to
  // place and orient the direction chevron.
  mx: number;
  my: number;
  tx: number;
  ty: number;
}

// Resolve an edge's cubic-bezier path. When `bezier` is provided its control
// points (anchored to the handle anchors) win; otherwise the standard
// curvature-0.25 controls derived from the handle positions are used.
export function computeEdgeGeometry(
  sx: number,
  sy: number,
  sourcePosition: Position | undefined,
  tx: number,
  ty: number,
  targetPosition: Position | undefined,
  bezier?: EdgeBezierRel | null
): EdgeGeometry {
  let c1x: number;
  let c1y: number;
  let c2x: number;
  let c2y: number;
  if (bezier) {
    c1x = sx + bezier.sourceControl.x;
    c1y = sy + bezier.sourceControl.y;
    c2x = tx + bezier.targetControl.x;
    c2y = ty + bezier.targetControl.y;
  } else {
    const ox1 = controlOffset(sx - tx);
    c1x = sourcePosition === Position.Left ? sx - ox1 : sourcePosition === Position.Right ? sx + controlOffset(tx - sx) : sx;
    const oy1 = controlOffset(sy - ty);
    c1y = sourcePosition === Position.Top ? sy - oy1 : sourcePosition === Position.Bottom ? sy + controlOffset(ty - sy) : sy;
    const ox2 = controlOffset(tx - sx);
    c2x = targetPosition === Position.Left ? tx - ox2 : targetPosition === Position.Right ? tx + controlOffset(sx - tx) : tx;
    const oy2 = controlOffset(ty - sy);
    c2y = targetPosition === Position.Top ? ty - oy2 : targetPosition === Position.Bottom ? ty + controlOffset(sy - ty) : ty;
  }

  const path = `M ${sx} ${sy} C ${c1x} ${c1y} ${c2x} ${c2y} ${tx} ${ty}`;

  // Midpoint + tangent of the cubic at t = 0.5.
  const mx = sx * 0.125 + c1x * 0.375 + c2x * 0.375 + tx * 0.125;
  const my = sy * 0.125 + c1y * 0.375 + c2y * 0.375 + ty * 0.125;
  const tpx = 0.75 * (c1x - sx) + 1.5 * (c2x - c1x) + 0.75 * (tx - c2x);
  const tpy = 0.75 * (c1y - sy) + 1.5 * (c2y - c1y) + 0.75 * (ty - c2y);
  return { path, c1x, c1y, c2x, c2y, mx, my, tx: tpx, ty: tpy };
}

export interface EdgeAnchorSelection {
  sourceHandle: string;
  targetHandle: string;
}

// Pick the side handles an edge between two node centers should connect to,
// matching React Flow's default routing (longer axis wins, then sign).
export function pickEdgeHandles(scx: number, scy: number, tcx: number, tcy: number): EdgeAnchorSelection {
  const dx = tcx - scx;
  const dy = tcy - scy;
  if (Math.abs(dx) > Math.abs(dy)) {
    return dx > 0 ? { sourceHandle: 'sr', targetHandle: 'l' } : { sourceHandle: 'sl', targetHandle: 'r' };
  }
  return dy > 0 ? { sourceHandle: 'sb', targetHandle: 't' } : { sourceHandle: 'st', targetHandle: 'b' };
}

// Anchor point (flow coords) of a side handle on a node box. `halfW`/`halfH`
// are half the node's pixel size; the returned point sits on the boundary.
export function handleAnchor(cx: number, cy: number, halfW: number, halfH: number, handle: string): ControlPoint {
  switch (handle) {
    case 'sr':
    case 'r':
      return { x: cx + halfW, y: cy };
    case 'sl':
    case 'l':
      return { x: cx - halfW, y: cy };
    case 'sb':
    case 'b':
      return { x: cx, y: cy + halfH };
    case 'st':
    case 't':
      return { x: cx, y: cy - halfH };
    default:
      return { x: cx, y: cy };
  }
}

// Map a side-handle id (as used by the quest nodes: sr/sl/sb/st source handles,
// r/l/b/t target handles) to the React Flow Position it anchors to, so default
// bezier control points match what the edge renderer produces.
export function positionForHandle(handle: string): Position | undefined {
  switch (handle) {
    case 'sr':
    case 'r':
      return Position.Right;
    case 'sl':
    case 'l':
      return Position.Left;
    case 'sb':
    case 'b':
      return Position.Bottom;
    case 'st':
    case 't':
      return Position.Top;
    default:
      return undefined;
  }
}
