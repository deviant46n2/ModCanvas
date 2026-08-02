import React from 'react';
import { ReactFlow, Controls, Background, MiniMap } from '@xyflow/react';
import type { Node, Edge, Connection } from '@xyflow/react';
import type { QuestGraphData } from '../../services/api';
import { resolveIconKey } from './nodes';
import { stripMcFormatting } from '../../core/theme/font-formatter';
import { textureDisplayUrl, isTexturePending } from '../../services/texture-loader';
import { QuestIcon } from './QuestIcon';

interface CanvasSectionProps {
  filteredNodes: Node[];
  filteredEdges: Edge[];
  onNodesChange: any;
  onEdgesChange: any;
  onConnect: (connection: Connection) => void;
  onNodeClick: (event: React.MouseEvent, node: Node) => void;
  onPaneClick: () => void;
  onNodeContextMenu: (event: React.MouseEvent, node: Node) => void;
  onPaneContextMenu: (event: MouseEvent | React.MouseEvent) => void;
  nodeTypes: Record<string, any>;
  setViewportPos: (pos: { x: number; y: number; zoom: number }) => void;
  graph: QuestGraphData | null;
  activeChapter: string | null;
  setActiveChapter: (id: string | null) => void;
  chapterQuestCounts: Record<string, number>;
  collapsedGroups: Record<string, boolean>;
  setCollapsedGroups: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  addChapter: () => void;
  textureIndex: Record<string, string>;
  contextMenu: { x: number; y: number; nodeId?: string } | null;
  closeContextMenu: () => void;
  selectNode: (node: Node) => void;
  clipboard: Node | null;
  setClipboard: React.Dispatch<React.SetStateAction<Node | null>>;
  pasteNode: () => void;
  deleteNodeById: (id: string) => void;
  createQuestAtCursor: (type?: string) => void;
  nodes: Node[];
  onEdgeDoubleClick: (event: React.MouseEvent, edge: Edge) => void;
  viewportPos: { x: number; y: number; zoom: number };
  selectedNodeId: string | null;
  selectedLabel: string;
}

export function CanvasSection({
  filteredNodes, filteredEdges, onNodesChange, onEdgesChange, onConnect,
  onNodeClick, onPaneClick, onNodeContextMenu, onPaneContextMenu,
  nodeTypes, setViewportPos, graph, activeChapter, setActiveChapter,
  chapterQuestCounts, collapsedGroups, setCollapsedGroups, addChapter,
  textureIndex, contextMenu, closeContextMenu, selectNode, clipboard,
  setClipboard, pasteNode, deleteNodeById, createQuestAtCursor, nodes,
  onEdgeDoubleClick, viewportPos, selectedNodeId, selectedLabel,
}: CanvasSectionProps) {
  return (
    <>
      <div className="ftb-chapter-sidebar">
        <div className="ftb-chapters-header">
          Chapters
          <span className="chapter-count">{graph?.chapters.length || 0}</span>
        </div>
        <div className="ftb-chapter-list">
          {(() => {
            if (!graph || graph.chapters.length === 0) {
              return (
                <div style={{ padding: '16px 12px', fontSize: 12, color: '#6c7086', textAlign: 'center' }}>
                  No chapters yet
                </div>
              );
            }
            const groups = graph.chapter_groups || [];
            const chaptersByGroup: Record<string, typeof graph.chapters> = {};
            const ungrouped: typeof graph.chapters = [];
            for (const ch of graph.chapters) {
              if (ch.group_id) {
                if (!chaptersByGroup[ch.group_id]) chaptersByGroup[ch.group_id] = [];
                chaptersByGroup[ch.group_id].push(ch);
              } else {
                ungrouped.push(ch);
              }
            }
            const items: React.ReactNode[] = [];
            if (graph && graph.chapters.length > 0) {
              console.log('[QuestGraph] Chapter icons:', graph.chapters.map(ch => ({ title: ch.title, icon: ch.icon, resolved: resolveIconKey(ch.icon), hasTexture: !!textureIndex[resolveIconKey(ch.icon)] })));
            }
            const renderChapter = (ch: typeof graph.chapters[0]) => {
              const resolvedIcon = resolveIconKey(ch.icon);
              const iconUrl = ch.icon ? textureDisplayUrl(textureIndex, resolvedIcon) : '';
              const iconPending = ch.icon ? isTexturePending(textureIndex, resolvedIcon) : false;
              console.log(`[QuestGraph] Chapter "${ch.title}": icon="${ch.icon}" resolved="${resolvedIcon}" url="${iconUrl ? 'FOUND' : 'MISSING'}"`);
              return (
                <button
                  key={ch.id}
                  className={`ftb-chapter-tab ${activeChapter === ch.id ? 'active' : ''}`}
                  onClick={() => setActiveChapter(ch.id)}
                >
                  <span className="ch-icon">
                    <QuestIcon url={iconUrl || null} pending={iconPending} fallback={ch.icon || '\u{1F4D6}'} size={18} imgSize={18} fallbackFontSize={12} textureKey={resolvedIcon} />
                  </span>
                  <span className="ch-title">{stripMcFormatting(ch.title)}</span>
                  <span className="ch-count">{chapterQuestCounts[ch.id] || 0}</span>
                </button>
              );
            };
            const byOrder = (a: typeof graph.chapters[0], b: typeof graph.chapters[0]) => (a.order_index || 0) - (b.order_index || 0);
            for (const ch of [...ungrouped].sort(byOrder)) {
              items.push(renderChapter(ch));
            }
            for (const group of groups.sort((a, b) => (a.order_index || 0) - (b.order_index || 0))) {
              const groupChapters = [...(chaptersByGroup[group.id] || [])].sort(byOrder);
              if (groupChapters.length === 0) continue;
              const isCollapsed = !!collapsedGroups[group.id];
              const groupTitle = stripMcFormatting(group.title) || `Group ${groups.indexOf(group) + 1}`;
              items.push(
                <div key={`group-${group.id}`} className="ftb-chapter-group">
                  <button
                    className="ftb-chapter-group-header"
                    onClick={() => setCollapsedGroups(prev => ({ ...prev, [group.id]: !prev[group.id] }))}
                  >
                    <span className="group-chevron">{isCollapsed ? '\u25B8' : '\u25BE'}</span>
                    <span className="group-title">{groupTitle}</span>
                    <span className="group-count">{groupChapters.length}</span>
                  </button>
                  {!isCollapsed && groupChapters.map(renderChapter)}
                </div>
              );
            }
            return items;
          })()}
        </div>
        <button className="ftb-add-chapter" onClick={addChapter}>+ Add Chapter</button>
      </div>

      <div className="quest-editor-canvas">
        <ReactFlow
          nodes={filteredNodes}
          edges={filteredEdges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={onNodeClick}
          onPaneClick={onPaneClick}
          onNodeContextMenu={onNodeContextMenu}
          onPaneContextMenu={onPaneContextMenu}
          nodeTypes={nodeTypes}
          fitView
          snapToGrid
          snapGrid={[1, 1]}
          zoomOnScroll
          panOnScroll={false}
          minZoom={0.1}
          maxZoom={64}
          onMove={(_, vp) => setViewportPos(vp)}
          onEdgeDoubleClick={onEdgeDoubleClick}
        >
          <Controls />
          <MiniMap
            nodeColor={(node) => {
              const type = (node.data?.nodeType as string) || 'quest';
              const colors: Record<string, string> = {
                chapter: '#10b981', quest: '#3b82f6', reward: '#f59e0b',
                gate: '#ef4444', side_quest: '#8b5cf6',
              };
              return colors[type] || '#6b7280';
            }}
            maskColor="rgba(0,0,0,0.7)"
          />
          <Background color="#1e2533" gap={24} size={1} />
        </ReactFlow>
      </div>

      <div className="quest-editor-statusbar">
        <div className="quest-editor-statusbar-left">
          <span className="quest-editor-statusbar-item">
            {graph?.chapters.length || 0} chapters
          </span>
          <span className="quest-editor-statusbar-separator" />
          <span className="quest-editor-statusbar-item">
            {filteredNodes.length} quests
          </span>
          {activeChapter && graph && (
            <>
              <span className="quest-editor-statusbar-separator" />
              <span className="quest-editor-statusbar-item">
                {stripMcFormatting(graph.chapters.find(c => c.id === activeChapter)?.title || 'Untitled')} — {chapterQuestCounts[activeChapter] || 0} quests
              </span>
            </>
          )}
        </div>
        <div className="quest-editor-statusbar-right">
          <span className="quest-editor-statusbar-item">
            Zoom: {Math.round(viewportPos.zoom * 100)}%
          </span>
          <span className="quest-editor-statusbar-separator" />
          <span className="quest-editor-statusbar-item">
            {Object.keys(textureIndex).length} textures
          </span>
          {selectedNodeId && (
            <>
              <span className="quest-editor-statusbar-separator" />
              <span className="quest-editor-statusbar-item">
                Selected: {selectedLabel}
              </span>
            </>
          )}
        </div>
      </div>

      {contextMenu && (
        <div className="context-menu-overlay" onClick={closeContextMenu}>
          <div
            className="context-menu"
            style={{ left: contextMenu.x, top: contextMenu.y }}
            onClick={(e) => e.stopPropagation()}
          >
            {contextMenu.nodeId ? (
              <>
                <button className="context-menu-item" onClick={() => {
                  const node = nodes.find(n => n.id === contextMenu.nodeId);
                  if (node) selectNode(node);
                  closeContextMenu();
                }}>Edit</button>
                <button className="context-menu-item" onClick={() => {
                  const node = nodes.find(n => n.id === contextMenu.nodeId);
                  if (node) { setClipboard(node); }
                  closeContextMenu();
                }}>Copy</button>
                <div className="context-menu-separator" />
                <button className="context-menu-item danger" onClick={() => { if (contextMenu.nodeId) deleteNodeById(contextMenu.nodeId); }}>Delete</button>
              </>
            ) : (
              <>
                <button className="context-menu-item" onClick={() => createQuestAtCursor('quest')}>Add Quest</button>
                <button className="context-menu-item" onClick={() => createQuestAtCursor('side_quest')}>Add Side Quest</button>
                <button className="context-menu-item" onClick={() => createQuestAtCursor('reward')}>Add Reward</button>
                <button className="context-menu-item" onClick={() => createQuestAtCursor('gate')}>Add Gate</button>
                {clipboard && (
                  <>
                    <div className="context-menu-separator" />
                    <button className="context-menu-item" onClick={pasteNode}>Paste</button>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
