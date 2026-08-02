import React, { useCallback, useState, useEffect, useMemo, useRef } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  MarkerType, ConnectionMode, ConnectionLineType, reconnectEdge,
  MiniMap,
  Controls,
  Background,
  BackgroundVariant,
  ViewportPortal,
  useNodesState,
  useEdgesState,
  useReactFlow,
  useViewport,
} from '@xyflow/react';
import type { Node, Edge, Connection, NodeChange, EdgeChange } from '@xyflow/react';
import type { QuestGraphData, QuestChapter, QuestEdgeData, QuestNodeData, ChapterImage } from '../../services/quest-types';
import { questIconUrl } from './questIcons';
import { textureDisplayUrl } from '../../services/texture-loader';
import { shapeTextureKeys, type ShapeTextures } from '../../core/quest/quest-shapes';
import { NORMAL_COLOR, CYCLE_COLOR, detectCycles } from './quest-edges';
import { normalizeShape, questSizeToPixels, snapToGridStep } from './quest-form-constants';
import { nodeTypes } from './quest-nodes';
import { generateFtbHexId } from './quest-helpers';
import { ChapterImagesLayer } from './ChapterImagesLayer';
import { ChapterDecorationsCanvas } from './ChapterDecorationsCanvas';
import { DecorationPanel } from './DecorationPanel';
import { defaultDecorationImage } from './decoration-picker';
import { computeVisibility, isLocked, type ProgressState } from '../../core/quest/progress';
import '@xyflow/react/dist/style.css';
import './QuestCanvas.css';

interface QuestCanvasProps {
  questGraph: QuestGraphData;
  chapters: QuestChapter[];
  activeChapter: string | null;
  onUpdateNode: (nodeId: string, data: Partial<QuestNodeData>) => void;
  onUpdateNodes: (updates: Array<{ nodeId: string; data: Partial<QuestNodeData> }>) => void;
  onAddEdge: (edge: { source: string; target: string }) => void;
  onUpdateEdge: (edgeId: string, data: { source?: string; target?: string }) => void;
  onDeleteNode: (nodeId: string) => void;
  onDeleteNodes?: (nodeIds: string[]) => void;
  onPasteNodes?: (nodes: QuestNodeData[], edges: QuestEdgeData[]) => void;
  onDeleteEdge: (edgeId: string) => void;
  onAddNode: (chapterId: string) => void;
  onAddLink?: (chapterId: string) => void;
  onUpdateChapterImages: (chapterId: string, images: ChapterImage[]) => void;
  selectedNodeId: string | null;
  setSelectedNodeId: (id: string | null) => void;
  textureIndex?: Record<string, string>;
  questBackgroundUrl?: string | null;
  simMode?: boolean;
  setSimMode?: (on: boolean) => void;
  simProgress?: ProgressState;
  onSetQuestProgress?: (questId: string, status: 'started' | 'complete' | null) => void;
  onCompleteAll?: () => void;
  onResetAll?: () => void;
}

// FTB Quests coordinate spacing — display scale, not snap grain.
// Kept at exactly 7:6 vs NODE_BASE_PX to mirror the in-game quest panel, where
// position pitch = zoom*(3/2 + quest_spacing/4) and body = zoom*(3/2) at the
// default quest_spacing=1.0 → pitch:body = 7:6.
export const GRID_SCALE = 42;

// Resolve a node's shape textures from the materialized texture index. Keys
// come from the instance's FTB Quests jar (`ftbquests:textures/shapes/...`) and
// are materialized lazily at runtime — nothing is bundled with the app. Returns
// undefined until the data URLs are available so nodes fall back to plain
// styling during load.
function getShapeTextures(
  shape: string,
  textureIndex: Record<string, string>,
): ShapeTextures | undefined {
  const keys = shapeTextureKeys(normalizeShape(shape))
  const background = textureDisplayUrl(textureIndex, keys.background)
  const outline = textureDisplayUrl(textureIndex, keys.outline)
  const shapeUrl = textureDisplayUrl(textureIndex, keys.shape)
  if (!background && !outline && !shapeUrl) return undefined
  return { background: background || '', outline: outline || '', shape: shapeUrl || '' }
}

// Base pixel size for a 1.0x quest node. Actual size is derived per quest from
// `node.size` (FTB grid units, default 24x24 = 1.0x) so scaled quests are
// visually distinguishable on the canvas. 36 : 42 (= 6:7 with GRID_SCALE) keeps
// the editor's quest-body:grid-pitch ratio identical to the in-game quest panel.
export const NODE_BASE_PX = 36;

function getNodeSize(node: QuestNodeData): { width: number; height: number } {
  return questSizeToPixels(node.size, NODE_BASE_PX);
}

export function QuestCanvas(props: QuestCanvasProps) {
  return (
    <ReactFlowProvider>
      <QuestCanvasInner {...props} />
    </ReactFlowProvider>
  );
}

function QuestCanvasInner({
  questGraph,
  chapters,
  activeChapter,
  onUpdateNodes,
  onAddEdge,
  onUpdateEdge,
  onDeleteNode: _onDeleteNode,
  onDeleteNodes,
  onPasteNodes,
  onDeleteEdge,
  onAddNode,
  onAddLink,
  onUpdateChapterImages,
  selectedNodeId: _selectedNodeId,
  setSelectedNodeId,
  textureIndex,
  questBackgroundUrl,
  simMode = false,
  setSimMode,
  simProgress = {},
  onSetQuestProgress,
  onCompleteAll,
  onResetAll,
}: QuestCanvasProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [showMiniMap, setShowMiniMap] = useState(true);
  const [showBackground, setShowBackground] = useState(true);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [connectMode, setConnectMode] = useState(false);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [decorEditMode, setDecorEditMode] = useState(false);
  const [selectedDecoIndex, setSelectedDecoIndex] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const clipboardRef = useRef<{ nodes: QuestNodeData[]; edges: QuestEdgeData[] } | null>(null);
  const { fitView } = useReactFlow();
  const { zoom } = useViewport();

  const filteredNodeIds = useMemo(() => {
    if (!activeChapter) return new Set(questGraph.nodes.map((n: QuestNodeData) => n.id));
    return new Set(
      questGraph.nodes.filter((n: QuestNodeData) => n.chapter_id === activeChapter).map((n: QuestNodeData) => n.id)
    );
  }, [questGraph.nodes, activeChapter]);

  const filteredEdges = useMemo(() => {
    return questGraph.edges.filter(
      (e: QuestEdgeData) => filteredNodeIds.has(e.source) && filteredNodeIds.has(e.target)
    );
  }, [questGraph.edges, filteredNodeIds]);

  const cycleEdges = useMemo(() => detectCycles(filteredEdges), [filteredEdges]);
  const isCycleEdge = useCallback(
    (e: Edge) => cycleEdges.has(`${e.source}->${e.target}`),
    [cycleEdges]
  );

  // Progress-simulation lookup: per-quest visibility + lock state derived from
  // the current chapter's dependency edges and the sim's completion map. Hidden
  // quests are dimmed on the canvas; locked ones get a lock badge.
  const questsById = useMemo(() => {
    const map: Record<string, QuestNodeData> = {};
    for (const n of questGraph.nodes) map[n.id] = n;
    return map;
  }, [questGraph.nodes]);

  const simStatusById = useMemo(() => {
    const status: Record<string, { hidden: boolean; locked: boolean }> = {};
    for (const n of questGraph.nodes) {
      if (n.node_type !== 'quest') continue;
      const vis = computeVisibility(n.id, questsById, filteredEdges, simProgress);
      status[n.id] = {
        hidden: !vis.visible,
        locked: !vis.visible ? false : isLocked(n.id, filteredEdges, simProgress),
      };
    }
    return status;
  }, [questGraph.nodes, questsById, filteredEdges, simProgress]);

  const textureVersionRef = useRef(0);
  const prevTextureIndexRef = useRef<Record<string, string> | undefined>(undefined);
  useEffect(() => {
    if (textureIndex && textureIndex !== prevTextureIndexRef.current) {
      prevTextureIndexRef.current = textureIndex;
      textureVersionRef.current += 1;
    }
    const newNodes: Node[] = questGraph.nodes
      .filter((n: QuestNodeData) => filteredNodeIds.has(n.id))
      .map((node: QuestNodeData) => {
        const pixelSize = getNodeSize(node);
        let iconKey = node.icon;
        if (!iconKey && node.objectives?.length > 0) {
          iconKey = node.objectives[0].target;
        }
        const iconUrl = iconKey ? questIconUrl(iconKey, textureIndex || {}) : undefined;
        const smartFilter: string | undefined =
          node.objectives?.find((o) => o.smart_filter)?.smart_filter || undefined;
        // Center anchor: position is node center, so offset by half size
        const centerX = node.position.x * GRID_SCALE;
        const centerY = node.position.y * GRID_SCALE;
        return {
          id: node.id,
          type: 'quest',
          position: {
            x: centerX - pixelSize.width / 2,
            y: centerY - pixelSize.height / 2,
          },
          selected: selectedIds.has(node.id),
          data: {
            ...node,
            iconUrl,
            iconDataUrl: iconUrl,
            smartFilter,
            textureIndex,
            pixelSize,
            shapeTextures: getShapeTextures(node.shape || 'square', textureIndex || {}),
            simStatus: simMode ? simStatusById[node.id] : undefined,
            simComplete: simMode ? simProgress[node.id] === 'complete' : false,
          },
          style: {
            width: pixelSize.width,
            height: pixelSize.height,
          },
        };
      });

    const newEdges: Edge[] = filteredEdges.map((edge: QuestEdgeData) => {
      const srcNode = newNodes.find((n) => n.id === edge.source);
      const tgtNode = newNodes.find((n) => n.id === edge.target);
      let sourceHandle: string | undefined;
      let targetHandle: string | undefined;
      if (srcNode && tgtNode) {
        const srcSize = (srcNode.data as any)?.pixelSize || { width: NODE_BASE_PX, height: NODE_BASE_PX };
        const tgtSize = (tgtNode.data as any)?.pixelSize || { width: NODE_BASE_PX, height: NODE_BASE_PX };
        const scx = srcNode.position.x + srcSize.width / 2;
        const scy = srcNode.position.y + srcSize.height / 2;
        const tcx = tgtNode.position.x + tgtSize.width / 2;
        const tcy = tgtNode.position.y + tgtSize.height / 2;
        const dx = tcx - scx;
        const dy = tcy - scy;
        const ax = Math.abs(dx);
        const ay = Math.abs(dy);
        if (ax > ay) {
          sourceHandle = dx > 0 ? 'sr' : 'sl';
          targetHandle = dx > 0 ? 'l' : 'r';
        } else {
          sourceHandle = dy > 0 ? 'sb' : 'st';
          targetHandle = dy > 0 ? 't' : 'b';
        }
      }
      const isCycle = cycleEdges.has(`${edge.source}->${edge.target}`);
      return {
        id: edge.id,
        source: edge.source,
        target: edge.target,
        sourceHandle,
        targetHandle,
        // Cycle edges are always flagged red (survives the hover-dimming pass).
        style: isCycle ? { stroke: CYCLE_COLOR, strokeWidth: 3.5, opacity: 1 } : undefined,
        markerEnd: isCycle
          ? { type: MarkerType.ArrowClosed, width: 24, height: 24, color: CYCLE_COLOR }
          : undefined,
      };
    });

    setNodes(newNodes);
    setEdges(newEdges);
  }, [questGraph.nodes, filteredEdges, filteredNodeIds, textureIndex, cycleEdges, selectedIds, simMode, simProgress, simStatusById, setNodes, setEdges]);

  useEffect(() => {
    if (nodes.length > 0) {
      setTimeout(() => fitView({ duration: 300, padding: 0.15 }), 100);
    }
  }, [nodes.length, fitView]);

  // Node-hover highlighting. Keeps each edge's base stroke (e.g. cycle red)
  // intact while dimming unrelated edges so the active quest's dependencies
  // pop.
  useEffect(() => {
    setEdges((eds) => eds.map((edge) => {
      const isCycle = isCycleEdge(edge);
      if (!hoveredNodeId) {
        return {
          ...edge,
          style: isCycle ? { stroke: CYCLE_COLOR, strokeWidth: 3.5, opacity: 1 } : undefined,
        };
      }
      const isConnected = edge.source === hoveredNodeId || edge.target === hoveredNodeId;
      if (isConnected) {
        return {
          ...edge,
          style: isCycle
            ? { stroke: CYCLE_COLOR, strokeWidth: 3.5, opacity: 1 }
            : { stroke: NORMAL_COLOR, strokeWidth: 2.5, opacity: 1 },
        };
      }
      return { ...edge, style: { stroke: '#444', strokeWidth: 1, opacity: 0.06 } };
    }));
  }, [hoveredNodeId, isCycleEdge, setEdges]);

  const handleConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return;
      onAddEdge({ source: connection.source, target: connection.target });
    },
    [onAddEdge]
  );

  const handleNodesChange = useCallback((changes: NodeChange[]) => {
    for (const change of changes) {
      if (change.type === 'select' && typeof change.id === 'string') {
        setSelectedIds(prev => {
          const next = new Set(prev);
          if (change.selected) next.add(change.id);
          else next.delete(change.id);
          return next;
        });
      }
    }
    onNodesChange(changes);
  }, [onNodesChange]);

  const handleEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      for (const change of changes) {
        if (change.type === 'select') {
          setSelectedEdgeId(change.selected ? change.id : null);
        } else if (change.type === 'remove') {
          setSelectedEdgeId((prev) => (prev === change.id ? null : prev));
        }
      }
      onEdgesChange(changes);
    },
    [onEdgesChange]
  );

  // Re-drag an arrow endpoint onto another quest to reparent the dependency.
  const handleReconnect = useCallback(
    (oldEdge: Edge, newConnection: Connection) => {
      if (!newConnection.source || !newConnection.target) return;
      setEdges((eds) => reconnectEdge(oldEdge, newConnection, eds));
      onUpdateEdge(oldEdge.id, {
        source: newConnection.source,
        target: newConnection.target,
      });
    },
    [setEdges, onUpdateEdge]
  );

  const handleEdgeClick = useCallback(
    (_: React.MouseEvent, edge: Edge) => {
      setSelectedNodeId(null);
      setSelectedEdgeId(edge.id);
    },
    [setSelectedNodeId]
  );

  // Double-click a dependency arrow to remove it.
  const handleEdgeDoubleClick = useCallback(
    (_: React.MouseEvent, edge: Edge) => {
      onDeleteEdge(edge.id);
      setSelectedEdgeId(null);
    },
    [onDeleteEdge]
  );

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedEdgeId) {
        const el = document.activeElement as HTMLElement | null;
        if (el && ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)) return;
        e.preventDefault();
        onDeleteEdge(selectedEdgeId);
        setSelectedEdgeId(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedEdgeId, onDeleteEdge]);

  const copySelected = useCallback(() => {
    if (selectedIds.size === 0) return;
    const copiedNodes = questGraph.nodes.filter(n => selectedIds.has(n.id));
    if (copiedNodes.length === 0) return;
    const ids = new Set(copiedNodes.map(n => n.id));
    const copiedEdges = questGraph.edges.filter(e => ids.has(e.source) && ids.has(e.target));
    clipboardRef.current = {
      nodes: copiedNodes.map(n => ({ ...n })),
      edges: copiedEdges.map(e => ({ ...e })),
    };
  }, [selectedIds, questGraph.nodes, questGraph.edges]);

  const pasteClipboard = useCallback(() => {
    if (!clipboardRef.current || clipboardRef.current.nodes.length === 0) return;
    const oldToNew = new Map<string, string>();
    const newNodes: QuestNodeData[] = clipboardRef.current.nodes.map(n => {
      const newId = generateFtbHexId();
      oldToNew.set(n.id, newId);
      return { ...n, id: newId, position: { x: n.position.x + 3, y: n.position.y + 3 } };
    });
    const newEdges: QuestEdgeData[] = clipboardRef.current.edges
      .filter(e => oldToNew.has(e.source) && oldToNew.has(e.target))
      .map(e => ({
        ...e,
        id: generateFtbHexId(),
        source: oldToNew.get(e.source)!,
        target: oldToNew.get(e.target)!,
      }));
    onPasteNodes?.(newNodes, newEdges);
    setSelectedIds(new Set(newNodes.map(n => n.id)));
  }, [onPasteNodes]);

  const selectAllNodes = useCallback(() => {
    setSelectedIds(new Set(filteredNodeIds));
  }, [filteredNodeIds]);

  const nudgeSelected = useCallback((dx: number, dy: number) => {
    if (selectedIds.size === 0) return;
    const updates: Array<{ nodeId: string; data: Partial<QuestNodeData> }> = [];
    for (const n of questGraph.nodes) {
      if (!selectedIds.has(n.id)) continue;
      updates.push({
        nodeId: n.id,
        data: { position: { x: n.position.x + dx, y: n.position.y + dy } },
      });
    }
    onUpdateNodes(updates);
  }, [selectedIds, questGraph.nodes, onUpdateNodes]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const el = document.activeElement as HTMLElement | null;
      if (el && ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        selectAllNodes();
        return;
      }
      if (mod && e.key.toLowerCase() === 'c') {
        e.preventDefault();
        copySelected();
        return;
      }
      if (mod && e.key.toLowerCase() === 'v') {
        e.preventDefault();
        pasteClipboard();
        return;
      }
      if (selectedIds.size === 0) return;
      const nudge = e.shiftKey ? 0.5 : 1.0;
      if (e.key === 'ArrowUp') { e.preventDefault(); nudgeSelected(0, -nudge); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); nudgeSelected(0, nudge); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); nudgeSelected(-nudge, 0); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); nudgeSelected(nudge, 0); }
      else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        onDeleteNodes?.(Array.from(selectedIds));
        setSelectedIds(new Set());
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedIds, selectAllNodes, copySelected, pasteClipboard, nudgeSelected, onDeleteNodes]);

  const handleNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      setSelectedNodeId(node.id);
      setSelectedEdgeId(null);
    },
    [setSelectedNodeId]
  );

  const handleNodeMouseEnter = useCallback(
    (_: React.MouseEvent, node: Node) => {
      setHoveredNodeId(node.id);
    },
    []
  );

  const handlePaneClick = useCallback(() => {
    setSelectedNodeId(null);
    setHoveredNodeId(null);
    setSelectedEdgeId(null);
    setSelectedDecoIndex(null);
  }, [setSelectedNodeId]);

  const handleNodeMouseLeave = useCallback(() => {
    setHoveredNodeId(null);
  }, []);

  // In Simulate mode, double-clicking a quest toggles its simulated completion.
  const handleNodeDoubleClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      if (!simMode || !onSetQuestProgress) return;
      const id = node.id;
      onSetQuestProgress(id, simProgress[id] === 'complete' ? null : 'complete');
    },
    [simMode, onSetQuestProgress, simProgress]
  );

  const handleNodeDragStop = useCallback(
    (_: any, node: Node, currentNodes?: Node[]) => {
      // Mirror in-game FTB (QuestPanel.draw): grid snap grain is
      // gridScale × minSize of the selection, and Shift disables snapping.
      const shiftHeld = !!_?.shiftKey;
      const gridScale = questGraph.grid_scale || 0.5;
      // Smallest selected item's width in FTB grid units (24 units = 1.0x).
      // Images are not draggable quest nodes here, so only quests contribute.
      const dragged = currentNodes && currentNodes.length > 0 ? currentNodes : [node];
      let minSize = 1;
      for (const n of dragged) {
        const qn = n.data as any;
        const w = (qn?.size?.width || 24) / 24;
        minSize = Math.min(minSize, w);
      }

      // Snap the group's min corner (in FTB grid units), preserving offsets —
      // same as in-game QuestPanel.mousePressed placing objects at
      // snapped anchor + (obj.pos - minCorner).
      let minX = Infinity, minY = Infinity;
      for (const n of dragged) {
        const size = (n.data as any)?.pixelSize || { width: NODE_BASE_PX, height: NODE_BASE_PX };
        minX = Math.min(minX, (n.position.x + size.width / 2) / GRID_SCALE);
        minY = Math.min(minY, (n.position.y + size.height / 2) / GRID_SCALE);
      }
      const snapped = (v: number) => (shiftHeld ? v : snapToGridStep(v, gridScale, minSize));
      const dx = snapped(minX) - minX;
      const dy = snapped(minY) - minY;

      const updates: Array<{ nodeId: string; data: Partial<QuestNodeData> }> = [];
      for (const n of dragged) {
        const size = (n.data as any)?.pixelSize || { width: NODE_BASE_PX, height: NODE_BASE_PX };
        const gridX = (n.position.x + size.width / 2) / GRID_SCALE + dx;
        const gridY = (n.position.y + size.height / 2) / GRID_SCALE + dy;
        updates.push({ nodeId: n.id, data: { position: { x: gridX, y: gridY } } });
      }
      onUpdateNodes(updates);
    },
    [onUpdateNodes, questGraph.grid_scale]
  );

  const handleAddNode = useCallback(
    (chapterId: string) => {
      onAddNode(chapterId);
    },
    [onAddNode]
  );

  const handleFitView = useCallback(() => {
    fitView({ duration: 500 });
  }, [fitView]);

  const activeChapterName = useMemo(() => {
    if (!activeChapter || !chapters) return '';
    const ch = chapters.find((c: QuestChapter) => c.id === activeChapter);
    return ch?.title || 'Untitled';
  }, [activeChapter, chapters]);

  const activeChapterNodes = questGraph.nodes.filter((n: QuestNodeData) => n.chapter_id === activeChapter);

  const activeChapterImages = useMemo(() => {
    if (!activeChapter) return [];
    const ch = chapters.find((c: QuestChapter) => c.id === activeChapter);
    return ch?.images || [];
  }, [activeChapter, chapters]);

  const selectedEdge = selectedEdgeId
    ? filteredEdges.find((e: QuestEdgeData) => e.id === selectedEdgeId) || null
    : null;

  const nodeLabelById = useCallback(
    (id: string) => {
      const node = questGraph.nodes.find((n: QuestNodeData) => n.id === id);
      return node?.label || id;
    },
    [questGraph.nodes]
  );

  return (
    <div className="quest-canvas-container">
      <div className="canvas-toolbar">
        <div className="toolbar-group">
          <button className="toolbar-btn" onClick={handleFitView} title="Fit View">
            🎯 Fit
          </button>
          <button
            className={`toolbar-btn${connectMode ? ' toolbar-btn-active' : ''}`}
            onClick={() => {
              setConnectMode((m) => !m);
              setSelectedEdgeId(null);
            }}
            title="Toggle dependency editing: drag between quest connection ports"
          >
            🔗 Connect
          </button>
        </div>
        <div className="toolbar-group">
          <label>
            <input
              type="checkbox"
              checked={showMiniMap}
              onChange={(e) => setShowMiniMap(e.target.checked)}
            />
            Mini Map
          </label>
          <label>
            <input
              type="checkbox"
              checked={showBackground}
              onChange={(e) => setShowBackground(e.target.checked)}
            />
            Grid
          </label>
          {activeChapter && (
            <button
              className={`toolbar-btn${decorEditMode ? ' toolbar-btn-active' : ''}`}
              onClick={() => {
                setDecorEditMode((m) => !m);
                setSelectedDecoIndex(null);
              }}
              title="Edit quest log decoration images for this chapter"
            >
              🖼 Decorations
            </button>
          )}
        </div>
        <div className="toolbar-group">
          <button
            className={`toolbar-btn${simMode ? ' toolbar-btn-active' : ''}`}
            onClick={() => setSimMode?.(!simMode)}
            title="Toggle progress simulation: preview hidden/locked quests, complete or reset instantly"
          >
            🧪 Simulate
          </button>
          {simMode && (
            <>
              <button className="toolbar-btn" onClick={onCompleteAll} title="Complete every quest in this chapter instantly">
                ✓ Complete All
              </button>
              <button className="toolbar-btn" onClick={onResetAll} title="Reset every quest in this chapter">
                ↺ Reset All
              </button>
            </>
          )}
        </div>
        <div className="toolbar-group">
          <span className="canvas-chapter-title" style={{ fontSize: 11, fontWeight: 600, color: 'var(--ftb-accent)', marginRight: 12 }}>
            {activeChapterName || (activeChapter ? 'Untitled' : 'All Chapters')}
          </span>
          <span className="canvas-stats">
            {activeChapterNodes.length} quests, {filteredEdges.length} connections
          </span>
          {cycleEdges.size > 0 && (
            <span className="cycle-warning" title="Dependency loops must be broken before quests unlock properly">
              ⚠ {cycleEdges.size} circular connection{cycleEdges.size > 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>

      <div className={`quest-canvas-wrapper${questBackgroundUrl ? ' has-backdrop' : ''}${connectMode ? ' connect-mode' : ''}`}>
        {questBackgroundUrl && (
          <div
            className="quest-canvas-backdrop"
            style={{ backgroundImage: `url(${questBackgroundUrl})` }}
          />
        )}
        {connectMode && (
          <div className="connect-mode-banner">
            Drag from a quest port to another quest to create a dependency arrow.
            <button className="connect-mode-close" onClick={() => setConnectMode(false)} title="Exit connect mode">
              ✕
            </button>
          </div>
        )}
        <ViewportPortal>
          {!decorEditMode && (
            <ChapterImagesLayer
              images={activeChapterImages}
              textureIndex={textureIndex}
              gridScale={GRID_SCALE}
              bodyScale={NODE_BASE_PX}
            />
          )}
        </ViewportPortal>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={handleNodesChange}
          onEdgesChange={handleEdgesChange}
          onConnect={handleConnect}
          onReconnect={handleReconnect}
          onNodeClick={handleNodeClick}
          onNodeDoubleClick={handleNodeDoubleClick}
          onNodeMouseEnter={handleNodeMouseEnter}
          onNodeMouseLeave={handleNodeMouseLeave}
          onEdgeClick={handleEdgeClick}
          onEdgeDoubleClick={handleEdgeDoubleClick}
          onPaneClick={handlePaneClick}
          onNodeDragStop={handleNodeDragStop}
          defaultEdgeOptions={{ type: 'dependency', animated: false, style: { stroke: NORMAL_COLOR, strokeWidth: 1.5, opacity: 0.5 }, markerEnd: { type: MarkerType.ArrowClosed, width: 24, height: 24, color: NORMAL_COLOR } }}
          connectionMode={ConnectionMode.Loose}
          connectionLineType={ConnectionLineType.Straight}
          connectionLineStyle={{ stroke: NORMAL_COLOR, strokeWidth: 2, strokeDasharray: '6 4' }}
          edgesReconnectable
          reconnectRadius={28}
          fitView={false}
          panOnDrag
          zoomOnScroll
          zoomOnPinch
          minZoom={0.1}
          maxZoom={64}
          defaultViewport={{ x: 0, y: 0, zoom: 1 }}
          nodesDraggable={!connectMode}
          nodesConnectable={connectMode}
        >
          {showBackground && <Background variant={BackgroundVariant.Dots} gap={GRID_SCALE} size={1} color="#3a3a3a" />}
          {showMiniMap && <MiniMap nodeColor={(node: any) => (node.data?.color as string) || '#89b4fa'} />}
          <Controls />
        </ReactFlow>

        {activeChapter && !decorEditMode && !connectMode && (
          <div className="canvas-overlay">
            <div className="chapter-add-button" onClick={() => handleAddNode(activeChapter)}>
              + Add Quest
            </div>
            <div className="chapter-add-button chapter-add-link-button" onClick={() => onAddLink?.(activeChapter)} title="Add a quest link that references another quest (cross-chapter)">
              🔗 Add Link
            </div>
          </div>
        )}

        {selectedEdge && (
          <div className="edge-action-chip">
            <span className="edge-action-label">
              {nodeLabelById(selectedEdge.source)} → {nodeLabelById(selectedEdge.target)}
            </span>
            <button
              className="edge-action-delete"
              onClick={() => {
                onDeleteEdge(selectedEdge.id);
                setSelectedEdgeId(null);
              }}
              title="Remove this dependency arrow (Del)"
            >
              🗑 Remove connection
            </button>
          </div>
        )}

        {decorEditMode && activeChapter && (
          <>
            <ViewportPortal>
              <ChapterDecorationsCanvas
                images={activeChapterImages}
                textureIndex={textureIndex}
                gridScale={GRID_SCALE}
                bodyScale={NODE_BASE_PX}
                zoom={zoom}
                selectedIndex={selectedDecoIndex}
                onSelect={setSelectedDecoIndex}
                onChange={(imgs) => onUpdateChapterImages(activeChapter, imgs)}
              />
            </ViewportPortal>
            <DecorationPanel
              textureIndex={textureIndex}
              images={activeChapterImages}
              selectedIndex={selectedDecoIndex}
              onAddImage={(key) =>
                onUpdateChapterImages(activeChapter, [...activeChapterImages, defaultDecorationImage(key)])
              }
              onChangeImages={(imgs) => onUpdateChapterImages(activeChapter, imgs)}
            />
          </>
        )}
      </div>
    </div>
  );
}

export default QuestCanvas;
