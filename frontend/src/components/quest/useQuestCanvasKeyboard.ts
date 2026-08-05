import { useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from 'react'
import type { QuestNodeData, QuestEdgeData } from '../../services/quest-types'
import { generateFtbHexId } from './quest-helpers'
import { alignPositions, distributePositions, type AlignMode, type DistributeMode } from '../../core/quest/align'

interface UseQuestCanvasKeyboardArgs {
  questNodes: QuestNodeData[]
  questEdges: QuestEdgeData[]
  filteredNodeIds: Set<string>
  selectedIds: Set<string>
  setSelectedIds: Dispatch<SetStateAction<Set<string>>>
  setSelectedEdgeId: Dispatch<SetStateAction<string | null>>
  onUpdateNodes: (updates: Array<{ nodeId: string; data: Partial<QuestNodeData> }>) => void
  onDeleteNodes?: (nodeIds: string[]) => void
  onPasteNodes?: (nodes: QuestNodeData[], edges: QuestEdgeData[]) => void
  editLocked: boolean
  selectedEdgeId: string | null
  onDeleteEdge: (edgeId: string) => void
  setShowShortcuts: Dispatch<SetStateAction<boolean>>
}

export function useQuestCanvasKeyboard(args: UseQuestCanvasKeyboardArgs) {
  const {
    questNodes, questEdges, filteredNodeIds, selectedIds, setSelectedIds,
    setSelectedEdgeId, onUpdateNodes, onDeleteNodes, onPasteNodes, editLocked,
    selectedEdgeId, onDeleteEdge, setShowShortcuts,
  } = args

  const clipboardRef = useRef<{ nodes: QuestNodeData[]; edges: QuestEdgeData[] } | null>(null)

  const copySelected = useCallback(() => {
    if (selectedIds.size === 0) return
    const copiedNodes = questNodes.filter(n => selectedIds.has(n.id))
    if (copiedNodes.length === 0) return
    const ids = new Set(copiedNodes.map(n => n.id))
    const copiedEdges = questEdges.filter(e => ids.has(e.source) && ids.has(e.target))
    clipboardRef.current = {
      nodes: copiedNodes.map(n => ({ ...n })),
      edges: copiedEdges.map(e => ({ ...e })),
    }
  }, [selectedIds, questNodes, questEdges])

  const pasteClipboard = useCallback(() => {
    if (!clipboardRef.current || clipboardRef.current.nodes.length === 0) return
    if (editLocked) return
    const oldToNew = new Map<string, string>()
    const newNodes: QuestNodeData[] = clipboardRef.current.nodes.map(n => {
      const newId = generateFtbHexId()
      oldToNew.set(n.id, newId)
      return { ...n, id: newId, position: { x: n.position.x + 3, y: n.position.y + 3 } }
    })
    const newEdges: QuestEdgeData[] = clipboardRef.current.edges
      .filter(e => oldToNew.has(e.source) && oldToNew.has(e.target))
      .map(e => ({
        ...e,
        id: generateFtbHexId(),
        source: oldToNew.get(e.source)!,
        target: oldToNew.get(e.target)!,
      }))
    onPasteNodes?.(newNodes, newEdges)
    setSelectedIds(new Set(newNodes.map(n => n.id)))
  }, [onPasteNodes, editLocked, setSelectedIds])

  const selectAllNodes = useCallback(() => {
    setSelectedIds(new Set(filteredNodeIds))
  }, [filteredNodeIds, setSelectedIds])

  const nudgeSelected = useCallback((dx: number, dy: number) => {
    if (selectedIds.size === 0) return
    const updates: Array<{ nodeId: string; data: Partial<QuestNodeData> }> = []
    for (const n of questNodes) {
      if (!selectedIds.has(n.id)) continue
      updates.push({
        nodeId: n.id,
        data: { position: { x: n.position.x + dx, y: n.position.y + dy } },
      })
    }
    onUpdateNodes(updates)
  }, [selectedIds, questNodes, onUpdateNodes])

  // Align the selected quests' grid-center coordinates along an axis.
  const alignSelected = useCallback((mode: AlignMode) => {
    if (selectedIds.size < 2) return
    const selected = questNodes.filter((n: QuestNodeData) => selectedIds.has(n.id))
    const positions = alignPositions(
      selected.map((n) => ({ id: n.id, position: n.position })),
      mode
    )
    onUpdateNodes(selected.map((n) => ({ nodeId: n.id, data: { position: positions[n.id] } })))
  }, [selectedIds, questNodes, onUpdateNodes])

  // Spread the selected quests evenly along an axis between the extremes.
  const distributeSelected = useCallback((mode: DistributeMode) => {
    if (selectedIds.size < 3) return
    const selected = questNodes.filter((n: QuestNodeData) => selectedIds.has(n.id))
    const positions = distributePositions(
      selected.map((n) => ({ id: n.id, position: n.position })),
      mode
    )
    onUpdateNodes(selected.map((n) => ({ nodeId: n.id, data: { position: positions[n.id] } })))
  }, [selectedIds, questNodes, onUpdateNodes])

  // Delete a selected dependency arrow with the keyboard.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedEdgeId && !editLocked) {
        const el = document.activeElement as HTMLElement | null
        if (el && ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)) return
        e.preventDefault()
        onDeleteEdge(selectedEdgeId)
        setSelectedEdgeId(null)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [selectedEdgeId, onDeleteEdge, editLocked, setSelectedEdgeId])

  // '?' toggles the shortcuts overlay.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const el = document.activeElement as HTMLElement | null
      if (el && ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)) return
      if (e.key === '?') {
        e.preventDefault()
        setShowShortcuts(v => !v)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [setShowShortcuts])

  // Canvas-wide selection/clipboard/nudge hotkeys.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const el = document.activeElement as HTMLElement | null
      if (el && ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)) return
      const mod = e.ctrlKey || e.metaKey
      if (mod && e.key.toLowerCase() === 'a') {
        e.preventDefault()
        selectAllNodes()
        return
      }
      if (mod && e.key.toLowerCase() === 'c') {
        e.preventDefault()
        copySelected()
        return
      }
      if (mod && e.key.toLowerCase() === 'v') {
        e.preventDefault()
        pasteClipboard()
        return
      }
      if (mod && e.key.toLowerCase() === 'x') {
        e.preventDefault()
        if (editLocked) return
        copySelected()
        if (selectedIds.size === 0) return
        onDeleteNodes?.(Array.from(selectedIds))
        setSelectedIds(new Set())
        return
      }
      if (mod && e.key.toLowerCase() === 'd') {
        e.preventDefault()
        if (editLocked) return
        copySelected()
        pasteClipboard()
        return
      }
      if (selectedIds.size === 0 || editLocked) return
      const nudge = e.shiftKey ? 0.5 : 1.0
      if (e.key === 'ArrowUp') { e.preventDefault(); nudgeSelected(0, -nudge) }
      else if (e.key === 'ArrowDown') { e.preventDefault(); nudgeSelected(0, nudge) }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); nudgeSelected(-nudge, 0) }
      else if (e.key === 'ArrowRight') { e.preventDefault(); nudgeSelected(nudge, 0) }
      else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault()
        onDeleteNodes?.(Array.from(selectedIds))
        setSelectedIds(new Set())
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [selectedIds, selectAllNodes, copySelected, pasteClipboard, nudgeSelected, onDeleteNodes, editLocked, setSelectedIds])

  return {
    clipboardRef, copySelected, pasteClipboard, alignSelected, distributeSelected,
  }
}
