import { useCallback, useState, useMemo } from 'react';
import {
  ReactFlowProvider,
  useReactFlow,
  useViewport,
} from '@xyflow/react';
import type {
  QuestGraphData, QuestChapter, QuestNodeData, QuestEdgeData, ChapterImage, EdgeBezierRel,
} from '../../services/quest-types';
import type { ProgressState } from '../../core/quest/progress';
import { isMilestoneShape } from '../../core/quest/quest-shapes';
import { useQuestCanvasModel } from './useQuestCanvasModel';
import { useChapterDisplayState } from './useChapterDisplayState';
import { useQuestCanvasKeyboard } from './useQuestCanvasKeyboard';
import { useQuestCanvasInteractions } from './useQuestCanvasInteractions';
import { useQuestCanvasContextMenu } from './useQuestCanvasContextMenu';
import { CanvasToolbar } from './CanvasToolbar';
import { CanvasArea } from './CanvasArea';
import '@xyflow/react/dist/style.css';
import './quest-canvas-styles';

export { GRID_SCALE, NODE_BASE_PX } from './quest-canvas-model';

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
  onMoveNodesToChapter?: (nodeIds: string[], chapterId: string) => void;
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
  onMoveNodesToChapter,
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
  const [showMiniMap, setShowMiniMap] = useState(true);
  const [showBackground, setShowBackground] = useState(true);
  const [renameNonce, setRenameNonce] = useState<{ nodeId: string; n: number } | null>(null);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [connectMode, setConnectMode] = useState(false);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [decorEditMode, setDecorEditMode] = useState(false);
  const [selectedDecoIndex, setSelectedDecoIndex] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [milestoneOnly, setMilestoneOnly] = useState(false);
  const [editLocked, setEditLocked] = useState(false);
  const [bezierEditEdgeId, setBezierEditEdgeId] = useState<string | null>(null);
  const { fitView, screenToFlowPosition } = useReactFlow();
  const { zoom } = useViewport();

  const {
    nodes, edges, onNodesChange, onEdgesChange, setEdges,
    filteredNodeIds, filteredEdges, cycleEdges, searchMatchIds, edgeColor,
    setHoveredNodeId,
  } = useQuestCanvasModel({
    questGraph, chapters, activeChapter, textureIndex, selectedIds, simMode,
    simProgress, searchQuery, milestoneOnly, renameNonce, onUpdateNode, fitView,
  });

  const { clipboardRef, copySelected, pasteClipboard, alignSelected, distributeSelected } =
    useQuestCanvasKeyboard({
      questNodes: questGraph.nodes,
      questEdges: questGraph.edges,
      filteredNodeIds,
      selectedIds,
      setSelectedIds,
      setSelectedEdgeId,
      onUpdateNodes,
      onDeleteNodes,
      onPasteNodes,
      editLocked,
      selectedEdgeId,
      onDeleteEdge,
      setShowShortcuts,
    });

  const {
    handleConnect, handleNodesChange, handleEdgesChange, handleReconnect,
    handleEdgeClick, handleEdgeDoubleClick, handleNodeClick,
    handleNodeMouseEnter, handleNodeMouseLeave, handlePaneClick,
    handleNodeDoubleClick, handleNodeDragStop, handleAddNode, handleFitView,
    previewEdgeBezier, commitEdgeBezier,
  } = useQuestCanvasInteractions({
    setSelectedIds, setSelectedEdgeId, setSelectedNodeId, setHoveredNodeId,
    setSelectedDecoIndex, setBezierEditEdgeId,
    onNodesChange, onEdgesChange, setEdges,
    onAddEdge, onUpdateEdge, onDeleteEdge, onUpdateNodes, onAddNode,
    onUpdateEdgeBezier,
    editLocked, simMode, onSetQuestProgress, simProgress,
    questGridScale: questGraph.grid_scale,
    fitView,
  });

  const {
    handleNodeContextMenu, handlePaneContextMenu, closeCtxMenu,
    handleCtxEdit, handleCtxDuplicate, handleCtxCopyId, handleCtxDelete,
    applySimToSelection, handleCtxAddQuest, handleCtxAddLink,
    handleCtxAddQuestWithTask, handleCtxMoveToChapter, viewportMenuPos,
  } = useQuestCanvasContextMenu({
    selectedIds, setSelectedIds, setSelectedNodeId, screenToFlowPosition,
    editLocked, questNodes: questGraph.nodes, onDeleteNodes,
    onSetQuestProgress, activeChapter, onAddNode, onAddLink, onAddQuestWithTask,
    copySelected, pasteClipboard, onMoveToChapter: onMoveNodesToChapter,
  });

  // Search: select + fly to the first matching quest (Enter in the search bar).
  const focusFirstSearchMatch = useCallback(() => {
    if (!searchMatchIds || searchMatchIds.size === 0) return;
    const first = questGraph.nodes.find((n: QuestNodeData) => searchMatchIds.has(n.id));
    if (!first) return;
    setSelectedNodeId(first.id);
    setSelectedIds(new Set([first.id]));
    fitView({ nodes: [{ id: first.id }], duration: 400, maxZoom: 2.5, padding: 0.3 });
  }, [searchMatchIds, questGraph.nodes, setSelectedNodeId, fitView]);

  const startRenameFor = useCallback((nodeId: string) => {
    setRenameNonce(prev => ({ nodeId, n: (prev?.n || 0) + 1 }));
  }, []);

  const handleToggleConnect = useCallback(() => {
    setConnectMode((m) => !m);
    setSelectedEdgeId(null);
    setBezierEditEdgeId(null);
  }, []);

  const handleToggleDecorEdit = useCallback(() => {
    setDecorEditMode((m) => !m);
    setSelectedDecoIndex(null);
    setBezierEditEdgeId(null);
  }, []);

  const { activeChapterName, moveToChapters, activeChapterNodes, activeChapterImages } =
    useChapterDisplayState(chapters, activeChapter, questGraph.nodes);

  const milestoneCount = useMemo(
    () => questGraph.nodes.filter((n: QuestNodeData) => n.chapter_id === activeChapter && isMilestoneShape(n.shape)).length,
    [questGraph.nodes, activeChapter],
  );

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
      <CanvasToolbar
        activeChapterName={activeChapterName}
        activeChapter={activeChapter}
        questCount={activeChapterNodes.length}
        edgeCount={filteredEdges.length}
        cycleCount={cycleEdges.size}
        showMiniMap={showMiniMap} setShowMiniMap={setShowMiniMap}
        showBackground={showBackground} setShowBackground={setShowBackground}
        connectMode={connectMode} onToggleConnect={handleToggleConnect}
        onFitView={handleFitView}
        editLocked={editLocked} onToggleEditLocked={() => setEditLocked((v) => !v)}
        onShowShortcuts={() => setShowShortcuts(true)}
        searchQuery={searchQuery} searchMatchCount={searchMatchIds ? searchMatchIds.size : 0}
        onQueryChange={setSearchQuery} onFocusFirst={focusFirstSearchMatch}
        milestoneOnly={milestoneOnly} milestoneCount={milestoneCount}
        onToggleMilestones={() => setMilestoneOnly(v => !v)}
        themePreset={questGraph.active_theme} onApplyThemePreset={onApplyThemePreset}
        selectedCount={selectedIds.size} onAlign={alignSelected} onDistribute={distributeSelected}
        decorEditMode={decorEditMode} onToggleDecorEdit={handleToggleDecorEdit}
        simMode={simMode} onToggleSim={() => setSimMode?.(!simMode)}
        onCompleteAll={onCompleteAll} onResetAll={onResetAll}
        onUndo={onUndo} canUndo={canUndo} onRedo={onRedo} canRedo={canRedo}
      />
      <CanvasArea
        questBackgroundUrl={questBackgroundUrl}
        connectMode={connectMode} onExitConnect={() => setConnectMode(false)}
        decorEditMode={decorEditMode}
        textureIndex={textureIndex} activeChapterImages={activeChapterImages}
        bezierEditEdge={bezierEditEdge}
        bezierSourceNode={bezierSourceNode} bezierTargetNode={bezierTargetNode}
        zoom={zoom}
        onPreviewBezier={previewEdgeBezier} onCommitBezier={commitEdgeBezier}
        nodes={nodes} edges={edges}
        onNodesChange={handleNodesChange} onEdgesChange={handleEdgesChange}
        onConnect={handleConnect} onReconnect={handleReconnect}
        onNodeClick={handleNodeClick} onNodeDoubleClick={handleNodeDoubleClick}
        onNodeMouseEnter={handleNodeMouseEnter} onNodeMouseLeave={handleNodeMouseLeave}
        onNodeContextMenu={handleNodeContextMenu}
        onEdgeClick={handleEdgeClick} onEdgeDoubleClick={handleEdgeDoubleClick}
        onPaneClick={handlePaneClick} onPaneContextMenu={handlePaneContextMenu}
        onNodeDragStop={handleNodeDragStop}
        edgeColor={edgeColor} editLocked={editLocked}
        showMiniMap={showMiniMap} showBackground={showBackground}
        simMode={simMode}
        viewportMenuPos={viewportMenuPos} onCloseCtxMenu={closeCtxMenu}
        onCtxEdit={handleCtxEdit} onCtxRename={startRenameFor}
        onCtxDuplicate={handleCtxDuplicate} onCtxCopyId={handleCtxCopyId}
        onCtxDelete={handleCtxDelete}
        onCtxComplete={() => applySimToSelection('complete')}
        onCtxReset={() => applySimToSelection(null)}
        onCtxAddQuest={handleCtxAddQuest} onCtxAddLink={handleCtxAddLink}
        onCtxPaste={pasteClipboard} onCtxAddQuestWithTask={handleCtxAddQuestWithTask}
        onCtxMoveToChapter={handleCtxMoveToChapter} moveToChapters={moveToChapters}
        selectedCount={selectedIds.size} hasClipboard={!!clipboardRef.current}
        showShortcuts={showShortcuts} onCloseShortcuts={() => setShowShortcuts(false)}
        activeChapter={activeChapter} onAddNode={handleAddNode} onAddLink={onAddLink}
        selectedEdge={selectedEdge} bezierEditEdgeId={bezierEditEdgeId}
        setBezierEditEdgeId={setBezierEditEdgeId} onUpdateEdgeBezier={onUpdateEdgeBezier}
        onDeleteEdge={onDeleteEdge} setSelectedEdgeId={setSelectedEdgeId}
        nodeLabelById={nodeLabelById}
        selectedDecoIndex={selectedDecoIndex} onSelectDeco={setSelectedDecoIndex}
        onChangeDecorations={activeChapter ? (imgs) => onUpdateChapterImages(activeChapter, imgs) : () => {}}
      />
    </div>
  );
}

export default QuestCanvas;
