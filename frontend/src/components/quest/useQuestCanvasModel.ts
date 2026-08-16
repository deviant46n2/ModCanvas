import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { useNodesState, useEdgesState } from '@xyflow/react';
import type { Node, Edge } from '@xyflow/react';
import type { QuestGraphData, QuestChapter, QuestNodeData, QuestEdgeData } from '../../services/quest-types';
import { subscribeEngineConnectChange } from '../../services/engine-render';
import { detectCycles } from './quest-edges';
import { resolveEdgeState, edgeStyleForState } from '../../core/quest/edge-state';
import { computeVisibility, isLocked, type ProgressState } from '../../core/quest/progress';
import { searchQuestNodes } from '../../core/quest/search';
import { isMilestoneShape } from '../../core/quest/quest-shapes';
import { buildCanvasNodes, buildCanvasEdges, chapterDefaultShapes, GRID_SCALE, NODE_BASE_PX } from './quest-canvas-model'
import { questSizeToPixels } from './quest-form-constants'

interface UseQuestCanvasModelArgs {
  questGraph: QuestGraphData
  chapters: QuestChapter[]
  activeChapter: string | null
  textureIndex?: Record<string, string>
  selectedIds: Set<string>
  simMode: boolean
  simProgress: ProgressState
  searchQuery: string
  milestoneOnly: boolean
  renameNonce: { nodeId: string; n: number } | null
  onUpdateNode: (nodeId: string, data: Partial<QuestNodeData>) => void
  /** The instance's guiScale (options.txt, default 1). The chapter-open zoom
   *  scales by it so the editor matches the player's actual game look. */
  guiScale: number
  /** ReactFlow instance helper: center the viewport on a flow point at `zoom`. */
  setCenter: (x: number, y: number, options?: { zoom?: number }) => Promise<boolean> | void
}

export function useQuestCanvasModel(args: UseQuestCanvasModelArgs) {
  const {
    questGraph, chapters, activeChapter, textureIndex, selectedIds, simMode,
    simProgress, searchQuery, milestoneOnly, renameNonce, onUpdateNode, guiScale, setCenter,
  } = args

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null)

  // Search-filter state. A non-empty query dims non-matching quests and
  // highlights the matches; Enter focuses the first match.
  const searchActive = searchQuery.trim().length > 0

  const filteredNodeIds = useMemo(() => {
    if (!activeChapter) {
      // Never render "every chapter at once": fall back to the first chapter
      // when one exists. This guards against a stale/null active chapter
      // (e.g. switching packs) showing all quests superimposed.
      const fallback = chapters[0]?.id
      if (fallback) {
        return new Set(
          questGraph.nodes
            .filter((n: QuestNodeData) => n.chapter_id === fallback)
            .map((n: QuestNodeData) => n.id)
        )
      }
      return new Set(questGraph.nodes.map((n: QuestNodeData) => n.id))
    }
    return new Set(
      questGraph.nodes.filter((n: QuestNodeData) => n.chapter_id === activeChapter).map((n: QuestNodeData) => n.id)
    )
  }, [questGraph.nodes, activeChapter, chapters])

  const filteredEdges = useMemo(() => {
    return questGraph.edges.filter(
      (e: QuestEdgeData) => filteredNodeIds.has(e.source) && filteredNodeIds.has(e.target)
    )
  }, [questGraph.edges, filteredNodeIds])

  const searchMatchIds = useMemo(() => {
    if (!searchActive) return null
    const chapterNodes = questGraph.nodes.filter(
      (n: QuestNodeData) => filteredNodeIds.has(n.id) && (n.node_type === 'quest' || n.node_type === 'side_quest')
    )
    return searchQuestNodes(chapterNodes, searchQuery)
  }, [searchActive, searchQuery, questGraph.nodes, filteredNodeIds])

  // Milestones filter: dims every quest that is not an explicit diamond-shape
  // quest (the milestone marker). Shares the search dim mechanism — both
  // filters intersect when active together.
  const milestoneMatchIds = useMemo(() => {
    if (!milestoneOnly) return null
    return new Set(
      questGraph.nodes
        .filter(
          (n: QuestNodeData) =>
            filteredNodeIds.has(n.id) &&
            (n.node_type === 'quest' || n.node_type === 'side_quest') &&
            isMilestoneShape(n.shape)
        )
        .map((n: QuestNodeData) => n.id)
    )
  }, [milestoneOnly, questGraph.nodes, filteredNodeIds])

  const cycleEdges = useMemo(() => detectCycles(filteredEdges), [filteredEdges])
  const isCycleEdge = useCallback(
    (e: Edge) => cycleEdges.has(`${e.source}->${e.target}`),
    [cycleEdges]
  )

  // Progress-simulation lookup: per-quest visibility + lock state derived from
  // the current chapter's dependency edges and the sim's completion map. Hidden
  // quests are dimmed on the canvas; locked ones get a lock badge.
  const questsById = useMemo(() => {
    const map: Record<string, QuestNodeData> = {}
    for (const n of questGraph.nodes) map[n.id] = n
    return map
  }, [questGraph.nodes])

  const simStatusById = useMemo(() => {
    const status: Record<string, { hidden: boolean; locked: boolean }> = {}
    for (const n of questGraph.nodes) {
      if (n.node_type !== 'quest') continue
      const vis = computeVisibility(n.id, questsById, filteredEdges, simProgress)
      status[n.id] = {
        hidden: !vis.visible,
        locked: !vis.visible ? false : isLocked(n.id, filteredEdges, simProgress),
      }
    }
    return status
  }, [questGraph.nodes, questsById, filteredEdges, simProgress])

  // Quest id → locked, for the edge state mapper. Locked quests render their
  // outgoing edges in the faded "unavailable" state (a fresh pack with no
  // progress shows exactly what the game shows for an untouched book).
  const lockedById = useMemo(() => {
    const map: Record<string, boolean> = {}
    for (const [id, st] of Object.entries(simStatusById)) map[id] = st.locked
    return map
  }, [simStatusById])

  const textureVersionRef = useRef(0)
  const prevTextureIndexRef = useRef<Record<string, string> | undefined>(undefined)
  // Rebuild quest icons when the engine-render path toggles: baked icons hide
  // while the companion is connected (engine render is imminent) and reappear
  // as real engine icons / software fallbacks otherwise.
  const [iconRefreshTick, bumpIconRefresh] = useReducer((x: number) => x + 1, 0)
  useEffect(() => subscribeEngineConnectChange(bumpIconRefresh), [])

  useEffect(() => {
    if (textureIndex && textureIndex !== prevTextureIndexRef.current) {
      prevTextureIndexRef.current = textureIndex
      textureVersionRef.current += 1
    }
    const newNodes = buildCanvasNodes({
      nodes: questGraph.nodes,
      filteredNodeIds,
      textureIndex,
      selectedIds,
      simMode,
      simStatusById,
      simProgress,
      searchActive,
      searchMatchIds,
      milestoneOnly,
      milestoneMatchIds,
      renameNonce,
      onUpdateNode,
      chapterDefaults: chapterDefaultShapes(questGraph.chapters),
    })
    const newEdges = buildCanvasEdges({
      edges: filteredEdges,
      nodes: newNodes,
      cycleEdges,
      progress: simProgress,
      lockedById,
    })
    setNodes(newNodes)
    setEdges(newEdges)
  }, [questGraph.nodes, filteredEdges, filteredNodeIds, textureIndex, cycleEdges, selectedIds, simMode, simProgress, simStatusById, lockedById, searchActive, searchMatchIds, milestoneOnly, milestoneMatchIds, renameNonce, onUpdateNode, iconRefreshTick, setNodes, setEdges])

  // Open/switch framing: mirror the in-game quest book, which does NOT
  // fit-to-content — it opens every chapter at a fixed default scale (28px per
  // quest-unit: zoom 16 → bs+bp = 16*1.5 + 16*1.0/4) and centers the content
  // (QuestPanel.resetScroll, QuestScreen default zoom 16). fitView stretched
  // small chapters to fill the pane, rendering their cells orders of magnitude
  // bigger than the game (the s63 "10x zoomed in" bug). Instead, center the
  // chapter's node bounds at zoom 28/42 = 2/3 so 1 quest-unit maps to the same
  // 28px the game uses on screen. Bounds are computed from the raw graph so the
  // effect is correct on the render where activeChapter changes (the built
  // `nodes` state lags one commit behind here). A ref guards one frame per open.
  const lastFramedChapter = useRef<string | null>(null)
  useEffect(() => {
    if (activeChapter === null || activeChapter === lastFramedChapter.current) return
    const chapterNodes = questGraph.nodes.filter((n: QuestNodeData) => n.chapter_id === activeChapter)
    if (chapterNodes.length === 0) return
    lastFramedChapter.current = activeChapter
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const n of chapterNodes) {
      const size = questSizeToPixels(n.size, NODE_BASE_PX)
      const cx = n.position.x * GRID_SCALE
      const cy = n.position.y * GRID_SCALE
      minX = Math.min(minX, cx - size.width / 2)
      minY = Math.min(minY, cy - size.height / 2)
      maxX = Math.max(maxX, cx + size.width / 2)
      maxY = Math.max(maxY, cy + size.height / 2)
    }
    const centerX = (minX + maxX) / 2
    const centerY = (minY + maxY) / 2
    // 28/42 = 2/3: the game's default cell scale (28px/unit) at the editor's
    // GRID_SCALE of 42px/unit. Delayed a tick so ReactFlow has laid out nodes.
    // ×guiScale matches the game's own guiScale (options.txt): the game
    // renders 28px/unit at scale 1, scaled up by its GUI scale (s64).
    setTimeout(() => setCenter(centerX, centerY, { zoom: (28 / GRID_SCALE) * guiScale }), 100)
  }, [activeChapter, questGraph.nodes, setCenter, guiScale])

  // Node-hover highlighting. The hovered quest's fan takes the in-game
  // requires/required-for hues and marches at the fast speed; every other edge
  // keeps its static state color and slow march. Cycle red always wins. The
  // pass only rewrites edge style + data — never node state — so hovering
  // can't re-render the canvas (the documented frame-loop rule).
  useEffect(() => {
    setEdges((eds) => eds.map((edge) => {
      const isCycle = isCycleEdge(edge)
      const state = resolveEdgeState(edge, { progress: simProgress, lockedById, hoveredNodeId, isCycle })
      const spec = edgeStyleForState(state)
      const currentWidth = Number((edge.style as { strokeWidth?: unknown } | undefined)?.strokeWidth) || 3
      return {
        ...edge,
        style: {
          stroke: spec.stroke,
          strokeWidth: isCycle ? 3.5 : currentWidth,
          opacity: spec.opacity,
          strokeDasharray: spec.dashArray ?? undefined,
        },
        data: { ...(edge.data as object | undefined), state, march: spec.march },
      }
    }))
  }, [hoveredNodeId, isCycleEdge, simProgress, lockedById, setEdges])

  return {
    nodes, setNodes, edges, setEdges, onNodesChange, onEdgesChange,
    filteredNodeIds, filteredEdges, cycleEdges, searchMatchIds,
    setHoveredNodeId,
  }
}
