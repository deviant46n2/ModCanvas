import { BaseEdge, getBezierPath } from '@xyflow/react';
import type { Edge, EdgeTypes } from '@xyflow/react';

export const CYCLE_COLOR = '#e74c3c';
export const NORMAL_COLOR = '#89b4fa';

export function detectCycles(edgeList: { source: string; target: string }[]): Set<string> {
  const adj = new Map<string, string[]>();

  for (const e of edgeList) {
    if (!adj.has(e.source)) adj.set(e.source, []);
    adj.get(e.source)!.push(e.target);
  }

  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map<string, number>();
  for (const k of adj.keys()) color.set(k, WHITE);

  const cycleEdges = new Set<string>();

  function dfs(u: string, path: string[]) {
    color.set(u, GRAY);
    path.push(u);

    for (const v of adj.get(u) ?? []) {
      const c = color.get(v);
      if (c === GRAY) {
        const cycleStartIdx = path.indexOf(v);
        if (cycleStartIdx >= 0) {
          for (let i = cycleStartIdx; i < path.length; i++) {
            const from = path[i];
            const to = path[i + 1] ?? v;
            cycleEdges.add(`${from}->${to}`);
          }
        }
      } else if (c === WHITE) {
        dfs(v, path);
      }
    }

    path.pop();
    color.set(u, BLACK);
  }

  for (const u of adj.keys()) {
    if (color.get(u) === WHITE) {
      dfs(u, []);
    }
  }

  return cycleEdges;
}

function TooltipEdge({
  id,
  source,
  target,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style,
  markerEnd,
}: Edge & {
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
  sourcePosition: any;
  targetPosition: any;
}) {
  const [edgePath] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });
  const isCycle = (style?.stroke as string) === CYCLE_COLOR;

  return (
    <g className="tooltip-edge-group">
      <BaseEdge id={id} path={edgePath} style={style} markerEnd={markerEnd as any} />
      <title>{isCycle ? '⚠ Circular dependency detected!' : `${source} → ${target}`}</title>
    </g>
  );
}

export const edgeTypes: EdgeTypes = {
  tooltip: TooltipEdge,
};
