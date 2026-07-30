import React, { useCallback, useState, useEffect, useMemo, useRef } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  addEdge, MarkerType,
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  useReactFlow,
} from '@xyflow/react';
import type { Node, Edge, Connection, NodeChange, EdgeChange } from '@xyflow/react';
import type { QuestGraphData, QuestNodeData, QuestChapter } from '../../services/api';
import { questIconUrl } from './questIcons';
import { edgeTypes, detectCycles, CYCLE_COLOR, NORMAL_COLOR } from './quest-edges';
import { nodeTypes } from './quest-nodes';
import './QuestCanvas.css';

const GRID_SCALE = 38;

interface QuestCanvasProps {
  questGraph: QuestGraphData;
  chapters: QuestChapter[];
  activeChapter: string | null;
  onUpdateNode: (nodeId: string, data: Partial<QuestNodeData>) => void;
  onUpdateEdge: (edgeId: string, data: { source?: string; target?: string }) => void;
  onDeleteNode: (nodeId: string) => void;
  onDeleteEdge: (edgeId: string) => void;
  onAddNode: (chapterId: string) => void;
  selectedNodeId: string | null;
  setSelectedNodeId: (id: string | null) => void;
  textureIndex?: Record<string, string>;
}

const NODE_WIDTH = 180;
const NODE_HEIGHT = 100;

function computePixelSize(_node: QuestNodeData) {
  return { width: NODE_WIDTH, height: NODE_HEIGHT };
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
  chapters: _chapters,
  activeChapter,
  onUpdateNode,
  onUpdateEdge: _onUpdateEdge,
  onDeleteNode: _onDeleteNode,
  onDeleteEdge: _onDeleteEdge,
  onAddNode,
  selectedNodeId: _selectedNodeId,
  setSelectedNodeId,
  textureIndex,
}: QuestCanvasProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [showMiniMap, setShowMiniMap] = useState(true);
  const [showBackground, setShowBackground] = useState(true);
  const { fitView } = useReactFlow();

  const filteredNodeIds = useMemo(() => {
    if (!activeChapter) return new Set(questGraph.nodes.map(n => n.id));
    return new Set(
      questGraph.nodes.filter(n => n.chapter_id === activeChapter).map(n => n.id)
    );
  }, [questGraph.nodes, activeChapter]);

  const filteredEdges = useMemo(() => {
    return questGraph.edges.filter(
      e => filteredNodeIds.has(e.source) && filteredNodeIds.has(e.target)
    );
  }, [questGraph.edges, filteredNodeIds]);

  const cycleEdges = useMemo(() => detectCycles(filteredEdges), [filteredEdges]);

  const textureVersionRef = useRef(0);
  const prevTextureIndexRef = useRef<Record<string, string> | undefined>(undefined);
  useEffect(() => {
    if (textureIndex && textureIndex !== prevTextureIndexRef.current) {
      prevTextureIndexRef.current = textureIndex;
      textureVersionRef.current += 1;
    }
    const newNodes: Node[] = questGraph.nodes
      .filter(n => filteredNodeIds.has(n.id))
      .map((node) => {
        const pixelSize = computePixelSize(node);
        const iconKey = node.icon;
        const iconUrl = iconKey ? questIconUrl(iconKey, textureIndex || {}) : undefined;
        return {
          id: node.id,
          type: 'quest',
          position: {
            x: node.position.x * GRID_SCALE,
            y: node.position.y * GRID_SCALE,
          },
          data: {
            ...node,
            iconUrl,
          },
          style: {
            width: pixelSize.width,
            height: pixelSize.height,
          },
        };
      });

    const newEdges: Edge[] = filteredEdges.map((edge) => {
      const key = `${edge.source}->${edge.target}`;
      const inCycle = cycleEdges.has(key);
      return {
        id: edge.id,
        source: edge.source,
        target: edge.target,
        type: 'tooltip',
        animated: !inCycle,
        markerEnd: { type: MarkerType.ArrowClosed, color: inCycle ? CYCLE_COLOR : NORMAL_COLOR } as any,
        style: {
          strokeWidth: inCycle ? 3 : 2,
          stroke: inCycle ? CYCLE_COLOR : NORMAL_COLOR,
        },
      };
    });

    setNodes(newNodes);
    setEdges(newEdges);
  }, [questGraph.nodes, filteredEdges, cycleEdges, filteredNodeIds, textureIndex, setNodes, setEdges]);

  useEffect(() => {
    if (nodes.length > 0) {
      setTimeout(() => fitView({ duration: 300, padding: 0.15 }), 100);
    }
  }, [nodes.length, fitView]);

  const handleConnect = useCallback(
    (connection: Connection) => {
      setEdges((eds) => addEdge(connection, eds));
    },
    [setEdges]
  );

  const handleNodesChange = useCallback((changes: NodeChange[]) => {
    onNodesChange(changes);
  }, [onNodesChange]);

  const handleEdgesChange = useCallback((changes: EdgeChange[]) => {
    onEdgesChange(changes);
  }, [onEdgesChange]);

  const handleNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      setSelectedNodeId(node.id);
    },
    [setSelectedNodeId]
  );

  const handleNodeDragStop = useCallback(
    (_: any, node: Node) => {
      const gridX = node.position.x / GRID_SCALE;
      const gridY = node.position.y / GRID_SCALE;
      onUpdateNode(node.id, {
        position: {
          x: Math.round(gridX * 2) / 2,
          y: Math.round(gridY * 2) / 2,
        },
      });
    },
    [onUpdateNode]
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

  const activeChapterNodes = questGraph.nodes.filter(n => n.chapter_id === activeChapter);

  return (
    <div className="quest-canvas-container">
      <div className="canvas-toolbar">
        <div className="toolbar-group">
          <button className="toolbar-btn" onClick={handleFitView} title="Fit View">
            🎯 Fit
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
        </div>
        <div className="toolbar-group">
          <span className="canvas-stats">
            {activeChapterNodes.length} quests, {filteredEdges.length} connections
            {cycleEdges.size > 0 && (
              <span className="cycle-warning" title="Circular dependencies detected">
                ⚠ {cycleEdges.size} cycle{cycleEdges.size > 1 ? 's' : ''}
              </span>
            )}
          </span>
        </div>
      </div>

      <div className="quest-canvas-wrapper">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={handleNodesChange}
          onEdgesChange={handleEdgesChange}
          onConnect={handleConnect}
          onNodeClick={handleNodeClick}
          onNodeDragStop={handleNodeDragStop}
          edgeTypes={edgeTypes}
          fitView={false}
          panOnDrag
          panOnScroll
          zoomOnScroll
          zoomOnPinch
          minZoom={0.1}
          maxZoom={2}
          defaultViewport={{ x: 0, y: 0, zoom: 1 }}
          nodesDraggable={true}
          snapToGrid
          snapGrid={[GRID_SCALE * 0.5, GRID_SCALE * 0.5]}
        >
          {showBackground && <Background />}
          {showMiniMap && <MiniMap nodeColor={(node: any) => (node.data?.color as string) || '#89b4fa'} />}
          <Controls />
        </ReactFlow>

        {activeChapter && (
          <div className="canvas-overlay">
            <div className="chapter-add-button" onClick={() => handleAddNode(activeChapter)}>
              + Add Quest
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default QuestCanvas;
