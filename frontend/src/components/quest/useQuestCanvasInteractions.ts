import { useCallback, type Dispatch, type SetStateAction, type MouseEvent as ReactMouseEvent } from 'react'
import { reconnectEdge } from '@xyflow/react'
import type { Node, Edge, Connection, NodeChange, EdgeChange } from '@xyflow/react'
import type { QuestNodeData, EdgeBezierRel } from '../../services/quest-types'
import type { ProgressState } from '../../core/quest/progress'
import { snapDragUpdates } from './quest-canvas-model'

interface UseQuestCanvasInteractionsArgs {
  setSelectedIds: Dispatch<SetStateAction<Set<string>>>
  setSelectedEdgeId: Dispatch<SetStateAction<string | null>>
  setSelectedNodeId: (id: string | null) => void
  setHoveredNodeId: (id: string | null) => void
  setSelectedDecoIndex: (index: number | null) => void
  setBezierEditEdgeId: Dispatch<SetStateAction<string | null>>
  onNodesChange: (changes: NodeChange[]) => void
  onEdgesChange: (changes: EdgeChange[]) => void
  setEdges: (updater: (edges: Edge[]) => Edge[]) => void
  onAddEdge: (edge: { source: string; target: string }) => void
  onUpdateEdge: (edgeId: string, data: { source?: string; target?: string }) => void
  onDeleteEdge: (edgeId: string) => void
  onUpdateNodes: (updates: Array<{ nodeId: string; data: Partial<QuestNodeData> }>) => void
  onAddNode: (chapterId: string, position?: { x: number; y: number }) => void
  onUpdateEdgeBezier?: (edgeId: string, bezier: EdgeBezierRel | null) => void
  editLocked: boolean
  simMode: boolean
  onSetQuestProgress?: (questId: string, status: 'started' | 'complete' | null) => void
  simProgress: ProgressState
  questGridScale: number | undefined
  fitView: (options?: { duration?: number; padding?: number; maxZoom?: number; nodes?: Array<{ id: string }> }) => void
}

export function useQuestCanvasInteractions(args: UseQuestCanvasInteractionsArgs) {
  const {
    setSelectedIds, setSelectedEdgeId, setSelectedNodeId, setHoveredNodeId,
    setSelectedDecoIndex, setBezierEditEdgeId,
    onNodesChange, onEdgesChange, setEdges,
    onAddEdge, onUpdateEdge, onDeleteEdge, onUpdateNodes, onAddNode,
    onUpdateEdgeBezier, editLocked, simMode, onSetQuestProgress, simProgress,
    questGridScale, fitView,
  } = args

  const handleConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return
      onAddEdge({ source: connection.source, target: connection.target })
    },
    [onAddEdge]
  )

  const handleNodesChange = useCallback((changes: NodeChange[]) => {
    for (const change of changes) {
      if (change.type === 'select' && typeof change.id === 'string') {
        setSelectedIds(prev => {
          const next = new Set(prev)
          if (change.selected) next.add(change.id)
          else next.delete(change.id)
          return next
        })
      }
    }
    onNodesChange(changes)
  }, [onNodesChange, setSelectedIds])

  const handleEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      for (const change of changes) {
        if (change.type === 'select') {
          setSelectedEdgeId(change.selected ? change.id : null)
        } else if (change.type === 'remove') {
          setSelectedEdgeId((prev) => (prev === change.id ? null : prev))
        }
      }
      onEdgesChange(changes)
    },
    [onEdgesChange, setSelectedEdgeId]
  )

  // Re-drag an arrow endpoint onto another quest to reparent the dependency.
  const handleReconnect = useCallback(
    (oldEdge: Edge, newConnection: Connection) => {
      if (!newConnection.source || !newConnection.target) return
      setEdges((eds) => reconnectEdge(oldEdge, newConnection, eds))
      onUpdateEdge(oldEdge.id, {
        source: newConnection.source,
        target: newConnection.target,
      })
    },
    [setEdges, onUpdateEdge]
  )

  const handleEdgeClick = useCallback(
    (_: ReactMouseEvent, edge: Edge) => {
      setSelectedNodeId(null)
      setSelectedEdgeId(edge.id)
    },
    [setSelectedNodeId, setSelectedEdgeId]
  )

  // Double-click a dependency arrow to remove it.
  const handleEdgeDoubleClick = useCallback(
    (_: ReactMouseEvent, edge: Edge) => {
      if (editLocked) return
      onDeleteEdge(edge.id)
      setSelectedEdgeId(null)
      setBezierEditEdgeId(null)
    },
    [onDeleteEdge, editLocked, setSelectedEdgeId, setBezierEditEdgeId]
  )

  const handleNodeClick = useCallback(
    (_: ReactMouseEvent, node: Node) => {
      setSelectedNodeId(node.id)
      setSelectedEdgeId(null)
    },
    [setSelectedNodeId, setSelectedEdgeId]
  )

  const handleNodeMouseEnter = useCallback(
    (_: ReactMouseEvent, node: Node) => {
      setHoveredNodeId(node.id)
    },
    [setHoveredNodeId]
  )

  const handlePaneClick = useCallback(() => {
    setSelectedNodeId(null)
    setHoveredNodeId(null)
    setSelectedEdgeId(null)
    setSelectedDecoIndex(null)
    setBezierEditEdgeId(null)
  }, [setSelectedNodeId, setHoveredNodeId, setSelectedEdgeId, setSelectedDecoIndex, setBezierEditEdgeId])

  const handleNodeMouseLeave = useCallback(() => {
    setHoveredNodeId(null)
  }, [setHoveredNodeId])

  // In Simulate mode, double-clicking a quest toggles its simulated completion.
  const handleNodeDoubleClick = useCallback(
    (_: ReactMouseEvent, node: Node) => {
      if (!simMode || !onSetQuestProgress) return
      const id = node.id
      onSetQuestProgress(id, simProgress[id] === 'complete' ? null : 'complete')
    },
    [simMode, onSetQuestProgress, simProgress]
  )

  const handleNodeDragStop = useCallback(
    (_: any, node: Node, currentNodes?: Node[]) => {
      // Mirror in-game quest grid snapping: grid snap grain is
      // gridScale × minSize of the selection, and Shift disables snapping.
      const shiftHeld = !!_?.shiftKey
      const gridScale = questGridScale || 0.5
      const dragged = currentNodes && currentNodes.length > 0 ? currentNodes : [node]
      onUpdateNodes(snapDragUpdates(dragged, shiftHeld, gridScale))
    },
    [onUpdateNodes, questGridScale]
  )

  const handleAddNode = useCallback(
    (chapterId: string) => {
      onAddNode(chapterId)
    },
    [onAddNode]
  )

  const handleFitView = useCallback(() => {
    fitView({ duration: 500 })
  }, [fitView])

  // Bezier curve editing: live preview only rewrites the local React Flow edge;
  // the graph is committed once on pointer-up so history stays clean.
  const previewEdgeBezier = useCallback((edgeId: string, bezier: EdgeBezierRel) => {
    setEdges((eds) => eds.map((e) =>
      e.id === edgeId ? { ...e, data: { ...(e.data as object | undefined), bezierRel: bezier } } : e
    ))
  }, [setEdges])

  const commitEdgeBezier = useCallback((edgeId: string, bezier: EdgeBezierRel | null) => {
    onUpdateEdgeBezier?.(edgeId, bezier)
  }, [onUpdateEdgeBezier])

  return {
    handleConnect, handleNodesChange, handleEdgesChange, handleReconnect,
    handleEdgeClick, handleEdgeDoubleClick, handleNodeClick,
    handleNodeMouseEnter, handleNodeMouseLeave, handlePaneClick,
    handleNodeDoubleClick, handleNodeDragStop, handleAddNode, handleFitView,
    previewEdgeBezier, commitEdgeBezier,
  }
}
