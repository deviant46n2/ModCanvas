// On-canvas bezier control-point editor for a single dependency edge. Renders
// two draggable handles (one per end) inside the viewport portal so they live
// in flow coordinates and track pan/zoom. Dragging updates a local draft and
// streams a live preview through `onPreview` (which only rewrites the React
// Flow edge), committing to the graph once via `onCommit` on pointer-up — so
// every drag is a single undoable step instead of hundreds.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { QuestEdgeData, QuestNodeData, EdgeBezierRel } from '../../services/quest-types';
import { computeEdgeGeometry, pickEdgeHandles, handleAnchor, positionForHandle } from '../../core/quest/edge-geometry';
import { questSizeToPixels } from './quest-form-constants';

interface EdgeBezierEditorProps {
  edge: QuestEdgeData;
  sourceNode: QuestNodeData | undefined;
  targetNode: QuestNodeData | undefined;
  gridScale: number;
  bodyScale: number;
  zoom: number;
  onPreview: (edgeId: string, bezier: EdgeBezierRel) => void;
  onCommit: (edgeId: string, bezier: EdgeBezierRel | null) => void;
}

interface DragState {
  which: 'source' | 'target';
  startX: number;
  startY: number;
  base: EdgeBezierRel;
}

export function EdgeBezierEditor({
  edge,
  sourceNode,
  targetNode,
  gridScale,
  bodyScale,
  zoom,
  onPreview,
  onCommit,
}: EdgeBezierEditorProps) {
  const [draft, setDraft] = useState<EdgeBezierRel | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const draftRef = useRef<EdgeBezierRel | null>(null);
  draftRef.current = draft;

  // Default control points: the standard curvature-0.25 handles, derived from
  // the resolved handle anchors. Used only until the user drags for the first
  // time, so "Edit Curve" always starts from the same curve the edge already
  // draws.
  const geometry = useMemo(() => {
    if (!sourceNode || !targetNode) return null;
    const scx = sourceNode.position.x * gridScale;
    const scy = sourceNode.position.y * gridScale;
    const tcx = targetNode.position.x * gridScale;
    const tcy = targetNode.position.y * gridScale;
    const srcSize = questSizeToPixels(sourceNode.size, bodyScale);
    const tgtSize = questSizeToPixels(targetNode.size, bodyScale);
    const anchors = pickEdgeHandles(scx, scy, tcx, tcy);
    const sourceAnchor = handleAnchor(scx, scy, srcSize.width / 2, srcSize.height / 2, anchors.sourceHandle);
    const targetAnchor = handleAnchor(tcx, tcy, tgtSize.width / 2, tgtSize.height / 2, anchors.targetHandle);
    const defaultBezier: EdgeBezierRel = {
      sourceControl: { x: 0, y: 0 },
      targetControl: { x: 0, y: 0 },
    };
    if (!edge.bezier) {
      const g = computeEdgeGeometry(
        sourceAnchor.x, sourceAnchor.y, positionForHandle(anchors.sourceHandle),
        targetAnchor.x, targetAnchor.y, positionForHandle(anchors.targetHandle)
      );
      defaultBezier.sourceControl = { x: g.c1x - sourceAnchor.x, y: g.c1y - sourceAnchor.y };
      defaultBezier.targetControl = { x: g.c2x - targetAnchor.x, y: g.c2y - targetAnchor.y };
    }
    return {
      sourceAnchor,
      targetAnchor,
      bezier: draft ?? edge.bezier ?? defaultBezier,
    };
  }, [edge, sourceNode, targetNode, gridScale, bodyScale, draft]);

  useEffect(() => {
    if (!dragRef.current) return;
    const onMove = (e: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const dFlowX = (e.clientX - drag.startX) / zoom;
      const dFlowY = (e.clientY - drag.startY) / zoom;
      const base = drag.base;
      const next: EdgeBezierRel = {
        sourceControl: { ...base.sourceControl },
        targetControl: { ...base.targetControl },
      };
      if (drag.which === 'source') {
        next.sourceControl = { x: base.sourceControl.x + dFlowX, y: base.sourceControl.y + dFlowY };
      } else {
        next.targetControl = { x: base.targetControl.x + dFlowX, y: base.targetControl.y + dFlowY };
      }
      setDraft(next);
      onPreview(edge.id, next);
    };
    const onUp = () => {
      if (dragRef.current) {
        if (draftRef.current) onCommit(edge.id, draftRef.current);
        dragRef.current = null;
        setDraft(null);
      }
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [edge.id, zoom, onPreview, onCommit]);

  const begin = useCallback(
    (e: React.PointerEvent, which: 'source' | 'target') => {
      e.preventDefault();
      e.stopPropagation();
      if (!geometry) return;
      dragRef.current = {
        which,
        startX: e.clientX,
        startY: e.clientY,
        base: { ...geometry.bezier },
      };
    },
    [geometry]
  );

  if (!geometry || !sourceNode || !targetNode) return null;

  const rel = geometry.bezier;
  const h1 = { x: geometry.sourceAnchor.x + rel.sourceControl.x, y: geometry.sourceAnchor.y + rel.sourceControl.y };
  const h2 = { x: geometry.targetAnchor.x + rel.targetControl.x, y: geometry.targetAnchor.y + rel.targetControl.y };

  return (
    <div className="edge-bezier-editor" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      <svg
        className="edge-bezier-guides"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible' }}
      >
        <line x1={geometry.sourceAnchor.x} y1={geometry.sourceAnchor.y} x2={h1.x} y2={h1.y} />
        <line x1={geometry.targetAnchor.x} y1={geometry.targetAnchor.y} x2={h2.x} y2={h2.y} />
      </svg>
      <span
        className="edge-bezier-handle"
        title="Drag to reshape this end of the curve"
        onPointerDown={(e) => begin(e, 'source')}
        style={{ left: h1.x, top: h1.y }}
      >
        1
      </span>
      <span
        className="edge-bezier-handle"
        title="Drag to reshape this end of the curve"
        onPointerDown={(e) => begin(e, 'target')}
        style={{ left: h2.x, top: h2.y }}
      >
        2
      </span>
    </div>
  );
}
