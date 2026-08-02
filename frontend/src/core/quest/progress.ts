import type { QuestEdgeData, QuestNodeData } from '../../services/quest-types'

export type ProgressState = Record<string, 'started' | 'complete'>

export interface QuestVisibility {
  visible: boolean
  hiddenReason: string | null
}

// Mirrors FTB's Quest.isVisible chain:
// 1. The quest is `invisible`/`invisible_until_completed` -> never shown.
// 2. `hide_until_deps_complete`/`hide_until_all_complete` -> only visible once
//    all deps are complete.
// 3. `hide_until_quest_complete` -> only visible after the quest itself is done.
// 4. `hide_details_until_startable` -> shown but locked until startable.
// This function returns the *quest pin* visibility for the canvas; lock state
// is tracked separately by `isLocked`. The chapter-level default
// `hide_quest_until_deps_visible` (import.rs) applies to new quests only and is
// not evaluated here.
export function computeVisibility(
  questId: string,
  quests: Record<string, QuestNodeData | undefined>,
  edges: QuestEdgeData[],
  progress: ProgressState,
): QuestVisibility {
  const quest = quests[questId]
  if (!quest) return { visible: true, hiddenReason: null }
  if (quest.visibility === 'never_visible') {
    return { visible: false, hiddenReason: 'Invisible quest' }
  }
  if (quest.invisible_until_completed && progress[questId] !== 'complete') {
    return { visible: false, hiddenReason: 'Invisible until complete' }
  }
  const prereqs = edges.filter(e => e.target === questId).map(e => e.source)
  const depsComplete = prereqs.every(id => progress[id] === 'complete')

  if (quest.hide_quest_until_deps_complete && !depsComplete) {
    return { visible: false, hiddenReason: 'Hidden until dependencies complete' }
  }
  if (quest.hide_quest_until_all_complete && !depsComplete) {
    return { visible: false, hiddenReason: 'Hidden until all dependencies complete' }
  }
  if (quest.hide_quest_until_quest_complete) {
    // Shown only after this quest is complete (used for post-completion reveals).
    if (progress[questId] !== 'complete') {
      return { visible: false, hiddenReason: 'Hidden until quest complete' }
    }
  }
  return { visible: true, hiddenReason: null }
}

export function isLocked(questId: string, edges: QuestEdgeData[], progress: ProgressState): boolean {
  const prereqs = edges.filter(e => e.target === questId).map(e => e.source)
  if (prereqs.length === 0) return false
  return !prereqs.every(id => progress[id] === 'complete')
}
