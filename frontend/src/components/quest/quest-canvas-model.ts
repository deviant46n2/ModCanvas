import { MarkerType } from '@xyflow/react';
import type { Node, Edge } from '@xyflow/react';
import type { QuestNodeData, QuestEdgeData } from '../../services/quest-types';
import type { ProgressState } from '../../core/quest/progress';
import { resolveEdgeState, edgeStyleForState } from '../../core/quest/edge-state';
import { questIconUrl } from './questIcons';
import { textureDisplayUrl } from '../../services/texture-loader';
import { shapeTextureKeys, effectiveShape, type ShapeTextures } from '../../core/quest/quest-shapes';
import { normalizeShape, questSizeToPixels, snapToGridStep } from './quest-form-constants';

// FTB Quests coordinate spacing — display scale, not snap grain.
// Kept at exactly 7:6 vs NODE_BASE_PX to mirror the in-game quest panel, where
// position pitch = zoom*(3/2 + quest_spacing/4) and body = zoom*(3/2) at the
// default quest_spacing=1.0 → pitch:body = 7:6.
export const GRID_SCALE = 42

// Base pixel size for a 1.0x quest node. Actual size is derived per quest from
// `node.size` (FTB grid units, default 24x24 = 1.0x) so scaled quests are
// visually distinguishable on the canvas. 36 : 42 (= 6:7 with GRID_SCALE) keeps
// the editor's quest-body:grid-pitch ratio identical to the in-game quest panel.
export const NODE_BASE_PX = 36

// Convert a ReactFlow flow coordinate (node-center anchored) into FTB grid
// cells. Shared by the AddQuestOverlay and the viewport API so cursor-spawn
// and center-spawn use the same mapping (s49-followup).
export function flowToGridPos(flow: { x: number; y: number }): { x: number; y: number } {
  return { x: (flow.x - NODE_BASE_PX / 2) / GRID_SCALE, y: (flow.y - NODE_BASE_PX / 2) / GRID_SCALE }
}

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

/** Resolve the chapter default shape map (chapter id → default_quest_shape)
 *  from the graph. Quests without an explicit shape inherit it in-game. */
export function chapterDefaultShapes(chapters: { id: string; default_quest_shape?: string }[]): Record<string, string> {
  const map: Record<string, string> = {}
  for (const c of chapters) {
    if (c.id) map[c.id] = c.default_quest_shape || ''
  }
  return map
}

function getNodeSize(node: QuestNodeData): { width: number; height: number } {
  return questSizeToPixels(node.size, NODE_BASE_PX)
}

interface BuildNodesArgs {
  nodes: QuestNodeData[]
  filteredNodeIds: Set<string>
  textureIndex?: Record<string, string>
  selectedIds: Set<string>
  simMode: boolean
  simStatusById: Record<string, { hidden: boolean; locked: boolean }>
  simProgress: ProgressState
  searchActive: boolean
  searchMatchIds: Set<string> | null
  /** Milestones filter: when active, dim every quest that is not an explicit
   *  diamond-shape quest (the milestone marker). Intersects with search. */
  milestoneOnly: boolean
  milestoneMatchIds: Set<string> | null
  renameNonce: { nodeId: string; n: number } | null
  onUpdateNode: (nodeId: string, data: Partial<QuestNodeData>) => void
  /** Chapter id → default_quest_shape. Quests without an explicit shape
   *  inherit it in-game, so the editor must render it too. */
  chapterDefaults?: Record<string, string>
}

export function buildCanvasNodes(args: BuildNodesArgs): Node[] {
  const {
    nodes, filteredNodeIds, textureIndex, selectedIds, simMode, simStatusById,
    simProgress, searchActive, searchMatchIds, milestoneOnly, milestoneMatchIds,
    renameNonce, onUpdateNode, chapterDefaults,
  } = args
  return nodes
    .filter((n: QuestNodeData) => filteredNodeIds.has(n.id))
    .map((node: QuestNodeData) => {
      const pixelSize = getNodeSize(node)
      let iconKey = node.icon
      if (!iconKey && node.objectives?.length > 0) {
        iconKey = node.objectives[0].target
      }
      const iconUrl = iconKey ? questIconUrl(iconKey, textureIndex || {}) : undefined
      const smartFilter: string | undefined =
        node.objectives?.find((o) => o.smart_filter)?.smart_filter || undefined
      // Center anchor: position is node center, so offset by half size
      const centerX = node.position.x * GRID_SCALE
      const centerY = node.position.y * GRID_SCALE
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
          // The shape the game will render for this node: its own shape when
          // set, else the chapter default (quests without a shape field
          // inherit it in-game). Used for the texture bake AND the CSS class.
          // `chapter_id` is null for chapter nodes, which have no default —
          // index only when it is a real id (TS: string | null cannot index).
          displayShape: effectiveShape(
            node.shape,
            node.chapter_id ? chapterDefaults?.[node.chapter_id] : null,
          ),
          shapeTextures: getShapeTextures(
            effectiveShape(
              node.shape,
              node.chapter_id ? chapterDefaults?.[node.chapter_id] : null,
            ),
            textureIndex || {},
          ),
          simStatus: simMode ? simStatusById[node.id] : undefined,
          simComplete: simMode ? simProgress[node.id] === 'complete' : false,
          // Dim filter status: search and the milestones filter both dim
          // non-matching quests via the same mechanism; when both are active
          // a quest must match both to stay lit.
          searchStatus: (() => {
            const anyFilter = searchActive || milestoneOnly
            if (!anyFilter) return undefined
            const inSearch = !searchActive || (searchMatchIds?.has(node.id) ?? false)
            const inMilestone = !milestoneOnly || (milestoneMatchIds?.has(node.id) ?? false)
            return inSearch && inMilestone ? 'match' : 'dim'
          })(),
          onRename: (label: string) => onUpdateNode(node.id, { label }),
          renameNonce: renameNonce?.nodeId === node.id ? renameNonce.n : 0,
        },
        style: {
          width: pixelSize.width,
          height: pixelSize.height,
        },
      }
    })
}

interface BuildEdgesArgs {
  edges: QuestEdgeData[]
  nodes: Node[]
  cycleEdges: Set<string>
  /** Per-quest simulated progress; drives the edge state colors. */
  progress: ProgressState
  /** Quest id → true when the quest is locked (its prerequisites unmet). */
  lockedById: Record<string, boolean>
}

// Edge stroke thickness: mirrors the game's `dependency_line_thickness` (0.17 ×
// quest tile size) so scaled-up quests get proportionally heavier lines.
export function edgeThickness(pixelSize: { width: number; height: number }): number {
  return Math.max(2.5, Math.round(pixelSize.width * 0.17 * 10) / 10)
}

export function buildCanvasEdges(args: BuildEdgesArgs): Edge[] {
  const { edges, nodes, cycleEdges, progress, lockedById } = args
  return edges.map((edge: QuestEdgeData) => {
    const srcNode = nodes.find((n) => n.id === edge.source)
    const srcSize = (srcNode?.data as any)?.pixelSize || { width: NODE_BASE_PX, height: NODE_BASE_PX }
    const isCycle = cycleEdges.has(`${edge.source}->${edge.target}`)
    const state = resolveEdgeState(edge, { progress, lockedById, hoveredNodeId: null, isCycle })
    const spec = edgeStyleForState(state)
    return {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      // Edges attach to the quest CENTER handle — the in-game dependency lines
      // run from tile center to tile center, with the tiles drawn on top.
      sourceHandle: 'c',
      targetHandle: 'tc',
      style: {
        stroke: spec.stroke,
        strokeWidth: isCycle ? 3.5 : edgeThickness(srcSize),
        opacity: spec.opacity,
        strokeDasharray: spec.dashArray ?? undefined,
      },
      markerEnd: isCycle
        ? { type: MarkerType.ArrowClosed, width: 24, height: 24, color: spec.stroke }
        : undefined,
      data: { state, march: spec.march },
    }
  })
}

export interface DragSnapNode {
  id: string
  position: { x: number; y: number }
  data?: Record<string, unknown>
}

// Mirror in-game quest grid snapping for a dragged group: the snap grain is
// `gridScale × minSize` (minSize = smallest selected quest's width in grid
// units), Shift disables snapping, and the group's min corner is snapped while
// relative offsets are preserved.
export function snapDragUpdates(
  dragged: DragSnapNode[],
  shiftHeld: boolean,
  gridScale: number,
): Array<{ nodeId: string; data: { position: { x: number; y: number } } }> {
  let minSize = 1
  for (const n of dragged) {
    const qn = n.data as any
    const w = (qn?.size?.width || 24) / 24
    minSize = Math.min(minSize, w)
  }

  let minX = Infinity, minY = Infinity
  for (const n of dragged) {
    const size = (n.data as any)?.pixelSize || { width: NODE_BASE_PX, height: NODE_BASE_PX }
    minX = Math.min(minX, (n.position.x + size.width / 2) / GRID_SCALE)
    minY = Math.min(minY, (n.position.y + size.height / 2) / GRID_SCALE)
  }
  const snapped = (v: number) => (shiftHeld ? v : snapToGridStep(v, gridScale, minSize))
  const dx = snapped(minX) - minX
  const dy = snapped(minY) - minY

  const updates: Array<{ nodeId: string; data: { position: { x: number; y: number } } }> = []
  for (const n of dragged) {
    const size = (n.data as any)?.pixelSize || { width: NODE_BASE_PX, height: NODE_BASE_PX }
    const gridX = (n.position.x + size.width / 2) / GRID_SCALE + dx
    const gridY = (n.position.y + size.height / 2) / GRID_SCALE + dy
    updates.push({ nodeId: n.id, data: { position: { x: gridX, y: gridY } } })
  }
  return updates
}
