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
  SelectionMode,
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
import { AddQuestOverlay } from './AddQuestOverlay'
import { defaultDecorationImage } from './decoration-picker'
import { GRID_SCALE, NODE_BASE_PX } from './quest-canvas-model'
import { XIcon } from '../ui/icons'
import { argbAlpha } from '../../core/quest/theme-color'
import type { ResolvedThemeBackground } from '../../hooks/useQuestAssetPipeline/activity'

interface CanvasAreaProps {
  questBackground?: ResolvedThemeBackground | null
  /** The instance's guiScale (options.txt, default 1) — background tiles
   *  scale by it to match the player's actual game look. */
  guiScale?: number
  connectMode: boolean
  onToggleConnect: () => void
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
  onAddNode: (chapterId: string, position?: { x: number; y: number }, count?: number) => void
  onAddLink?: (chapterId: string, position?: { x: number; y: number }) => void
  selectedEdge: QuestEdgeData | null
  onDeleteEdge: (edgeId: string) => void
  setSelectedEdgeId: Dispatch<SetStateAction<string | null>>
  nodeLabelById: (id: string) => string
  selectedDecoIndex: number | null
  onSelectDeco: (index: number | null) => void
  onOpenAssetsFolder: () => void
  onChangeDecorations: (images: ChapterImage[]) => void
  /** The element wrapping <ReactFlow>; its rect defines the visible pane. */
  paneRef?: React.RefObject<HTMLDivElement | null>
  /** Pack snap scale (QuestGraph.grid_scale, default 0.5) — the background
   *  grid renders at GRID_SCALE × grid_scale so snapped quests always sit ON
   *  a dot (s49-followup; the old 1-unit dots misaligned half-unit snaps). */
  gridScale?: number
}

export function CanvasArea({
  questBackground, guiScale = 1, connectMode, onExitConnect, onToggleConnect, decorEditMode, textureIndex,
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
  onSelectDeco, onChangeDecorations, onOpenAssetsFolder,
  paneRef, gridScale,
}: CanvasAreaProps) {
  return (
    <div ref={paneRef} className={`quest-canvas-wrapper${questBackground ? ' has-backdrop' : ''}${connectMode ? ' connect-mode' : ''}`}>
      {questBackground && (
        <div
          className="quest-canvas-backdrop"
          style={{
            backgroundImage: `url(${questBackground.url})`,
            // Game semantics (FTB Library ImageIcon.draw, v2101.1.35):
            // tile_size present → REPEAT at that size; absent → STRETCH to
            // the rect. The game never covers/crops.
            backgroundSize: questBackground.tileSize
              ? // The game tiles at tile_size GUI px, scaled by its guiScale
                // (options.txt) — the editor matches the player's actual look.
                `${questBackground.tileSize * guiScale}px ${questBackground.tileSize * guiScale}px`
              : '100% 100%',
            backgroundRepeat: questBackground.tileSize ? 'repeat' : 'no-repeat',
            // `color=` is a VERTEX TINT, not an overlay: RGB multiplies the
            // texture (identity for the white default), alpha modulates its
            // opacity over the dark pane base. CSS approximates with opacity
            // (non-white tints would hue-shift; none seen in real themes).
            opacity: questBackground.color ? (argbAlpha(questBackground.color) ?? 1) : 1,
          }}
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
        // Multi-select (s49): box-select by dragging on empty space + shift-
        // click toggles membership. The selectedIds Set, align/distribute,
        // clipboard, and context-menu count all existed but nothing enabled
        // multi-selection — these two props are the switch that turns them on.
        selectionOnDrag
        selectionMode={SelectionMode.Partial}
        multiSelectionKeyCode={['Shift']}
        minZoom={0.1}
        maxZoom={64}
        defaultViewport={{ x: 0, y: 0, zoom: 1 }}
        nodesDraggable={!connectMode && !editLocked}
        nodesConnectable={connectMode && !editLocked}
      >
        {showBackground && <Background variant={BackgroundVariant.Dots} gap={GRID_SCALE * (gridScale || 0.5)} size={1} color="#3a3a3a" />}
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

      {/* Visible in connect mode too, so the Connect toggle (moved here s49-
          followup) stays operable — the banner X is the secondary exit. */}
      {activeChapter && !decorEditMode && !editLocked && (
        <AddQuestOverlay
          activeChapter={activeChapter}
          editLocked={editLocked}
          connectMode={connectMode}
          onToggleConnect={onToggleConnect}
          decorEditMode={decorEditMode}
          onAddNode={onAddNode}
          onAddLink={onAddLink}
        />
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
            onOpenAssetsFolder={onOpenAssetsFolder}
          />
        </>
      )}
    </div>
  )
}
