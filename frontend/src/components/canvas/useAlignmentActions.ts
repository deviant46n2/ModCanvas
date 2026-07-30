import { useCallback } from 'react';
import type { Node } from '@xyflow/react';

export function useAlignmentActions(
  selectedNodes: Node[],
  onSetNodes: (updater: (nodes: Node[]) => Node[]) => void,
) {
  const computeBounds = useCallback(() => {
    if (selectedNodes.length === 0) return null;
    const xs = selectedNodes.map(n => n.position.x);
    const ys = selectedNodes.map(n => n.position.y);
    const widths = selectedNodes.map(n => n.measured?.width || 100);
    const heights = selectedNodes.map(n => n.measured?.height || 80);

    return {
      minX: Math.min(...xs),
      maxX: Math.max(...xs.map((x, i) => x + widths[i])),
      minY: Math.min(...ys),
      maxY: Math.max(...ys.map((y, i) => y + heights[i])),
      centerX: (Math.min(...xs) + Math.max(...xs.map((x, i) => x + widths[i]))) / 2,
      centerY: (Math.min(...ys) + Math.max(...ys.map((y, i) => y + heights[i]))) / 2,
    };
  }, [selectedNodes]);

  const alignLeft = useCallback(() => {
    const b = computeBounds();
    if (!b) return;
    onSetNodes(nodes => nodes.map(n =>
      selectedNodes.find(s => s.id === n.id)
        ? { ...n, position: { ...n.position, x: b.minX } }
        : n
    ));
  }, [selectedNodes, computeBounds, onSetNodes]);

  const alignRight = useCallback(() => {
    const b = computeBounds();
    if (!b) return;
    onSetNodes(nodes => nodes.map(n => {
      const sel = selectedNodes.find(s => s.id === n.id);
      if (!sel) return n;
      const w = n.measured?.width || 100;
      return { ...n, position: { ...n.position, x: b.maxX - w } };
    }));
  }, [selectedNodes, computeBounds, onSetNodes]);

  const alignTop = useCallback(() => {
    const b = computeBounds();
    if (!b) return;
    onSetNodes(nodes => nodes.map(n =>
      selectedNodes.find(s => s.id === n.id)
        ? { ...n, position: { ...n.position, y: b.minY } }
        : n
    ));
  }, [selectedNodes, computeBounds, onSetNodes]);

  const alignBottom = useCallback(() => {
    const b = computeBounds();
    if (!b) return;
    onSetNodes(nodes => nodes.map(n => {
      const sel = selectedNodes.find(s => s.id === n.id);
      if (!sel) return n;
      const h = n.measured?.height || 80;
      return { ...n, position: { ...n.position, y: b.maxY - h } };
    }));
  }, [selectedNodes, computeBounds, onSetNodes]);

  const alignCenterH = useCallback(() => {
    const b = computeBounds();
    if (!b) return;
    onSetNodes(nodes => nodes.map(n => {
      const sel = selectedNodes.find(s => s.id === n.id);
      if (!sel) return n;
      const w = n.measured?.width || 100;
      return { ...n, position: { ...n.position, x: b.centerX - w / 2 } };
    }));
  }, [selectedNodes, computeBounds, onSetNodes]);

  const alignCenterV = useCallback(() => {
    const b = computeBounds();
    if (!b) return;
    onSetNodes(nodes => nodes.map(n => {
      const sel = selectedNodes.find(s => s.id === n.id);
      if (!sel) return n;
      const h = n.measured?.height || 80;
      return { ...n, position: { ...n.position, y: b.centerY - h / 2 } };
    }));
  }, [selectedNodes, computeBounds, onSetNodes]);

  const equalSpacingH = useCallback(() => {
    if (selectedNodes.length < 3) return;
    const sorted = [...selectedNodes].sort((a, b) => a.position.x - b.position.x);
    const b = computeBounds();
    if (!b) return;
    const totalWidth = sorted.reduce((sum, n) => sum + (n.measured?.width || 100), 0);
    const gap = (b.maxX - b.minX - totalWidth) / (sorted.length - 1);

    onSetNodes(nodes => {
      let cx = b.minX;
      return nodes.map(n => {
        const idx = sorted.findIndex(s => s.id === n.id);
        if (idx === -1) return n;
        const x = idx === 0 ? cx : (cx += (sorted[idx - 1]?.measured?.width || 100) + gap);
        return { ...n, position: { ...n.position, x } };
      });
    });
  }, [selectedNodes, computeBounds, onSetNodes]);

  const equalSpacingV = useCallback(() => {
    if (selectedNodes.length < 3) return;
    const sorted = [...selectedNodes].sort((a, b) => a.position.y - b.position.y);
    const b = computeBounds();
    if (!b) return;
    const totalHeight = sorted.reduce((sum, n) => sum + (n.measured?.height || 80), 0);
    const gap = (b.maxY - b.minY - totalHeight) / (sorted.length - 1);

    onSetNodes(nodes => {
      let cy = b.minY;
      return nodes.map(n => {
        const idx = sorted.findIndex(s => s.id === n.id);
        if (idx === -1) return n;
        const y = idx === 0 ? cy : (cy += (sorted[idx - 1]?.measured?.height || 80) + gap);
        return { ...n, position: { ...n.position, y } };
      });
    });
  }, [selectedNodes, computeBounds, onSetNodes]);

  const distributeH = useCallback(() => {
    if (selectedNodes.length < 3) return;
    const sorted = [...selectedNodes].sort((a, b) => a.position.x - b.position.x);
    const b = computeBounds();
    if (!b) return;
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    const available = (last.position.x + (last.measured?.width || 100)) - first.position.x - (first.measured?.width || 100);

    onSetNodes(nodes => {
      return nodes.map(n => {
        const idx = sorted.findIndex(s => s.id === n.id);
        if (idx <= 0 || idx >= sorted.length - 1) return n;
        const offset = sorted.slice(0, idx).reduce((sum, s) => sum + (s.measured?.width || 100), 0);
        const x = first.position.x + (first.measured?.width || 100) + idx * (available / (sorted.length - 1)) - offset;
        return { ...n, position: { ...n.position, x } };
      });
    });
  }, [selectedNodes, computeBounds, onSetNodes]);

  const distributeV = useCallback(() => {
    if (selectedNodes.length < 3) return;
    const sorted = [...selectedNodes].sort((a, b) => a.position.y - b.position.y);
    const b = computeBounds();
    if (!b) return;
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    const stepY = (last.position.y - first.position.y) / (sorted.length - 1);

    onSetNodes(nodes => {
      return nodes.map(n => {
        const idx = sorted.findIndex(s => s.id === n.id);
        if (idx <= 0 || idx >= sorted.length - 1) return n;
        return { ...n, position: { ...n.position, y: first.position.y + idx * stepY } };
      });
    });
  }, [selectedNodes, computeBounds, onSetNodes]);

  return {
    alignLeft, alignRight, alignTop, alignBottom,
    alignCenterH, alignCenterV,
    equalSpacingH, equalSpacingV,
    distributeH, distributeV,
  };
}
