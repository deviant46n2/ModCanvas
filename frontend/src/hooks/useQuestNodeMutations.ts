import { useCallback } from 'react'
import type { QuestGraphData, QuestNodeData, QuestEdgeData, EdgeBezierRel } from '../services/quest-types'
import { generateFtbHexId, defaultObjective, defaultReward, defaultQuestNodeData, moveArrayItem } from '../components/quest/quest-helpers'

interface UseQuestNodeMutationsOptions {
  graph: QuestGraphData | null
  commitGraph: (next: QuestGraphData, opts?: { split?: boolean }) => void
  scheduleAutoSave: () => void
  activeChapter: string | null
  selectedNodeId: string | null
  setSelectedNodeId: (id: string | null) => void
}

export function useQuestNodeMutations({
  graph,
  commitGraph,
  scheduleAutoSave,
  activeChapter,
  selectedNodeId,
  setSelectedNodeId,
}: UseQuestNodeMutationsOptions) {
  const onUpdateNode = useCallback((nodeId: string, data: Partial<QuestNodeData>) => {
    if (!graph) return
    commitGraph({ ...graph, nodes: graph.nodes.map(n => n.id === nodeId ? { ...n, ...data } : n) })
    scheduleAutoSave()
  }, [graph, scheduleAutoSave])

  const onUpdateNodes = useCallback((updates: Array<{ nodeId: string; data: Partial<QuestNodeData> }>) => {
    if (!graph) return
    const byId = new Map(updates.map(u => [u.nodeId, u.data]))
    commitGraph({
      ...graph,
      nodes: graph.nodes.map(n => (byId.has(n.id) ? { ...n, ...byId.get(n.id) } : n)),
    })
    scheduleAutoSave()
  }, [graph, scheduleAutoSave])

  const onAddQuest = useCallback((_chapterId?: string, position?: { x: number; y: number }) => {
    if (!graph || !activeChapter) return
    const newNode = defaultQuestNodeData({ chapter_id: activeChapter, label: 'New Quest', position: position || { x: 0, y: 0 } })
    commitGraph({ ...graph, nodes: [...graph.nodes, newNode] })
    setSelectedNodeId(newNode.id)
    scheduleAutoSave()
  }, [graph, activeChapter, scheduleAutoSave, setSelectedNodeId])

  const onAddQuestWithTask = useCallback((_chapterId: string, objectiveType: string, position?: { x: number; y: number }) => {
    if (!graph || !activeChapter) return
    const node = defaultQuestNodeData({
      chapter_id: activeChapter,
      label: 'New Quest',
      position: position || { x: 0, y: 0 },
    })
    const objective = { ...defaultObjective(), objective_type: objectiveType }
    const newNode = { ...node, objectives: [objective] }
    commitGraph({ ...graph, nodes: [...graph.nodes, newNode] })
    setSelectedNodeId(newNode.id)
    scheduleAutoSave()
  }, [graph, activeChapter, scheduleAutoSave, setSelectedNodeId])

  const onAddQuestLink = useCallback((_chapterId?: string, position?: { x: number; y: number }) => {
    if (!graph || !activeChapter) return
    const newNode = defaultQuestNodeData({
      chapter_id: activeChapter,
      node_type: 'quest_link',
      label: 'New Link',
      position: position || { x: 0, y: 0 },
      link_target: graph.nodes.find((n: QuestNodeData) => n.node_type === 'quest')?.id || '',
    })
    commitGraph({ ...graph, nodes: [...graph.nodes, newNode] })
    setSelectedNodeId(newNode.id)
    scheduleAutoSave()
  }, [graph, activeChapter, scheduleAutoSave, setSelectedNodeId])

  const onDeleteNode = useCallback((nodeId: string) => {
    if (!graph) return
    commitGraph({ ...graph, nodes: graph.nodes.filter(n => n.id !== nodeId) })
    if (selectedNodeId === nodeId) setSelectedNodeId(null)
    scheduleAutoSave()
  }, [graph, selectedNodeId, scheduleAutoSave, setSelectedNodeId])

  const onDeleteNodes = useCallback((nodeIds: string[]) => {
    if (!graph || nodeIds.length === 0) return
    const dead = new Set(nodeIds)
    commitGraph({
      ...graph,
      nodes: graph.nodes.filter(n => !dead.has(n.id)),
      edges: graph.edges.filter(e => !dead.has(e.source) && !dead.has(e.target)),
    })
    if (selectedNodeId && dead.has(selectedNodeId)) setSelectedNodeId(null)
    scheduleAutoSave()
  }, [graph, selectedNodeId, scheduleAutoSave, setSelectedNodeId])

  const onMoveNodesToChapter = useCallback((nodeIds: string[], chapterId: string) => {
    if (!graph || nodeIds.length === 0 || !chapterId) return
    const moving = new Set(nodeIds)
    commitGraph({
      ...graph,
      // Only the chapter_id changes — positions, edges, objectives and rewards
      // stay attached. FTB allows cross-chapter dependencies, so edges survive.
      nodes: graph.nodes.map(n => (moving.has(n.id) ? { ...n, chapter_id: chapterId } : n)),
    })
    scheduleAutoSave()
  }, [graph, commitGraph, scheduleAutoSave])

  const onPasteNodes = useCallback((newNodes: QuestNodeData[], newEdges: QuestEdgeData[]) => {
    if (!graph || newNodes.length === 0) return
    commitGraph({
      ...graph,
      nodes: [...graph.nodes, ...newNodes],
      edges: [...graph.edges, ...newEdges],
    })
    scheduleAutoSave()
  }, [graph, scheduleAutoSave])

  const onAddEdge = useCallback((edge: { source: string; target: string }) => {
    if (!graph) return
    if (!edge.source || !edge.target || edge.source === edge.target) return
    const exists = graph.edges.some(e => e.source === edge.source && e.target === edge.target)
    if (exists) return
    const newEdge: QuestEdgeData = {
      id: generateFtbHexId(),
      source: edge.source,
      target: edge.target,
      label: null,
      edge_type: 'prerequisite',
      inverted: false,
    }
    commitGraph({ ...graph, edges: [...graph.edges, newEdge] })
    scheduleAutoSave()
  }, [graph, scheduleAutoSave])

  const onUpdateEdge = useCallback((edgeId: string, data: { source?: string; target?: string }) => {
    if (!graph) return
    const source = data.source ?? ''
    const target = data.target ?? ''
    if (!source || !target || source === target) return
    const duplicate = graph.edges.some(e =>
      e.id !== edgeId && e.source === source && e.target === target
    )
    if (duplicate) return
    commitGraph({
      ...graph,
      edges: graph.edges.map(e => e.id === edgeId ? { ...e, ...data } : e),
    })
    scheduleAutoSave()
  }, [graph, scheduleAutoSave])

  const onDeleteEdge = useCallback((edgeId: string) => {
    if (!graph) return
    commitGraph({ ...graph, edges: graph.edges.filter(e => e.id !== edgeId) })
    scheduleAutoSave()
  }, [graph, scheduleAutoSave])

  const onUpdateEdgeBezier = useCallback((edgeId: string, bezier: EdgeBezierRel | null) => {
    if (!graph) return
    commitGraph({
      ...graph,
      edges: graph.edges.map(e => e.id === edgeId ? { ...e, bezier } : e),
    })
    scheduleAutoSave()
  }, [graph, scheduleAutoSave])

  const onAddObjective = useCallback((nodeId: string) => {
    if (!graph) return
    commitGraph({ ...graph, nodes: graph.nodes.map(n =>
      n.id === nodeId ? { ...n, objectives: [...(n.objectives || []), defaultObjective()] } : n
    )})
    scheduleAutoSave()
  }, [graph, scheduleAutoSave])

  const onAddReward = useCallback((nodeId: string) => {
    if (!graph) return
    commitGraph({ ...graph, nodes: graph.nodes.map(n =>
      n.id === nodeId ? { ...n, rewards: [...(n.rewards || []), defaultReward()] } : n
    )})
    scheduleAutoSave()
  }, [graph, scheduleAutoSave])

  const onRemoveObjective = useCallback((nodeId: string, objectiveId: string) => {
    if (!graph) return
    commitGraph({ ...graph, nodes: graph.nodes.map(n =>
      n.id === nodeId ? { ...n, objectives: (n.objectives || []).filter(o => o.id !== objectiveId) } : n
    )})
    scheduleAutoSave()
  }, [graph, scheduleAutoSave])

  const onRemoveReward = useCallback((nodeId: string, rewardId: string) => {
    if (!graph) return
    commitGraph({ ...graph, nodes: graph.nodes.map(n =>
      n.id === nodeId ? { ...n, rewards: (n.rewards || []).filter(r => r.id !== rewardId) } : n
    )})
    scheduleAutoSave()
  }, [graph, scheduleAutoSave])

  const onUpdateObjective = useCallback((nodeId: string, objectiveId: string, field: string, value: unknown) => {
    if (!graph) return
    commitGraph({ ...graph, nodes: graph.nodes.map(n =>
      n.id === nodeId ? { ...n, objectives: (n.objectives || []).map(o =>
        o.id === objectiveId ? { ...o, [field]: value } : o
      )} : n
    )})
    scheduleAutoSave()
  }, [graph, scheduleAutoSave])

  const onUpdateReward = useCallback((nodeId: string, rewardId: string, field: string, value: unknown) => {
    if (!graph) return
    commitGraph({ ...graph, nodes: graph.nodes.map(n =>
      n.id === nodeId ? { ...n, rewards: (n.rewards || []).map(r =>
        r.id === rewardId ? { ...r, [field]: value } : r
      )} : n
    )})
    scheduleAutoSave()
  }, [graph, scheduleAutoSave])

  const onMoveObjective = useCallback((nodeId: string, objectiveId: string, dir: -1 | 1) => {
    if (!graph) return
    const next = graph.nodes.map(n => {
      if (n.id !== nodeId) return n
      const list = n.objectives || []
      const idx = list.findIndex(o => o.id === objectiveId)
      return { ...n, objectives: moveArrayItem(list, idx, idx + dir) }
    })
    if (next.every((n, i) => n === graph.nodes[i])) return
    commitGraph({ ...graph, nodes: next })
    scheduleAutoSave()
  }, [graph, scheduleAutoSave])

  const onMoveReward = useCallback((nodeId: string, rewardId: string, dir: -1 | 1) => {
    if (!graph) return
    const next = graph.nodes.map(n => {
      if (n.id !== nodeId) return n
      const list = n.rewards || []
      const idx = list.findIndex(r => r.id === rewardId)
      return { ...n, rewards: moveArrayItem(list, idx, idx + dir) }
    })
    if (next.every((n, i) => n === graph.nodes[i])) return
    commitGraph({ ...graph, nodes: next })
    scheduleAutoSave()
  }, [graph, scheduleAutoSave])

  return {
    onUpdateNode,
    onUpdateNodes,
    onAddQuest,
    onAddQuestWithTask,
    onAddQuestLink,
    onDeleteNode,
    onDeleteNodes,
    onMoveNodesToChapter,
    onPasteNodes,
    onAddEdge,
    onUpdateEdge,
    onDeleteEdge,
    onUpdateEdgeBezier,
    onAddObjective,
    onAddReward,
    onRemoveObjective,
    onRemoveReward,
    onUpdateObjective,
    onUpdateReward,
    onMoveObjective,
    onMoveReward,
  }
}
