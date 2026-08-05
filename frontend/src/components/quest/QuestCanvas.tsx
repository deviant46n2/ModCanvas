import React, { useCallback, useState, useEffect, useMemo, useRef, useReducer } from 'react';
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
import type { QuestGraphData, QuestChapter, QuestEdgeData, QuestNodeData, ChapterImage, EdgeBezierRel } from '../../services/quest-types';
import { questIconUrl } from './questIcons';
import { subscribeEngineConnectChange } from '../../services/engine-render';
import { textureDisplayUrl } from '../../services/texture-loader';
import { shapeTextureKeys, type ShapeTextures } from '../../core/quest/quest-shapes';
import { NORMAL_COLOR, CYCLE_COLOR, detectCycles } from './quest-edges';
import { normalizeShape, questSizeToPixels, snapToGridStep, OBJECTIVE_TYPES } from './quest-form-constants';
import { nodeTypes } from './quest-nodes';
import { generateFtbHexId } from './quest-helpers';
import { QuestContextMenu, type QuestCtxMenuState } from './QuestContextMenu';
import { KeyboardShortcutsOverlay } from './keyboard-shortcuts'
import { ChapterImagesLayer } from './ChapterImagesLayer';
import { ChapterDecorationsCanvas } from './ChapterDecorationsCanvas';
import { DecorationPanel } from './DecorationPanel';
import { EdgeBezierEditor } from './EdgeBezierEditor';
import { QuestSearchBar, AlignDistributeControls, EditLockButton, ThemePresetPicker } from './canvas-tools'
import { WarnIcon, XIcon } from '../ui/icons';
import { alignPositions, distributePositions, type AlignMode, type DistributeMode } from '../../core/quest/align';
import { searchQuestNodes } from '../../core/quest/search';
import { pickEdgeHandles } from '../../core/quest/edge-geometry';
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
  onUpdateEdgeBezier?: (edgeId: string, bezier: EdgeBezierRel | null) => void;
  onApplyThemePreset?: (presetId: string) => void;
  onDeleteNode: (nodeId: string) => void;
  onDeleteNodes?: (nodeIds: string[]) => void;
  onPasteNodes?: (nodes: QuestNodeData[], edges: QuestEdgeData[]) => void;
  onDeleteEdge: (edgeId: string) => void;
  onAddNode: (chapterId: string, position?: { x: number; y: number }) => void;
  onAddLink?: (chapterId: string, position?: { x: number; y: number }) => void;
  onAddQuestWithTask?: (chapterId: string, objectiveType: string, position?: { x: number; y: number }) => void;
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
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
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
  onUpdateNode,
  onAddEdge,
  onUpdateEdge,
  onUpdateEdgeBezier,
  onApplyThemePreset,
  onDeleteNode: _onDeleteNode,
  onDeleteNodes,
  onPasteNodes,
  onDeleteEdge,
  onAddNode,
  onAddLink,
  onAddQuestWithTask,
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
  onUndo,
  onRedo,
  canUndo,
  canRedo,
}: QuestCanvasProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [showMiniMap, setShowMiniMap] = useState(true);
  const [showBackground, setShowBackground] = useState(true);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [renameNonce, setRenameNonce] = useState<{ nodeId: string; n: number } | null>(null);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [connectMode, setConnectMode] = useState(false);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [decorEditMode, setDecorEditMode] = useState(false);
  const [selectedDecoIndex, setSelectedDecoIndex] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [ctxMenu, setCtxMenu] = useState<QuestCtxMenuState | null>(null);
  const cursorRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const clipboardRef = useRef<{ nodes: QuestNodeData[]; edges: QuestEdgeData[] } | null>(null);
  const { fitView, screenToFlowPosition } = useReactFlow();
  const { zoom } = useViewport();

  // Book-level visual palette (theme presets) overrides the hardcoded defaults.
  const edgeColor = questGraph.edge_color || NORMAL_COLOR;
  const cycleColor = questGraph.edge_cycle_color || CYCLE_COLOR;

  // Search-filter state. A non-empty query dims non-matching quests and
  // highlights the matches; Enter focuses the first match.
  const [searchQuery, setSearchQuery] = useState('');
  const searchActive = searchQuery.trim().length > 0;

  // Read-only "View" lock: quests can be inspected/navigated but not mutated.
  const [editLocked, setEditLocked] = useState(false);
  const [bezierEditEdgeId, setBezierEditEdgeId] = useState<string | null>(null);

  const filteredNodeIds = useMemo(() => {
    if (!activeChapter) {
      // Never render "every chapter at once": fall back to the first chapter
      // when one exists. This guards against a stale/null active chapter
      // (e.g. switching packs) showing all quests superimposed.
      const fallback = chapters[0]?.id;
      if (fallback) {
        return new Set(
          questGraph.nodes
            .filter((n: QuestNodeData) => n.chapter_id === fallback)
            .map((n: QuestNodeData) => n.id)
        );
      }
      return new Set(questGraph.nodes.map((n: QuestNodeData) => n.id));
    }
    return new Set(
      questGraph.nodes.filter((n: QuestNodeData) => n.chapter_id === activeChapter).map((n: QuestNodeData) => n.id)
    );
  }, [questGraph.nodes, activeChapter, chapters]);

  const filteredEdges = useMemo(() => {
    return questGraph.edges.filter(
      (e: QuestEdgeData) => filteredNodeIds.has(e.source) && filteredNodeIds.has(e.target)
    );
  }, [questGraph.edges, filteredNodeIds]);

  const searchMatchIds = useMemo(() => {
    if (!searchActive) return null;
    const chapterNodes = questGraph.nodes.filter(
      (n: QuestNodeData) => filteredNodeIds.has(n.id) && (n.node_type === 'quest' || n.node_type === 'side_quest')
    );
    return searchQuestNodes(chapterNodes, searchQuery);
  }, [searchActive, searchQuery, questGraph.nodes, filteredNodeIds]);

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
  // Rebuild quest icons when the engine-render path toggles: baked icons hide
  // while the companion is connected (engine render is imminent) and reappear
  // as real engine icons / software fallbacks otherwise.
  const [iconRefreshTick, bumpIconRefresh] = useReducer((x: number) => x + 1, 0);
  useEffect(() => subscribeEngineConnectChange(bumpIconRefresh), []);
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
            searchStatus: searchActive ? (searchMatchIds?.has(node.id) ? 'match' : 'dim') : undefined,
            onRename: (label: string) => onUpdateNode(node.id, { label }),
            renameNonce: renameNonce?.nodeId === node.id ? renameNonce.n : 0,
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
        const anchors = pickEdgeHandles(scx, scy, tcx, tcy);
        sourceHandle = anchors.sourceHandle;
        targetHandle = anchors.targetHandle;
      }
      const isCycle = cycleEdges.has(`${edge.source}->${edge.target}`);
      return {
        id: edge.id,
        source: edge.source,
        target: edge.target,
        sourceHandle,
        targetHandle,
        // Cycle edges are always flagged red (survives the hover-dimming pass).
        style: isCycle ? { stroke: cycleColor, strokeWidth: 3.5, opacity: 1 } : undefined,
        markerEnd: isCycle
          ? { type: MarkerType.ArrowClosed, width: 24, height: 24, color: cycleColor }
          : undefined,
        data: edge.bezier ? { bezierRel: edge.bezier } : undefined,
      };
    });

    setNodes(newNodes);
    setEdges(newEdges);
  }, [questGraph.nodes, filteredEdges, filteredNodeIds, textureIndex, cycleEdges, selectedIds, simMode, simProgress, simStatusById, searchActive, searchMatchIds, cycleColor, renameNonce, onUpdateNode, iconRefreshTick, setNodes, setEdges]);

  useEffect(() => {
    if (nodes.length > 0) {
      setTimeout(() => fitView({ duration: 300, padding: 0.15 }), 100);
    }
  }, [nodes.length, fitView]);

  // Node-hover highlighting. Keeps each edge's base stroke (e.g. cycle red)
  // intact while dimming unrelated edges so the active quest's dependencies
  // pop. The dim/highlight only tweaks opacity — stroke widths stay constant so
  // hovering never makes lines visibly jump or re-rasterize inside the scaled
  // viewport (which reads as blur/pixel-shift against a static canvas).
  useEffect(() => {
    setEdges((eds) => eds.map((edge) => {
      const isCycle = isCycleEdge(edge);
      if (!hoveredNodeId) {
        return {
          ...edge,
          style: isCycle ? { stroke: cycleColor, strokeWidth: 3.5, opacity: 1 } : undefined,
        };
      }
      const isConnected = edge.source === hoveredNodeId || edge.target === hoveredNodeId;
      if (isConnected) {
        return {
          ...edge,
          style: isCycle
            ? { stroke: cycleColor, strokeWidth: 3.5, opacity: 1 }
            : { stroke: edgeColor, strokeWidth: 1.5, opacity: 1 },
        };
      }
      return { ...edge, style: { stroke: '#777', strokeWidth: 1, opacity: 0.28 } };
    }));
  }, [hoveredNodeId, isCycleEdge, edgeColor, cycleColor, setEdges]);

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
      if (editLocked) return;
      onDeleteEdge(edge.id);
      setSelectedEdgeId(null);
      setBezierEditEdgeId(null);
    },
    [onDeleteEdge, editLocked]
  );

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedEdgeId && !editLocked) {
        const el = document.activeElement as HTMLElement | null;
        if (el && ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)) return;
        e.preventDefault();
        onDeleteEdge(selectedEdgeId);
        setSelectedEdgeId(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedEdgeId, onDeleteEdge, editLocked]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const el = document.activeElement as HTMLElement | null;
      if (el && ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)) return;
      if (e.key === '?') {
        e.preventDefault();
        setShowShortcuts(v => !v);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

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
    if (editLocked) return;
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
  }, [onPasteNodes, editLocked]);

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

  // Align the selected quests' grid-center coordinates along an axis.
  const alignSelected = useCallback((mode: AlignMode) => {
    if (selectedIds.size < 2) return;
    const selected = questGraph.nodes.filter((n: QuestNodeData) => selectedIds.has(n.id));
    const positions = alignPositions(
      selected.map((n) => ({ id: n.id, position: n.position })),
      mode
    );
    onUpdateNodes(selected.map((n) => ({ nodeId: n.id, data: { position: positions[n.id] } })));
  }, [selectedIds, questGraph.nodes, onUpdateNodes]);

  // Spread the selected quests evenly along an axis between the extremes.
  const distributeSelected = useCallback((mode: DistributeMode) => {
    if (selectedIds.size < 3) return;
    const selected = questGraph.nodes.filter((n: QuestNodeData) => selectedIds.has(n.id));
    const positions = distributePositions(
      selected.map((n) => ({ id: n.id, position: n.position })),
      mode
    );
    onUpdateNodes(selected.map((n) => ({ nodeId: n.id, data: { position: positions[n.id] } })));
  }, [selectedIds, questGraph.nodes, onUpdateNodes]);

  // Search: select + fly to the first matching quest (Enter in the search bar).
  const focusFirstSearchMatch = useCallback(() => {
    if (!searchMatchIds || searchMatchIds.size === 0) return;
    const first = questGraph.nodes.find((n: QuestNodeData) => searchMatchIds.has(n.id));
    if (!first) return;
    setSelectedNodeId(first.id);
    setSelectedIds(new Set([first.id]));
    fitView({ nodes: [{ id: first.id }], duration: 400, maxZoom: 2.5, padding: 0.3 });
  }, [searchMatchIds, questGraph.nodes, setSelectedNodeId, fitView]);

  // Bezier curve editing: live preview only rewrites the local React Flow edge;
  // the graph is committed once on pointer-up so history stays clean.
  const previewEdgeBezier = useCallback((edgeId: string, bezier: EdgeBezierRel) => {
    setEdges((eds) => eds.map((e) =>
      e.id === edgeId ? { ...e, data: { ...(e.data as object | undefined), bezierRel: bezier } } : e
    ));
  }, [setEdges]);

  const commitEdgeBezier = useCallback((edgeId: string, bezier: EdgeBezierRel | null) => {
    onUpdateEdgeBezier?.(edgeId, bezier);
  }, [onUpdateEdgeBezier]);

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
      if (mod && e.key.toLowerCase() === 'x') {
        e.preventDefault();
        if (editLocked) return;
        copySelected();
        if (selectedIds.size === 0) return;
        onDeleteNodes?.(Array.from(selectedIds));
        setSelectedIds(new Set());
        return;
      }
      if (mod && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        if (editLocked) return;
        copySelected();
        pasteClipboard();
        return;
      }
      if (selectedIds.size === 0 || editLocked) return;
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
  }, [selectedIds, selectAllNodes, copySelected, pasteClipboard, nudgeSelected, onDeleteNodes, editLocked]);

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
    setBezierEditEdgeId(null);
  }, [setSelectedNodeId]);

  const handleNodeMouseLeave = useCallback(() => {
    setHoveredNodeId(null);
  }, []);

  // --- Right-click context menus (node + empty pane) ----------------------

  const handleNodeContextMenu = useCallback(
    (e: React.MouseEvent, node: Node) => {
      e.preventDefault();
      // Right-click makes the node the operand unless it's part of the current
      // multi-selection already (so bulk actions still apply to that set).
      if (!selectedIds.has(node.id)) {
        setSelectedIds(new Set([node.id]));
        setSelectedNodeId(node.id);
      }
      cursorRef.current = screenToFlowPosition({ x: e.clientX, y: e.clientY });
      setCtxMenu({ x: e.clientX, y: e.clientY, mode: 'node', nodeId: node.id });
    },
    [selectedIds, setSelectedNodeId, screenToFlowPosition]
  );

  const handlePaneContextMenu = useCallback(
    (e: React.MouseEvent | MouseEvent) => {
      e.preventDefault();
      cursorRef.current = screenToFlowPosition({ x: e.clientX, y: e.clientY });
      setCtxMenu({ x: e.clientX, y: e.clientY, mode: 'pane' });
    },
    [screenToFlowPosition]
  );

  const closeCtxMenu = useCallback(() => setCtxMenu(null), []);

  // Convert the right-click cursor (stored in flow coords) into an FTB grid
  // center position for the newly created node (nodes are center-anchored and
  // render pixelPos = node pixel size, default 36px).
  const gridPosFromCursor = useCallback(() => {
    const c = cursorRef.current;
    return {
      x: (c.x + NODE_BASE_PX / 2) / GRID_SCALE,
      y: (c.y + NODE_BASE_PX / 2) / GRID_SCALE,
    };
  }, []);

  const handleCtxEdit = useCallback(
    (nodeId: string) => {
      setSelectedNodeId(nodeId);
    },
    [setSelectedNodeId]
  );

  const handleCtxDuplicate = useCallback(() => {
    if (editLocked) return;
    copySelected();
    pasteClipboard();
  }, [copySelected, pasteClipboard, editLocked]);

  const handleCtxCopyId = useCallback(() => {
    if (selectedIds.size === 0) return;
    const target = questGraph.nodes.find((n: QuestNodeData) => selectedIds.has(n.id));
    if (!target) return;
    navigator.clipboard?.writeText(target.id).catch(() => {});
  }, [selectedIds, questGraph.nodes]);

  const handleCtxDelete = useCallback(() => {
    if (editLocked) return;
    const ids = selectedIds.size > 0 ? Array.from(selectedIds) : (ctxMenu?.nodeId ? [ctxMenu.nodeId] : []);
    if (ids.length === 0) return;
    onDeleteNodes?.(ids);
    setSelectedIds(new Set());
  }, [selectedIds, ctxMenu?.nodeId, onDeleteNodes, editLocked]);

  const startRenameFor = useCallback((nodeId: string) => {
    setRenameNonce(prev => ({ nodeId, n: (prev?.n || 0) + 1 }));
  }, []);

  const applySimToSelection = useCallback(
    (status: 'started' | 'complete' | null) => {
      const ids = selectedIds.size > 0 ? Array.from(selectedIds) : (ctxMenu?.nodeId ? [ctxMenu.nodeId] : []);
      for (const id of ids) onSetQuestProgress?.(id, status);
    },
    [selectedIds, ctxMenu?.nodeId, onSetQuestProgress]
  );

  const handleCtxAddQuest = useCallback(() => {
    if (!activeChapter || editLocked) return;
    onAddNode(activeChapter, gridPosFromCursor());
  }, [activeChapter, onAddNode, gridPosFromCursor, editLocked]);

  const handleCtxAddLink = useCallback(() => {
    if (!activeChapter || editLocked) return;
    onAddLink?.(activeChapter, gridPosFromCursor());
  }, [activeChapter, onAddLink, gridPosFromCursor, editLocked]);

  const handleCtxAddQuestWithTask = useCallback(
    (objectiveType: string) => {
      if (!activeChapter || editLocked) return;
      onAddQuestWithTask?.(activeChapter, objectiveType, gridPosFromCursor());
    },
    [activeChapter, onAddQuestWithTask, gridPosFromCursor, editLocked]
  );

  // Clamp the menu so it never opens off the right/bottom viewport edge.
  const viewportMenuPos = useMemo(() => {
    if (!ctxMenu) return null;
    const mw = 200;
    const mh = Math.min(window.innerHeight - 16, 70 * window.innerHeight / 100);
    const x = Math.min(ctxMenu.x, window.innerWidth - mw - 6);
    const y = Math.max(4, Math.min(ctxMenu.y, window.innerHeight - mh - 6));
    return { ...ctxMenu, x, y };
  }, [ctxMenu]);

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
      // Mirror in-game quest grid snapping: grid snap grain is
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

      // Snap the group's min corner (in grid units), preserving offsets — the
      // same anchoring the in-game editor uses when placing a dragged group:
      // snapped anchor + (obj.pos − minCorner).
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

  const bezierEditEdge = bezierEditEdgeId
    ? filteredEdges.find((e: QuestEdgeData) => e.id === bezierEditEdgeId) || null
    : null;
  const bezierSourceNode = bezierEditEdge
    ? questGraph.nodes.find((n: QuestNodeData) => n.id === bezierEditEdge.source)
    : undefined;
  const bezierTargetNode = bezierEditEdge
    ? questGraph.nodes.find((n: QuestNodeData) => n.id === bezierEditEdge.target)
    : undefined;

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
            Fit
          </button>
          <button className="toolbar-btn" onClick={onUndo} disabled={!canUndo} title="Undo (Ctrl+Z)">
            Undo
          </button>
          <button className="toolbar-btn" onClick={onRedo} disabled={!canRedo} title="Redo (Ctrl+Y)">
            Redo
          </button>
          <button
            className={`toolbar-btn${connectMode ? ' toolbar-btn-active' : ''}`}
            onClick={() => {
              setConnectMode((m) => !m);
              setSelectedEdgeId(null);
              setBezierEditEdgeId(null);
            }}
            disabled={editLocked}
            title="Toggle dependency editing: drag between quest connection ports"
          >
            Connect
          </button>
          <EditLockButton locked={editLocked} onToggle={() => setEditLocked((v) => !v)} />
          <button className="toolbar-btn" onClick={() => setShowShortcuts(true)} title="Shortcuts & gestures (?)">
            ?
          </button>
        </div>
        <div className="toolbar-group">
          <QuestSearchBar
            query={searchQuery}
            matchCount={searchMatchIds ? searchMatchIds.size : 0}
            onQueryChange={setSearchQuery}
            onFocusFirst={focusFirstSearchMatch}
          />
          <ThemePresetPicker value={questGraph.active_theme} onApply={(id) => onApplyThemePreset?.(id)} />
        </div>
        <div className="toolbar-group">
          <AlignDistributeControls
            selectedCount={selectedIds.size}
            onAlign={alignSelected}
            onDistribute={distributeSelected}
          />
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
                setBezierEditEdgeId(null);
              }}
              title="Edit quest log decoration images for this chapter"
            >
              Decorations
            </button>
          )}
        </div>
        <div className="toolbar-group">
          <button
            className={`toolbar-btn${simMode ? ' toolbar-btn-active' : ''}`}
            onClick={() => setSimMode?.(!simMode)}
            title="Toggle progress simulation: preview hidden/locked quests, complete or reset instantly"
          >
            Simulate
          </button>
          {simMode && (
            <>
              <button className="toolbar-btn" onClick={onCompleteAll} title="Complete every quest in this chapter instantly">
                Complete All
              </button>
              <button className="toolbar-btn" onClick={onResetAll} title="Reset every quest in this chapter">
                Reset All
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
              <WarnIcon size={12} /> {cycleEdges.size} circular connection{cycleEdges.size > 1 ? 's' : ''}
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
            <button className="connect-mode-close" onClick={() => setConnectMode(false)} title="Exit connect mode" aria-label="Exit connect mode">
              <XIcon size={12} />
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
        <ViewportPortal>
          {bezierEditEdge && bezierSourceNode && bezierTargetNode && !decorEditMode && (
            <EdgeBezierEditor
              edge={bezierEditEdge}
              sourceNode={bezierSourceNode}
              targetNode={bezierTargetNode}
              gridScale={GRID_SCALE}
              bodyScale={NODE_BASE_PX}
              zoom={zoom}
              onPreview={previewEdgeBezier}
              onCommit={commitEdgeBezier}
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
          onNodeContextMenu={handleNodeContextMenu}
          onEdgeClick={handleEdgeClick}
          onEdgeDoubleClick={handleEdgeDoubleClick}
          onPaneClick={handlePaneClick}
          onPaneContextMenu={handlePaneContextMenu}
          onNodeDragStop={handleNodeDragStop}
          defaultEdgeOptions={{ type: 'dependency', animated: false, style: { stroke: edgeColor, strokeWidth: 1.5, opacity: 0.5 }, markerEnd: { type: MarkerType.ArrowClosed, width: 24, height: 24, color: edgeColor } }}
          connectionMode={ConnectionMode.Loose}
          connectionLineType={ConnectionLineType.Straight}
          connectionLineStyle={{ stroke: edgeColor, strokeWidth: 2, strokeDasharray: '6 4' }}
          edgesReconnectable={!editLocked}
          reconnectRadius={28}
          fitView={false}
          panOnDrag
          zoomOnScroll
          zoomOnPinch
          minZoom={0.1}
          maxZoom={64}
          defaultViewport={{ x: 0, y: 0, zoom: 1 }}
          nodesDraggable={!connectMode && !editLocked}
          nodesConnectable={connectMode && !editLocked}
        >
          {showBackground && <Background variant={BackgroundVariant.Dots} gap={GRID_SCALE} size={1} color="#3a3a3a" />}
          {showMiniMap && <MiniMap nodeColor={(node: any) => (node.data?.color as string) || '#89b4fa'} />}
          <Controls />
        </ReactFlow>

        {showShortcuts && (
          <KeyboardShortcutsOverlay onClose={() => setShowShortcuts(false)} />
        )}

        {viewportMenuPos && (
          <QuestContextMenu
            menu={viewportMenuPos}
            simMode={simMode}
            selectedCount={selectedIds.size}
            hasClipboard={!!clipboardRef.current}
            onClose={closeCtxMenu}
            onEdit={handleCtxEdit}
            onRename={startRenameFor}
            onDuplicate={handleCtxDuplicate}
            onCopyId={handleCtxCopyId}
            onDelete={handleCtxDelete}
            onComplete={() => applySimToSelection('complete')}
            onReset={() => applySimToSelection(null)}
            onAddQuest={handleCtxAddQuest}
            onAddLink={handleCtxAddLink}
            onPaste={pasteClipboard}
            onAddQuestWithTask={handleCtxAddQuestWithTask}
            objectiveTypes={OBJECTIVE_TYPES}
          />
        )}

        {activeChapter && !decorEditMode && !connectMode && !editLocked && (
          <div className="canvas-overlay">
            <div className="chapter-add-button" onClick={() => handleAddNode(activeChapter)}>
              + Add Quest
            </div>
            <div className="chapter-add-button chapter-add-link-button" onClick={() => onAddLink?.(activeChapter)} title="Add a quest link that references another quest (cross-chapter)">
              Add Link
            </div>
          </div>
        )}

        {selectedEdge && (
          <div className="edge-action-chip">
            <span className="edge-action-label">
              {nodeLabelById(selectedEdge.source)} → {nodeLabelById(selectedEdge.target)}
            </span>
            {!editLocked && (
              <>
                <button
                  className={`edge-action-ghost${bezierEditEdgeId === selectedEdge.id ? ' edge-action-active' : ''}`}
                  onClick={() => {
                    setBezierEditEdgeId((cur) => (cur === selectedEdge.id ? null : selectedEdge.id));
                  }}
                  title={bezierEditEdgeId === selectedEdge.id ? 'Hide curve control points' : 'Edit bezier control points of this arrow'}
                >
                  {bezierEditEdgeId === selectedEdge.id ? 'Done' : 'Curve'}
                </button>
                {bezierEditEdgeId === selectedEdge.id && selectedEdge.bezier && (
                  <button
                    className="edge-action-ghost"
                    onClick={() => {
                      onUpdateEdgeBezier?.(selectedEdge.id, null);
                    }}
                    title="Reset this arrow to the default curve"
                  >
                    Reset
                  </button>
                )}
                <button
                  className="edge-action-delete"
                  onClick={() => {
                    onDeleteEdge(selectedEdge.id);
                    setSelectedEdgeId(null);
                    setBezierEditEdgeId(null);
                  }}
                  title="Remove this dependency arrow (Del)"
                >
                  Remove
                </button>
              </>
            )}
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
