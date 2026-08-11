import type { EdgeTypes, EdgeProps } from '@xyflow/react';
import type { EdgeDisplayState } from '../../core/quest/edge-state';
import { EDGE_CASING, MARCH_FAST_CLASS, MARCH_SLOW_CLASS } from '../../core/quest/edge-state';

// Dependency-arrow palette and geometry live in `core/quest/edge-state.ts`
// (pure, unit-tested). This renderer is deliberately dumb: the canvas model
// resolves each edge's state into a style + march class, and this component
// just draws them.
//
// Edges are drawn as a two-layer stroke: a dark "casing" stroke underneath a
// bright core. A single solid color vanishes on packs whose chapter theme is
// the same hue, while the casing+core combo stays legible over dark, light,
// and colorful backgrounds alike.
//
// Geometry is a straight line between quest CENTERS, matching the in-game
// quest screen (the quest tiles draw on top of the line ends). Direction is
// conveyed by the marching-dash animation flowing source → target, never by an
// arrowhead — the game has none.
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

export function DependencyEdge({
  id,
  source,
  target,
  sourceX,
  sourceY,
  targetX,
  targetY,
  style,
  markerEnd,
  label,
  interactionWidth,
  data,
}: EdgeProps) {
  const stroke = (style?.stroke as string) || '#64DC64';
  const strokeWidth = Number(style?.strokeWidth) || 3;
  const opacity = (style?.opacity as number) ?? 0.85;
  const dashArray = (style as { strokeDasharray?: string | undefined })?.strokeDasharray;
  const state = (data as { state?: EdgeDisplayState } | undefined)?.state;
  const march = (data as { march?: 'slow' | 'fast' | null } | undefined)?.march;
  const marchClass = march === 'slow' ? MARCH_SLOW_CLASS : march === 'fast' ? MARCH_FAST_CLASS : '';
  const isCycle = state === 'cycle';

  const path = `M ${sourceX} ${sourceY} L ${targetX} ${targetY}`;
  const labelX = (sourceX + targetX) / 2;
  const labelY = (sourceY + targetY) / 2;

  return (
    <g>
      {interactionWidth != null && (
        <path
          d={path}
          fill="none"
          strokeOpacity={0}
          strokeWidth={interactionWidth}
          className="react-flow__edge-interaction"
        />
      )}
      <path
        d={path}
        fill="none"
        className="quest-edge-casing"
        stroke={EDGE_CASING}
        strokeWidth={strokeWidth + 4}
        style={{ opacity }}
      />
      <path
        id={id}
        d={path}
        fill="none"
        className={marchClass ? `react-flow__edge-path ${marchClass}` : 'react-flow__edge-path'}
        style={{
          stroke,
          strokeWidth,
          opacity,
          strokeDasharray: dashArray || undefined,
          strokeDashoffset: dashArray ? 0 : undefined,
        }}
        markerEnd={markerEnd}
      />
      {label && (
        <text x={labelX} y={labelY} className="quest-edge-label" textAnchor="middle">
          {label}
        </text>
      )}
      <title>{isCycle ? 'Circular dependency detected!' : `${source} → ${target}`}</title>
    </g>
  );
}

export const edgeTypes: EdgeTypes = {
  dependency: DependencyEdge,
  tooltip: DependencyEdge,
};
