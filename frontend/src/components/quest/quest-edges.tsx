import { getBezierPath, Position } from '@xyflow/react';
import type { EdgeTypes, EdgeProps } from '@xyflow/react';

// Dependency-arrow palette.
//
// Edges are drawn as a two-layer stroke: a dark "casing" stroke underneath a
// bright core stroke. A single solid color vanishes on packs whose chapter
// theme is the same hue (the old solid-blue line disappeared on blue-themed
// quest books), while the casing+core combo stays legible over dark, light,
// and colorful backgrounds alike. The core is a warm gold chosen to contrast
// both the default dark editor and typical in-game chapter artwork.
export const CYCLE_COLOR = '#ff6b6b';
export const NORMAL_COLOR = '#f2c94c';
export const EDGE_CASING = 'rgba(10, 12, 18, 0.92)';

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

// Replicates @xyflow/react's getBezierPath control-point math (curvature 0.25)
// so we can position a direction chevron at the bezier midpoint and orient it
// along the path's tangent (from source toward target).
function bezierMidpoint(
  sourceX: number,
  sourceY: number,
  sourcePosition: Position | undefined,
  targetX: number,
  targetY: number,
  targetPosition: Position | undefined
): { mx: number; my: number; tx: number; ty: number } {
  const curvature = 0.25;
  const controlOffset = (distance: number) => (distance >= 0 ? 0.5 * distance : curvature * 25 * Math.sqrt(-distance));

  const sourceControlX =
    sourcePosition === Position.Left
      ? sourceX - controlOffset(sourceX - targetX)
      : sourcePosition === Position.Right
        ? sourceX + controlOffset(targetX - sourceX)
        : sourceX;
  const sourceControlY =
    sourcePosition === Position.Top
      ? sourceY - controlOffset(sourceY - targetY)
      : sourcePosition === Position.Bottom
        ? sourceY + controlOffset(targetY - sourceY)
        : sourceY;
  const targetControlX =
    targetPosition === Position.Left
      ? targetX - controlOffset(targetX - sourceX)
      : targetPosition === Position.Right
        ? targetX + controlOffset(sourceX - targetX)
        : targetX;
  const targetControlY =
    targetPosition === Position.Top
      ? targetY - controlOffset(targetY - sourceY)
      : targetPosition === Position.Bottom
        ? targetY + controlOffset(sourceY - targetY)
        : targetY;

  const mx = sourceX * 0.125 + sourceControlX * 0.375 + targetControlX * 0.375 + targetX * 0.125;
  const my = sourceY * 0.125 + sourceControlY * 0.375 + targetControlY * 0.375 + targetY * 0.125;
  const tx =
    0.75 * (sourceControlX - sourceX) +
    1.5 * (targetControlX - sourceControlX) +
    0.75 * (targetX - targetControlX);
  const ty =
    0.75 * (sourceControlY - sourceY) +
    1.5 * (targetControlY - sourceControlY) +
    0.75 * (targetY - targetControlY);

  return { mx, my, tx, ty };
}

export function DependencyEdge({
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
  label,
  interactionWidth,
}: EdgeProps) {
  const [path, labelX, labelY] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });
  const stroke = (style?.stroke as string) || NORMAL_COLOR;
  const isCycle = stroke === CYCLE_COLOR;
  const strokeWidth = isCycle ? 3.5 : Math.max(1.5, Number(style?.strokeWidth) || 2);
  const opacity = isCycle ? 1 : (style?.opacity as number) ?? 0.85;

  // Direction cue: a dot on the prerequisite end plus a chevron on the bezier
  // midpoint pointing at the dependent quest. The two together make the arrow
  // direction readable even on busy chapter artwork.
  const { mx, my, tx, ty } = bezierMidpoint(sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition);
  const tangentLength = Math.hypot(tx, ty);
  const chevronLength = 10;
  const chevronWidth = 6.4;
  const chevron = tangentLength > 1e-4
    ? (() => {
        const ux = tx / tangentLength;
        const uy = ty / tangentLength;
        const nx = -uy;
        const ny = ux;
        const tipX = mx + ux * chevronLength * 0.45;
        const tipY = my + uy * chevronLength * 0.45;
        const backX = mx - ux * chevronLength * 0.55;
        const backY = my - uy * chevronLength * 0.55;
        const b1x = backX + nx * chevronWidth * 0.5;
        const b1y = backY + ny * chevronWidth * 0.5;
        const b2x = backX - nx * chevronWidth * 0.5;
        const b2y = backY - ny * chevronWidth * 0.5;
        return `M ${tipX} ${tipY} L ${b1x} ${b1y} L ${b2x} ${b2y} Z`;
      })()
    : null;

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
        className="react-flow__edge-path"
        style={{ stroke, strokeWidth, opacity }}
        markerEnd={markerEnd}
      />
      {chevron && (
        <path
          d={chevron}
          fill={stroke}
          stroke={EDGE_CASING}
          strokeWidth={1.4}
          strokeLinejoin="round"
          className="quest-edge-chevron"
          style={{ opacity }}
        />
      )}
      <circle
        cx={sourceX}
        cy={sourceY}
        r={4.5}
        fill={stroke}
        stroke={EDGE_CASING}
        strokeWidth={2.5}
        className="quest-edge-source-dot"
        style={{ opacity }}
      />
      {label && labelX != null && labelY != null ? (
        <text x={labelX} y={labelY} className="quest-edge-label" textAnchor="middle">
          {label}
        </text>
      ) : null}
      <title>{isCycle ? '⚠ Circular dependency detected!' : `${source} → ${target}`}</title>
    </g>
  );
}

export const edgeTypes: EdgeTypes = {
  dependency: DependencyEdge,
  tooltip: DependencyEdge,
};
