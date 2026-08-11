import type { Dispatch, SetStateAction, MouseEvent as ReactMouseEvent } from 'react'
import {
  ReactFlow,
  ConnectionMode,
  ConnectionLineType,
  MiniMap,
  Controls,
  Background,
  BackgroundVariant,
  ViewportPortal,
} from '@xyflow/react'
import type { Node, Edge, Connection, NodeChange, EdgeChange } from '@xyflow/react'
import type { QuestEdgeData, ChapterImage } from '../../services/quest-types'
import { nodeTypes } from './quest-nodes'
import { edgeTypes } from './quest-edges'
import { OBJECTIVE_TYPES } from './quest-form-constants'
import type { QuestCtxMenuState, MoveChapterOption } from './QuestContextMenu'
import { QuestContextMenu } from './QuestContextMenu'
import { KeyboardShortcutsOverlay } from './keyboard-shortcuts'
import { ChapterImagesLayer } from './ChapterImagesLayer'
import { ChapterDecorationsCanvas } from './ChapterDecorationsCanvas'
import { DecorationPanel } from './DecorationPanel'
import { EdgeActionChip } from './EdgeActionChip'
import { defaultDecorationImage } from './decoration-picker'
import { GRID_SCALE, NODE_BASE_PX } from './quest-canvas-model'
import { XIcon } from '../ui/icons'

interface CanvasAreaProps {
  questBackgroundUrl?: string | null
  connectMode: boolean
  onExitConnect: () => void
  decorEditMode: boolean
  textureIndex?: Record<string, string>
  activeChapterImages: ChapterImage[]
  zoom: number
  nodes: Node[]
  edges: Edge[]
  onNodesChange: (changes: NodeChange[]) => void
  onEdgesChange: (changes: EdgeChange[]) => void
  onConnect: (connection: Connection) => void
  onReconnect: (oldEdge: Edge, newConnection: Connection) => void
  onNodeClick: (event: ReactMouseEvent, node: Node) => void
  onNodeDoubleClick: (event: ReactMouseEvent, node: Node) => void
  onNodeMouseEnter: (event: ReactMouseEvent, node: Node) => void
  onNodeMouseLeave: () => void
  onNodeContextMenu: (event: ReactMouseEvent, node: Node) => void
  onEdgeClick: (event: ReactMouseEvent, edge: Edge) => void
  onEdgeDoubleClick: (event: ReactMouseEvent, edge: Edge) => void
  onPaneClick: () => void
  onPaneContextMenu: (event: ReactMouseEvent | MouseEvent) => void
  onNodeDragStop: (event: any, node: Node, nodes?: Node[]) => void
  editLocked: boolean
  showMiniMap: boolean
  showBackground: boolean
  simMode: boolean
  viewportMenuPos: QuestCtxMenuState | null
  onCloseCtxMenu: () => void
  onCtxEdit: (nodeId: string) => void
  onCtxRename: (nodeId: string) => void
  onCtxDuplicate: () => void
  onCtxCopyId: () => void
  onCtxDelete: () => void
  onCtxComplete: () => void
  onCtxReset: () => void
  onCtxAddQuest: () => void
  onCtxAddLink: () => void
  onCtxPaste: () => void
  onCtxAddQuestWithTask: (objectiveType: string) => void
  onCtxMoveToChapter: (chapterId: string) => void
  moveToChapters: MoveChapterOption[]
  selectedCount: number
  hasClipboard: boolean
  showShortcuts: boolean
  onCloseShortcuts: () => void
  activeChapter: string | null
  onAddNode: (chapterId: string) => void
  onAddLink?: (chapterId: string, position?: { x: number; y: number }) => void
  selectedEdge: QuestEdgeData | null
  onDeleteEdge: (edgeId: string) => void
  setSelectedEdgeId: Dispatch<SetStateAction<string | null>>
  nodeLabelById: (id: string) => string
  selectedDecoIndex: number | null
  onSelectDeco: (index: number | null) => void
  onChangeDecorations: (images: ChapterImage[]) => void
}

export function CanvasArea({
  questBackgroundUrl, connectMode, onExitConnect, decorEditMode, textureIndex,
  activeChapterImages,
  zoom,
  nodes, edges, onNodesChange, onEdgesChange,
  onConnect, onReconnect, onNodeClick, onNodeDoubleClick, onNodeMouseEnter,
  onNodeMouseLeave, onNodeContextMenu, onEdgeClick, onEdgeDoubleClick,
  onPaneClick, onPaneContextMenu, onNodeDragStop,
  editLocked, showMiniMap, showBackground, simMode,
  viewportMenuPos, onCloseCtxMenu, onCtxEdit, onCtxRename, onCtxDuplicate,
  onCtxCopyId, onCtxDelete, onCtxComplete, onCtxReset, onCtxAddQuest,
  onCtxAddLink, onCtxPaste, onCtxAddQuestWithTask, onCtxMoveToChapter,
  moveToChapters, selectedCount, hasClipboard,
  showShortcuts, onCloseShortcuts, activeChapter, onAddNode, onAddLink,
  selectedEdge,
  onDeleteEdge, setSelectedEdgeId, nodeLabelById, selectedDecoIndex,
  onSelectDeco, onChangeDecorations,
}: CanvasAreaProps) {
  return (
    <div className={`quest-canvas-wrapper${questBackgroundUrl ? ' has-backdrop' : ''}${connectMode ? ' connect-mode' : ''}`}>
      {questBackgroundUrl && (
        <div
          className="quest-canvas-backdrop"
          style={{ backgroundImage: `url(${questBackgroundUrl})` }}
        />
      )}
      {connectMode && (
        <div className="connect-mode-banner">
          Drag from a quest's center port to another quest to create a dependency arrow.
          <button className="connect-mode-close" onClick={onExitConnect} title="Exit connect mode" aria-label="Exit connect mode">
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
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onReconnect={onReconnect}
        onNodeClick={onNodeClick}
        onNodeDoubleClick={onNodeDoubleClick}
        onNodeMouseEnter={onNodeMouseEnter}
        onNodeMouseLeave={onNodeMouseLeave}
        onNodeContextMenu={onNodeContextMenu}
        onEdgeClick={onEdgeClick}
        onEdgeDoubleClick={onEdgeDoubleClick}
        onPaneClick={onPaneClick}
        onPaneContextMenu={onPaneContextMenu}
        onNodeDragStop={onNodeDragStop}
        // Per-edge style is resolved by the canvas model (state colors, march).
        // Newly created edges are restyled on the next graph build; these
        // options are the momentary default while a connection is in flight.
        defaultEdgeOptions={{ type: 'dependency', animated: false }}
        connectionMode={ConnectionMode.Loose}
        connectionLineType={ConnectionLineType.Straight}
        connectionLineStyle={{ stroke: 'var(--ftb-accent)', strokeWidth: 2, strokeDasharray: '6 4' }}
        edgesReconnectable={!editLocked}
        reconnectRadius={28}
        // The single target handle sits at the quest CENTER now, so a drop
        // anywhere on a big quest tile can land far from it — widen the
        // acceptance radius to cover scaled-up quests.
        connectionRadius={40}
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
        <KeyboardShortcutsOverlay onClose={onCloseShortcuts} />
      )}

      {viewportMenuPos && (
        <QuestContextMenu
          menu={viewportMenuPos}
          simMode={simMode}
          selectedCount={selectedCount}
          hasClipboard={hasClipboard}
          moveToChapters={moveToChapters}
          onClose={onCloseCtxMenu}
          onEdit={onCtxEdit}
          onRename={onCtxRename}
          onDuplicate={onCtxDuplicate}
          onCopyId={onCtxCopyId}
          onDelete={onCtxDelete}
          onComplete={onCtxComplete}
          onReset={onCtxReset}
          onAddQuest={onCtxAddQuest}
          onAddLink={onCtxAddLink}
          onPaste={onCtxPaste}
          onAddQuestWithTask={onCtxAddQuestWithTask}
          onMoveToChapter={onCtxMoveToChapter}
          objectiveTypes={OBJECTIVE_TYPES}
        />
      )}

      {activeChapter && !decorEditMode && !connectMode && !editLocked && (
        <div className="canvas-overlay">
          <div className="chapter-add-button" onClick={() => onAddNode(activeChapter)}>
            + Add Quest
          </div>
          <div className="chapter-add-button chapter-add-link-button" onClick={() => onAddLink?.(activeChapter)} title="Add a quest link that references another quest (cross-chapter)">
            Add Link
          </div>
        </div>
      )}

      {selectedEdge && (
        <EdgeActionChip
          edgeLabel={`${nodeLabelById(selectedEdge.source)} → ${nodeLabelById(selectedEdge.target)}`}
          editLocked={editLocked}
          onDelete={() => {
            onDeleteEdge(selectedEdge.id)
            setSelectedEdgeId(null)
          }}
        />
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
              onSelect={onSelectDeco}
              onChange={onChangeDecorations}
            />
          </ViewportPortal>
          <DecorationPanel
            textureIndex={textureIndex}
            images={activeChapterImages}
            selectedIndex={selectedDecoIndex}
            onAddImage={(key) =>
              onChangeDecorations([...activeChapterImages, defaultDecorationImage(key)])
            }
            onChangeImages={onChangeDecorations}
          />
        </>
      )}
    </div>
  )
}
