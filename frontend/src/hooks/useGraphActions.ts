import { useState, useCallback, useEffect } from 'react'
import type { Node, Edge } from '@xyflow/react'
import type { QuestGraphData, QuestObjectiveData, QuestRewardData, QuestNodeData, QuestSize } from '../services/api'
import { saveQuestGraph } from '../services/api'
import { generateFtbHexId } from '../components/quest/nodes'
import { toRfEdges } from '../services/graphConverters'

interface ActionsContext {
  graph: QuestGraphData | null
  nodes: Node[]
  setNodes: React.Dispatch<React.SetStateAction<Node[]>>
  edges: Edge[]
  setEdges: React.Dispatch<React.SetStateAction<Edge[]>>
  toRfNodesCb: (g: QuestGraphData, ti: Record<string, string>) => Node[]
  textureIndex: Record<string, string>
  projectId: string
  activeChapter: string | null
  selectedNodeId: string | null
  selectedNode: Node | null
  deselectNode: () => void
  setSelectedNodeId: (id: string | null) => void
  saveGraph: () => Promise<void>
  setGraph: (g: QuestGraphData | null) => void
}

export function useGraphActions(ctx: ActionsContext) {
  const {
    graph, setNodes, setEdges, toRfNodesCb, textureIndex,
    projectId, activeChapter, selectedNodeId, selectedNode,
    deselectNode, setGraph,
  } = ctx

  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; nodeId?: string } | null>(null)
  const [clipboard, setClipboard] = useState<Node | null>(null)
  const [viewportPos, setViewportPos] = useState({ x: 0, y: 0, zoom: 1 })

  const closeContextMenu = useCallback(() => setContextMenu(null), [])

  const createQuestAtCursor = useCallback((type: string = 'quest') => {
    if (!graph || !activeChapter) return
    const newNode: QuestNodeData = {
      id: generateFtbHexId(), node_type: type,
      label: type === 'reward' ? 'New Reward' : type === 'gate' ? 'New Gate' : type === 'side_quest' ? 'Side Quest' : 'New Quest',
      description: '', position: { x: 0, y: 0 }, data: {}, objectives: [], rewards: [], required_items: [],
      chapter_id: activeChapter, icon: '', size: { width: 24, height: 24 }, color: '',
      visibility: 'Normal', optional: false, silently_complete: false,
      can_be_repeatable: false, repeat_min_delay: 0, repeat_max_delay: 0, repeat_time: 0,
      hide_quest_until_deps_complete: false, hide_quest_until_quest_complete: false,
      hide_quest_until_all_complete: false, disable_reward: false, pause_reward: false, lock_icon: '',
      subtitle: '', quest_background: '', shape: 'Default', icon_scaling: 1.0, tags: [],
      progression_mode: 'Default', sequential_tasks: false, disable_completion_toast: false,
      ignore_reward_blocking: false, disable_jei_recipe: false, min_window_width: 0,
      hide_details_until_startable: false, hide_text_until_completed: false,
      invisible_until_completed: false, invisible_until_x_tasks: 0,
      hide_dependency_lines: false, hide_dependent_lines: false,
      min_required_dependencies: 0, dependency_requirement: 'AllCompleted',
    }
    const updatedGraph: QuestGraphData = { ...graph, nodes: [...graph.nodes, newNode] }
    saveQuestGraph(projectId, updatedGraph).then(() => {
      setGraph(updatedGraph)
      setNodes(toRfNodesCb(updatedGraph, textureIndex))
      setEdges(toRfEdges(updatedGraph))
    }).catch((e) => console.error('Failed to create quest:', e))
    closeContextMenu()
  }, [graph, activeChapter, projectId, setNodes, setEdges, toRfNodesCb, textureIndex, closeContextMenu, saveQuestGraph, setGraph])

  const deleteNodeById = useCallback((nodeId: string) => {
    if (!graph) return
    const updatedGraph: QuestGraphData = {
      ...graph,
      nodes: graph.nodes.filter(n => n.id !== nodeId),
      edges: graph.edges.filter(e => e.source !== nodeId && e.target !== nodeId),
    }
    saveQuestGraph(projectId, updatedGraph).then(() => {
      setGraph(updatedGraph)
      setNodes(toRfNodesCb(updatedGraph, textureIndex))
      setEdges(toRfEdges(updatedGraph))
      deselectNode()
    }).catch((e) => console.error('Failed to delete quest:', e))
    closeContextMenu()
  }, [graph, projectId, setNodes, setEdges, toRfNodesCb, textureIndex, deselectNode, closeContextMenu, saveQuestGraph, setGraph])

  const deleteSelectedNode = useCallback(() => {
    if (!graph || !selectedNodeId) return
    const updatedGraph: QuestGraphData = {
      ...graph,
      nodes: graph.nodes.filter(n => n.id !== selectedNodeId),
      edges: graph.edges.filter(e => e.source !== selectedNodeId && e.target !== selectedNodeId),
    }
    saveQuestGraph(projectId, updatedGraph).then(() => {
      setGraph(updatedGraph)
      setNodes(toRfNodesCb(updatedGraph, textureIndex))
      setEdges(toRfEdges(updatedGraph))
      deselectNode()
    }).catch((e) => console.error('Failed to delete quest:', e))
    closeContextMenu()
  }, [graph, selectedNodeId, projectId, setNodes, setEdges, toRfNodesCb, textureIndex, deselectNode, closeContextMenu, saveQuestGraph, setGraph])

  const pasteNode = useCallback(() => {
    if (!clipboard || !graph || !activeChapter) return
    const newNode: QuestNodeData = {
      id: generateFtbHexId(),
      node_type: (clipboard.data?.nodeType as string) || 'quest',
      label: `${(clipboard.data?.label as string) || 'Quest'} (copy)`,
      description: (clipboard.data?.description as string) || '',
      position: { x: clipboard.position.x + 2, y: clipboard.position.y + 2 },
      data: {},
      objectives: ((clipboard.data?.objectives as QuestObjectiveData[]) || []).map(o => ({ ...o, id: crypto.randomUUID() })),
      rewards: ((clipboard.data?.rewards as QuestRewardData[]) || []).map(r => ({ ...r, id: crypto.randomUUID() })),
      required_items: ((clipboard.data?.required_items as string[]) || []),
      chapter_id: activeChapter, icon: (clipboard.data?.icon as string) || '',
      size: (clipboard.data?.size as QuestSize) || { width: 24, height: 24 },
      color: (clipboard.data?.color as string) || '',
      visibility: (clipboard.data?.visibility as string) || 'Normal',
      optional: (clipboard.data?.optional as boolean) || false,
      silently_complete: (clipboard.data?.silently_complete as boolean) || false,
      can_be_repeatable: (clipboard.data?.can_be_repeatable as boolean) || false,
      repeat_min_delay: 0, repeat_max_delay: 0, repeat_time: 0,
      hide_quest_until_deps_complete: false, hide_quest_until_quest_complete: false,
      hide_quest_until_all_complete: false, disable_reward: false, pause_reward: false, lock_icon: '',
      subtitle: (clipboard.data?.subtitle as string) || '',
      quest_background: (clipboard.data?.quest_background as string) || '',
      shape: (clipboard.data?.shape as string) || 'Default',
      icon_scaling: (clipboard.data?.icon_scaling as number) || 1.0,
      tags: ((clipboard.data?.tags as string[]) || []),
      progression_mode: 'Default', sequential_tasks: false,
      disable_completion_toast: false, ignore_reward_blocking: false, disable_jei_recipe: false,
      min_window_width: 0, hide_details_until_startable: false, hide_text_until_completed: false,
      invisible_until_completed: false, invisible_until_x_tasks: 0,
      hide_dependency_lines: false, hide_dependent_lines: false,
      min_required_dependencies: 0, dependency_requirement: 'AllCompleted',
    }
    const updatedGraph: QuestGraphData = { ...graph, nodes: [...graph.nodes, newNode] }
    saveQuestGraph(projectId, updatedGraph).then(() => {
      setGraph(updatedGraph)
      setNodes(toRfNodesCb(updatedGraph, textureIndex))
      setEdges(toRfEdges(updatedGraph))
    }).catch((e) => console.error('Failed to paste quest:', e))
    closeContextMenu()
  }, [clipboard, graph, activeChapter, projectId, setNodes, setEdges, toRfNodesCb, textureIndex, closeContextMenu, saveQuestGraph, setGraph])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') return
      if (e.key === 'Escape') { deselectNode(); closeContextMenu() }
      else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedNodeId) {
        e.preventDefault(); deleteSelectedNode()
      } else if (e.key === 'c' && (e.ctrlKey || e.metaKey) && selectedNode) {
        e.preventDefault(); setClipboard(selectedNode)
      } else if (e.key === 'v' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault(); pasteNode()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [selectedNodeId, selectedNode, deselectNode, closeContextMenu, deleteSelectedNode, setClipboard, pasteNode])

  return {
    contextMenu, setContextMenu, clipboard, setClipboard,
    closeContextMenu, createQuestAtCursor, deleteNodeById,
    deleteSelectedNode, pasteNode, viewportPos, setViewportPos,
  }
}
