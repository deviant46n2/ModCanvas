// Beginner coach — the hint strip's step derivation (s53). Pure function:
// turns already-materialized state into the strip's steps. No UI, no IPC,
// no I/O — 100% testable in isolation (3-layer rule, core room).
//
// Honest-state rules (docs/beginner-mode.md): the strip claims a step's state
// only from signals the app actually has. Guide/Save are pointer steps — they
// instruct and NEVER claim completion (the app does not track in-game quest
// progress). Health/Launch states are derived from real signals: the Pack
// Health report and the connection pill. The strip never guesses.

import type { PackHealthReport } from '../pack-health/types'
import type { ConnectionSignals } from '../../services/connection-status'
import type { QuestGraphData } from '../../services/quest-types'

/** 'do' — actionable pointer; nothing claimed as done. 'good'/'attention' —
 * a real signal says the goal is met / needs the user's hand. */
export type CoachStepState = 'do' | 'good' | 'attention'

export type CoachStepId = 'guide' | 'save' | 'health' | 'launch'
export type CoachJumpTab = 'quests' | 'health'

export interface CoachStep {
  id: CoachStepId
  title: string
  copy: string
  state: CoachStepState
  /** Tab to switch to when the step's jump button is pressed. */
  jumpTab?: CoachJumpTab
  /** Findings count for the health step (blocking, or total when no blocking). */
  count?: number
}

export interface CoachInput {
  report: PackHealthReport | null
  connection: ConnectionSignals
  questGraph: QuestGraphData | null
}

/** The wedge journey, in order: guide → save → health → launch. */
export function deriveCoachSteps(input: CoachInput): CoachStep[] {
  return [
    guideStep(input.questGraph),
    saveStep(),
    healthStep(input.report, input.questGraph),
    launchStep(input.connection),
  ]
}

function guideStep(questGraph: QuestGraphData | null): CoachStep {
  const hasChapters = !!questGraph && questGraph.chapters.length > 0
  return {
    id: 'guide',
    title: 'Follow the guide',
    copy: hasChapters
      ? 'Your quest book has chapters waiting — open Quests and follow the quests inside.'
      : 'Open Quests and build your quest book — quests are how your pack tells its story.',
    state: 'do',
    jumpTab: 'quests',
  }
}

function saveStep(): CoachStep {
  return {
    id: 'save',
    title: 'Save your work',
    copy: 'Press Save in the top bar. Saving writes your quests into the pack — it is how your edits reach the game.',
    state: 'do',
  }
}

function healthStep(report: PackHealthReport | null, questGraph: QuestGraphData | null): CoachStep {
  const base = { id: 'health' as CoachStepId, title: 'Check Pack Health', jumpTab: 'health' as CoachJumpTab }

  if (!report) {
    return { ...base, copy: 'Open Pack Health — it tells you what needs fixing before you launch.', state: 'do' }
  }

  const total = report.blockingCount + report.recommendedCount + report.optionalCount
  // Nothing-checked discriminator: zero findings, nothing scanned, and the
  // quest graph never materialized — the report is empty because nothing was
  // analyzed, so claiming "all good" would be a lie.
  const nothingChecked = total === 0 && report.stats.indexedItems === 0 && !questGraph

  if (nothingChecked) {
    return {
      ...base,
      copy: 'Nothing to report yet — open Quests and add quests, then Health will check them.',
      state: 'do',
    }
  }
  if (report.blockingCount > 0) {
    return {
      ...base,
      title: 'Fix what Pack Health found',
      copy: `${report.blockingCount} problem${report.blockingCount === 1 ? '' : 's'} must be fixed before this pack is safe to launch.`,
      state: 'attention',
      count: report.blockingCount,
    }
  }
  if (total > 0) {
    return {
      ...base,
      title: 'Look at what Pack Health found',
      copy: `${total} thing${total === 1 ? '' : 's'} worth a look before you launch.`,
      state: 'do',
      count: total,
    }
  }
  return {
    ...base,
    title: 'Pack Health is green',
    copy: 'Nothing flagged — your pack is ready to test.',
    state: 'good',
  }
}

function launchStep(connection: ConnectionSignals): CoachStep {
  if (connection.companionConnected) {
    return {
      id: 'launch',
      title: 'Your pack is running',
      copy: 'The companion is connected — the game is running with your pack.',
      state: 'good',
    }
  }
  if (connection.instanceRunning) {
    return {
      id: 'launch',
      title: 'Companion did not connect',
      copy: 'The instance is up but the companion never connected — check the game log for a mod error.',
      state: 'attention',
    }
  }
  return {
    id: 'launch',
    title: 'Launch your pack',
    copy: 'Press Test in the top bar — it starts the game with the companion attached, so 3D item icons work.',
    state: 'do',
  }
}
