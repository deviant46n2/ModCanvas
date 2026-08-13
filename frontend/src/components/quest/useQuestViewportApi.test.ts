import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import type { ToolbarAPI } from './import-export'
import { useQuestViewportApi } from './useQuestViewportApi'

// The pane wrapper's rect, mocked as a laid-out element: left/top 38, 800x800
// → client center (438, 438). With an identity screenToFlowPosition that is
// flow (438, 438) → grid (10, 10) via flowToGridPos.
function stubPaneRect(rect: { left: number; top: number; width: number; height: number }) {
  const div = document.createElement('div')
  Object.defineProperty(div, 'getBoundingClientRect', {
    value: () => ({ ...rect, right: rect.left + rect.width, bottom: rect.top + rect.height, x: rect.left, y: rect.top, toJSON: () => ({}) }),
  })
  return div
}

function makeRefs(rect: { left: number; top: number; width: number; height: number }) {
  const toolbarApiRef = { current: null } as React.MutableRefObject<ToolbarAPI | null>
  const paneRef = { current: stubPaneRect(rect) } as React.RefObject<HTMLDivElement | null>
  return { toolbarApiRef, paneRef }
}

describe('useQuestViewportApi (s49-followup wizard spawn)', () => {
  let fitView: (options?: { duration?: number; padding?: number; maxZoom?: number; nodes?: Array<{ id: string }> }) => void

  beforeEach(() => {
    fitView = vi.fn()
  })

  it('fills the api with the visible pane center in grid coords', () => {
    const { toolbarApiRef, paneRef } = makeRefs({ left: 38, top: 38, width: 800, height: 800 })
    renderHook(() => useQuestViewportApi({
      toolbarApiRef,
      paneRef,
      screenToFlowPosition: (p) => p, // identity: client == flow
      fitView,
    }))
    expect(toolbarApiRef.current?.getSpawnGridPos?.()).toEqual({ x: 10, y: 10 })
  })

  it('returns null when the canvas is not laid out yet (fallback path)', () => {
    const { toolbarApiRef, paneRef } = makeRefs({ left: 0, top: 0, width: 0, height: 0 })
    renderHook(() => useQuestViewportApi({
      toolbarApiRef,
      paneRef,
      screenToFlowPosition: (p) => p,
      fitView,
    }))
    expect(toolbarApiRef.current?.getSpawnGridPos?.()).toBeNull()
  })

  it('focusNode fits the view to the node (search-focus shape)', () => {
    const { toolbarApiRef, paneRef } = makeRefs({ left: 0, top: 0, width: 800, height: 800 })
    renderHook(() => useQuestViewportApi({
      toolbarApiRef,
      paneRef,
      screenToFlowPosition: (p) => p,
      fitView,
    }))
    toolbarApiRef.current?.focusNode?.('quest-123')
    expect(fitView).toHaveBeenCalledWith({ nodes: [{ id: 'quest-123' }], duration: 400, maxZoom: 2.5, padding: 0.3 })
  })

  it('merges onto the toolbar-populated api, never replacing it', () => {
    const { toolbarApiRef, paneRef } = makeRefs({ left: 0, top: 0, width: 800, height: 800 })
    const scheduleAutoSave = vi.fn()
    toolbarApiRef.current = { scheduleAutoSave, openIconPicker: vi.fn() }
    renderHook(() => useQuestViewportApi({
      toolbarApiRef,
      paneRef,
      screenToFlowPosition: (p) => p,
      fitView,
    }))
    expect(toolbarApiRef.current?.scheduleAutoSave).toBe(scheduleAutoSave)
    expect(typeof toolbarApiRef.current?.getSpawnGridPos).toBe('function')
    expect(typeof toolbarApiRef.current?.focusNode).toBe('function')
  })
})
