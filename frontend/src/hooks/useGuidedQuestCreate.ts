// useGuidedQuestCreate — the P0-MINIWIZ "Add a quest" commit path. Builds the
// full node (title + task + reward) and commits ONCE through the same history
// path as every other edit, so the wizard is undoable in a single step. The
// reward is the collect-N-get-N loop the template pack teaches; deleting it is
// one click. Spawns at the visible pane center (via the canvas viewport API)
// so the quest lands where the user is looking — the old hardcoded (80,80)
// sat off-screen from template packs whose quests live near the origin
// (s49-followup).
import { useCallback } from 'react'
import type { QuestGraphData } from '../services/quest-types'
import type { ToolbarAPI } from '../components/quest/import-export'
import type { GuidedQuestSpec } from '../components/quest/GuidedQuestWizard'
import { defaultQuestNodeData, defaultObjective, defaultReward } from '../components/quest/quest-helpers'
import { snapToGridStep } from '../components/quest/quest-form-constants'

interface UseGuidedQuestCreateArgs {
  graph: QuestGraphData | null
  activeChapter: string | null
  commitGraph: (next: QuestGraphData, opts?: { split?: boolean }) => void
  setSelectedNodeId: (id: string | null) => void
  scheduleAutoSave: () => void
  toolbarApiRef: React.MutableRefObject<ToolbarAPI | null>
}

export function useGuidedQuestCreate(args: UseGuidedQuestCreateArgs): (spec: GuidedQuestSpec) => void {
  const { graph, activeChapter, commitGraph, setSelectedNodeId, scheduleAutoSave, toolbarApiRef } = args

  return useCallback((spec: GuidedQuestSpec) => {
    if (!graph || !activeChapter) return
    const gs = graph.grid_scale || 0.5
    const spawn = toolbarApiRef.current?.getSpawnGridPos?.() ?? { x: 80, y: 80 }
    const node = defaultQuestNodeData({
      chapter_id: activeChapter,
      label: spec.title || 'New Quest',
      // Snap the viewport-center spawn to the drag grain so wizard quests sit
      // on the grid like every other placement (s49-followup).
      position: { x: snapToGridStep(spawn.x, gs, 1), y: snapToGridStep(spawn.y, gs, 1) },
    })
    const objective = {
      ...defaultObjective(),
      objective_type: spec.objectiveType,
      target: spec.target,
      target_count: spec.count,
    }
    const newNode = {
      ...node,
      objectives: [objective],
      rewards: spec.includeReward
        ? [{ ...defaultReward(), reward_type: 'item', item_id: spec.rewardItem, item_count: spec.rewardCount }]
        : [],
    }
    commitGraph({ ...graph, nodes: [...graph.nodes, newNode] }, { split: true })
    setSelectedNodeId(newNode.id)
    scheduleAutoSave()
    // Deferred a frame so React has committed the node before the fit runs —
    // fitView over an unrendered id would no-op.
    requestAnimationFrame(() => toolbarApiRef.current?.focusNode?.(newNode.id))
  }, [graph, activeChapter, commitGraph, setSelectedNodeId, scheduleAutoSave, toolbarApiRef])
}
