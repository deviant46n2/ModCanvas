import type { EdgeTypes, EdgeProps } from '@xyflow/react';
import { computeEdgeGeometry, type EdgeBezierRel } from '../../core/quest/edge-geometry';

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

// Direction cue: a dot on the prerequisite end plus a chevron on the bezier
// midpoint pointing at the dependent quest. When an edge has manual bezier
// control points (`data.bezierRel`), the whole path — including the midpoint
// and tangent used by the chevron — is recomputed from them so the curve and
// its arrow stay in agreement.
function DependencyEdgeBody({
  sourceX,
  sourceY,
  sourcePosition,
  targetX,
  targetY,
  targetPosition,
  bezier,
}: {
  sourceX: number;
  sourceY: number;
  sourcePosition: any;
  targetX: number;
  targetY: number;
  targetPosition: any;
  bezier?: EdgeBezierRel | null;
}) {
  const geom = computeEdgeGeometry(sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition, bezier);
  const tangentLength = Math.hypot(geom.tx, geom.ty);
  const chevronLength = 10;
  const chevronWidth = 6.4;
  const chevron = tangentLength > 1e-4
    ? (() => {
        const ux = geom.tx / tangentLength;
        const uy = geom.ty / tangentLength;
        const nx = -uy;
        const ny = ux;
        const tipX = geom.mx + ux * chevronLength * 0.45;
        const tipY = geom.my + uy * chevronLength * 0.45;
        const backX = geom.mx - ux * chevronLength * 0.55;
        const backY = geom.my - uy * chevronLength * 0.55;
        const b1x = backX + nx * chevronWidth * 0.5;
        const b1y = backY + ny * chevronWidth * 0.5;
        const b2x = backX - nx * chevronWidth * 0.5;
        const b2y = backY - ny * chevronWidth * 0.5;
        return `M ${tipX} ${tipY} L ${b1x} ${b1y} L ${b2x} ${b2y} Z`;
      })()
    : null;

  return { path: geom.path, chevron, labelX: geom.mx, labelY: geom.my };
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
  data,
}: EdgeProps) {
  const stroke = (style?.stroke as string) || NORMAL_COLOR;
  const bezier = (data as any)?.bezierRel as EdgeBezierRel | null | undefined;
  const { path, chevron, labelX, labelY } = DependencyEdgeBody({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    bezier,
  });
  const isCycle = stroke === CYCLE_COLOR;
  const strokeWidth = isCycle ? 3.5 : Math.max(1.5, Number(style?.strokeWidth) || 2);
  const opacity = isCycle ? 1 : (style?.opacity as number) ?? 0.85;

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
