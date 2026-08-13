// useQuestViewportApi — hands QuestCanvas's ReactFlow abilities to the
// ToolbarAPI so surfaces OUTSIDE <ReactFlow> (the guided-quest wizard in
// QuestBookEditor) can spawn quests where the user is looking and reveal
// them. Before this (s49-followup): the wizard hardcoded grid (80,80) —
// off-screen from template packs whose quests sit near the origin.
import { useEffect } from 'react'
import type { ToolbarAPI } from './import-export'
import { flowToGridPos } from './quest-canvas-model'

interface UseQuestViewportApiArgs {
  toolbarApiRef: React.MutableRefObject<ToolbarAPI | null>
  /** The element wrapping <ReactFlow>; its rect defines the visible pane. */
  paneRef: React.RefObject<HTMLDivElement | null>
  screenToFlowPosition: (pos: { x: number; y: number }) => { x: number; y: number }
  fitView: (options?: { duration?: number; padding?: number; maxZoom?: number; nodes?: Array<{ id: string }> }) => void
}

export function useQuestViewportApi({
  toolbarApiRef,
  paneRef,
  screenToFlowPosition,
  fitView,
}: UseQuestViewportApiArgs) {
  useEffect(() => {
    const getSpawnGridPos = (): { x: number; y: number } | null => {
      const rect = paneRef.current?.getBoundingClientRect()
      if (!rect || rect.width === 0 || rect.height === 0) return null
      const center = {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      }
      return flowToGridPos(screenToFlowPosition(center))
    }
    const focusNode = (nodeId: string) => {
      // Same focus shape as the search-focus in QuestCanvas, so the reveal
      // of a just-created quest feels familiar.
      fitView({ nodes: [{ id: nodeId }], duration: 400, maxZoom: 2.5, padding: 0.3 })
    }
    // Merge onto the api the toolbar populated — never replace it.
    toolbarApiRef.current = { ...toolbarApiRef.current, getSpawnGridPos, focusNode }
  }, [toolbarApiRef, paneRef, screenToFlowPosition, fitView])
}
