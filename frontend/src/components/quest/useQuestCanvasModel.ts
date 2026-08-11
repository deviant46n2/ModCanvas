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
import { buildCanvasNodes, buildCanvasEdges, chapterDefaultShapes } from './quest-canvas-model'

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
  fitView: (options?: { duration?: number; padding?: number; maxZoom?: number; nodes?: Array<{ id: string }> }) => void
}

export function useQuestCanvasModel(args: UseQuestCanvasModelArgs) {
  const {
    questGraph, chapters, activeChapter, textureIndex, selectedIds, simMode,
    simProgress, searchQuery, milestoneOnly, renameNonce, onUpdateNode, fitView,
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

  useEffect(() => {
    if (nodes.length > 0) {
      setTimeout(() => fitView({ duration: 300, padding: 0.15 }), 100)
    }
  }, [nodes.length, fitView])

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
