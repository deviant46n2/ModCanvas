import { useCallback, useMemo, useRef, useState, type Dispatch, type SetStateAction, type MouseEvent as ReactMouseEvent } from 'react'
import type { Node } from '@xyflow/react'
import type { QuestNodeData } from '../../services/quest-types'
import type { QuestCtxMenuState } from './QuestContextMenu'
import { GRID_SCALE, NODE_BASE_PX } from './quest-canvas-model'

interface UseQuestCanvasContextMenuArgs {
  selectedIds: Set<string>
  setSelectedIds: Dispatch<SetStateAction<Set<string>>>
  setSelectedNodeId: (id: string | null) => void
  screenToFlowPosition: (pos: { x: number; y: number }) => { x: number; y: number }
  editLocked: boolean
  questNodes: QuestNodeData[]
  onDeleteNodes?: (nodeIds: string[]) => void
  onSetQuestProgress?: (questId: string, status: 'started' | 'complete' | null) => void
  activeChapter: string | null
  onAddNode: (chapterId: string, position?: { x: number; y: number }) => void
  onAddLink?: (chapterId: string, position?: { x: number; y: number }) => void
  onAddQuestWithTask?: (chapterId: string, objectiveType: string, position?: { x: number; y: number }) => void
  copySelected: () => void
  pasteClipboard: () => void
}

export function useQuestCanvasContextMenu(args: UseQuestCanvasContextMenuArgs) {
  const {
    selectedIds, setSelectedIds, setSelectedNodeId, screenToFlowPosition,
    editLocked, questNodes, onDeleteNodes, onSetQuestProgress, activeChapter,
    onAddNode, onAddLink, onAddQuestWithTask, copySelected, pasteClipboard,
  } = args

  const [ctxMenu, setCtxMenu] = useState<QuestCtxMenuState | null>(null)
  const cursorRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 })

  // --- Right-click context menus (node + empty pane) ----------------------

  const handleNodeContextMenu = useCallback(
    (e: ReactMouseEvent, node: Node) => {
      e.preventDefault()
      // Right-click makes the node the operand unless it's part of the current
      // multi-selection already (so bulk actions still apply to that set).
      if (!selectedIds.has(node.id)) {
        setSelectedIds(new Set([node.id]))
        setSelectedNodeId(node.id)
      }
      cursorRef.current = screenToFlowPosition({ x: e.clientX, y: e.clientY })
      setCtxMenu({ x: e.clientX, y: e.clientY, mode: 'node', nodeId: node.id })
    },
    [selectedIds, setSelectedNodeId, screenToFlowPosition, setSelectedIds]
  )

  const handlePaneContextMenu = useCallback(
    (e: ReactMouseEvent | MouseEvent) => {
      e.preventDefault()
      cursorRef.current = screenToFlowPosition({ x: e.clientX, y: e.clientY })
      setCtxMenu({ x: e.clientX, y: e.clientY, mode: 'pane' })
    },
    [screenToFlowPosition]
  )

  const closeCtxMenu = useCallback(() => setCtxMenu(null), [])

  // Convert the right-click cursor (stored in flow coords) into an FTB grid
  // center position for the newly created node (nodes are center-anchored and
  // render pixelPos = node pixel size, default 36px).
  const gridPosFromCursor = useCallback(() => {
    const c = cursorRef.current
    return {
      x: (c.x + NODE_BASE_PX / 2) / GRID_SCALE,
      y: (c.y + NODE_BASE_PX / 2) / GRID_SCALE,
    }
  }, [])

  const handleCtxEdit = useCallback(
    (nodeId: string) => {
      setSelectedNodeId(nodeId)
    },
    [setSelectedNodeId]
  )

  const handleCtxDuplicate = useCallback(() => {
    if (editLocked) return
    copySelected()
    pasteClipboard()
  }, [copySelected, pasteClipboard, editLocked])

  const handleCtxCopyId = useCallback(() => {
    if (selectedIds.size === 0) return
    const target = questNodes.find((n: QuestNodeData) => selectedIds.has(n.id))
    if (!target) return
    navigator.clipboard?.writeText(target.id).catch(() => {})
  }, [selectedIds, questNodes])

  const handleCtxDelete = useCallback(() => {
    if (editLocked) return
    const ids = selectedIds.size > 0 ? Array.from(selectedIds) : (ctxMenu?.nodeId ? [ctxMenu.nodeId] : [])
    if (ids.length === 0) return
    onDeleteNodes?.(ids)
    setSelectedIds(new Set())
  }, [selectedIds, ctxMenu?.nodeId, onDeleteNodes, editLocked, setSelectedIds])

  const applySimToSelection = useCallback(
    (status: 'started' | 'complete' | null) => {
      const ids = selectedIds.size > 0 ? Array.from(selectedIds) : (ctxMenu?.nodeId ? [ctxMenu.nodeId] : [])
      for (const id of ids) onSetQuestProgress?.(id, status)
    },
    [selectedIds, ctxMenu?.nodeId, onSetQuestProgress]
  )

  const handleCtxAddQuest = useCallback(() => {
    if (!activeChapter || editLocked) return
    onAddNode(activeChapter, gridPosFromCursor())
  }, [activeChapter, onAddNode, gridPosFromCursor, editLocked])

  const handleCtxAddLink = useCallback(() => {
    if (!activeChapter || editLocked) return
    onAddLink?.(activeChapter, gridPosFromCursor())
  }, [activeChapter, onAddLink, gridPosFromCursor, editLocked])

  const handleCtxAddQuestWithTask = useCallback(
    (objectiveType: string) => {
      if (!activeChapter || editLocked) return
      onAddQuestWithTask?.(activeChapter, objectiveType, gridPosFromCursor())
    },
    [activeChapter, onAddQuestWithTask, gridPosFromCursor, editLocked]
  )

  // Clamp the menu so it never opens off the right/bottom viewport edge.
  const viewportMenuPos = useMemo(() => {
    if (!ctxMenu) return null
    const mw = 200
    const mh = Math.min(window.innerHeight - 16, 70 * window.innerHeight / 100)
    const x = Math.min(ctxMenu.x, window.innerWidth - mw - 6)
    const y = Math.max(4, Math.min(ctxMenu.y, window.innerHeight - mh - 6))
    return { ...ctxMenu, x, y }
  }, [ctxMenu])

  return {
    ctxMenu, handleNodeContextMenu, handlePaneContextMenu, closeCtxMenu,
    gridPosFromCursor, handleCtxEdit, handleCtxDuplicate, handleCtxCopyId,
    handleCtxDelete, applySimToSelection, handleCtxAddQuest, handleCtxAddLink,
    handleCtxAddQuestWithTask, viewportMenuPos,
  }
}
