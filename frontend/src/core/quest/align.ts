// Pure align/distribute math for multi-selected quest nodes. Positions are the
// nodes' FTB grid center coordinates (the same values stored in
// `QuestNodeData.position`), so results can be fed straight into `onUpdateNodes`.
//
// Nodes are center-anchored: aligning "left" lines up the node CENTERS at the
// leftmost center (mirroring the canvas where position is the tile midpoint),
// and distributing spreads the centers evenly between the two extremes.

export type AlignMode = 'left' | 'centerX' | 'right' | 'top' | 'centerY' | 'bottom';
export type DistributeMode = 'horizontal' | 'vertical';

export interface AlignItem {
  id: string;
  position: { x: number; y: number };
}

export type AlignResult = Record<string, { x: number; y: number }>;

// Produce the target positions for an align operation. Never mutates inputs.
export function alignPositions(items: AlignItem[], mode: AlignMode): AlignResult {
  const out: AlignResult = {};
  if (items.length === 0) return out;
  const xs = items.map((i) => i.position.x);
  const ys = items.map((i) => i.position.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;

  for (const item of items) {
    const p = { ...item.position };
    if (mode === 'left') p.x = minX;
    else if (mode === 'right') p.x = maxX;
    else if (mode === 'centerX') p.x = centerX;
    else if (mode === 'top') p.y = minY;
    else if (mode === 'bottom') p.y = maxY;
    else if (mode === 'centerY') p.y = centerY;
    out[item.id] = p;
  }
  return out;
}

// Spread items evenly along one axis between the current extremes, preserving
// each item's offset on the other axis. Requires at least 3 items to be
// meaningful; with fewer the extremes are unchanged so nothing moves.
export function distributePositions(items: AlignItem[], mode: DistributeMode): AlignResult {
  const out: AlignResult = {};
  if (items.length < 3) return out;
  const axis = mode === 'horizontal' ? 'x' : 'y';
  const sorted = [...items].sort((a, b) => a.position[axis] - b.position[axis]);
  const lo = sorted[0].position[axis];
  const hi = sorted[sorted.length - 1].position[axis];
  const step = (hi - lo) / (sorted.length - 1);
  sorted.forEach((item, index) => {
    out[item.id] = { ...item.position, [axis]: lo + step * index };
  });
  return out;
}
