// AddQuestOverlay — the "+ Add Quest" / "Add Link" buttons floating over the
// canvas (s49). Owns an add-count ticker (default 1, max 10) so a user can
// spawn several quests at once; new quests appear at the click position,
// cascaded along the grid so they never stack. Lives inside <ReactFlow> so it
// can use useReactFlow's screenToFlowPosition (same mapping as the context
// menu's gridPosFromCursor).

import { useState } from 'react'
import { useReactFlow } from '@xyflow/react'
import { flowToGridPos } from './quest-canvas-model'

interface AddQuestOverlayProps {
  activeChapter: string | null
  editLocked: boolean
  connectMode: boolean
  onToggleConnect: () => void
  decorEditMode: boolean
  onAddNode: (chapterId: string, position?: { x: number; y: number }, count?: number) => void
  onAddLink?: (chapterId: string, position?: { x: number; y: number }) => void
}

const MAX_ADD_COUNT = 10

export function AddQuestOverlay({
  activeChapter,
  editLocked,
  connectMode,
  onToggleConnect,
  decorEditMode,
  onAddNode,
  onAddLink,
}: AddQuestOverlayProps) {
  const { screenToFlowPosition } = useReactFlow()
  const [count, setCount] = useState(1)

  // The overlay stays visible in connect mode so the toggle can turn it off —
  // hiding here would make the mode switch unreachable (s49-followup).
  if (!activeChapter || decorEditMode || editLocked) return null

  // Same flow-position mapping as the context menu: the node's center lands
  // on the cursor, so clicking "where I want it" spawns it there — never at
  // the off-screen (0,0) corner the old fallback produced (s49).
  function clickFlowPos(e: React.MouseEvent<HTMLDivElement>) {
    const p = screenToFlowPosition({ x: e.clientX, y: e.clientY })
    return flowToGridPos(p)
  }

  function bump(delta: number) {
    setCount((c) => Math.min(MAX_ADD_COUNT, Math.max(1, c + delta)))
  }

  return (
    <div className="canvas-overlay">
      <div className="chapter-add-row">
        <div className="chapter-add-button" onClick={(e) => onAddNode(activeChapter, clickFlowPos(e), count)}>
          + Add Quest
        </div>
        <div className="chapter-add-ticker">
          <button
            className="chapter-add-ticker-btn"
            onClick={() => bump(-1)}
            disabled={count <= 1}
            aria-label="Fewer quests"
          >
            −
          </button>
          <span className="chapter-add-ticker-value" title="How many quests to add">
            {count}
          </span>
          <button
            className="chapter-add-ticker-btn"
            onClick={() => bump(1)}
            disabled={count >= MAX_ADD_COUNT}
            aria-label="More quests"
          >
            +
          </button>
        </div>
      </div>
      <div className="chapter-add-button chapter-add-link-button" onClick={(e) => onAddLink?.(activeChapter, clickFlowPos(e))} title="Add a quest link that references another quest (cross-chapter)">
        Add Link
      </div>
      <div
        className={`chapter-add-button${connectMode ? ' chapter-add-button-active' : ''}`}
        onClick={onToggleConnect}
        title="Toggle dependency editing: drag between quest connection ports"
      >
        Connect
      </div>
    </div>
  )
}
