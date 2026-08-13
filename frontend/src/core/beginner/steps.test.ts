import { describe, it, expect } from 'vitest'
import { deriveCoachSteps, type CoachInput } from './steps'
import type { PackHealthReport } from '../pack-health/types'
import type { ConnectionSignals } from '../../services/connection-status'
import type { QuestGraphData } from '../../services/quest-types'

function report(overrides: Partial<PackHealthReport>): PackHealthReport {
  return {
    sections: [],
    blockingCount: 0,
    recommendedCount: 0,
    optionalCount: 0,
    go: true,
    stats: { indexedItems: 0, itemCoverage: null },
    ...overrides,
  } as PackHealthReport
}

const connected: ConnectionSignals = {
  serverUp: true,
  companionConnected: true,
  deployed: true,
  stale: false,
  instanceRunning: true,
}

const offline: ConnectionSignals = {
  serverUp: true,
  companionConnected: false,
  deployed: true,
  stale: false,
  instanceRunning: false,
}

const runningNoCompanion: ConnectionSignals = { ...offline, instanceRunning: true }

const emptyGraph = { id: 'g', chapters: [] } as unknown as QuestGraphData
const fullGraph = { id: 'g', chapters: [{ id: 'c1' }] } as unknown as QuestGraphData

function input(overrides: Partial<CoachInput>): CoachInput {
  return {
    report: report({}),
    connection: offline,
    questGraph: fullGraph,
    ...overrides,
  }
}

describe('deriveCoachSteps', () => {
  it('keeps the wedge order: guide, save, health, launch', () => {
    expect(deriveCoachSteps(input({})).map((s) => s.id)).toEqual(['guide', 'save', 'health', 'launch'])
  })

  describe('guide step', () => {
    it('is always actionable and jumps to Quests', () => {
      const guide = deriveCoachSteps(input({}))[0]
      expect(guide.state).toBe('do')
      expect(guide.jumpTab).toBe('quests')
    })

    it('points at the existing quest book when the graph has chapters', () => {
      const guide = deriveCoachSteps(input({ questGraph: fullGraph }))[0]
      expect(guide.copy).toMatch(/follow the quests inside/)
    })

    it('points at building the book when there are no chapters yet', () => {
      const guide = deriveCoachSteps(input({ questGraph: emptyGraph }))[0]
      expect(guide.copy).toMatch(/build your quest book/)
    })

    it('never claims the quests are done, whatever the graph state', () => {
      for (const graph of [null, emptyGraph, fullGraph]) {
        expect(deriveCoachSteps(input({ questGraph: graph }))[0].state).toBe('do')
      }
    })
  })

  describe('save step', () => {
    it('is always actionable and has no tab jump (the control is the top bar)', () => {
      const save = deriveCoachSteps(input({}))[1]
      expect(save.state).toBe('do')
      expect(save.jumpTab).toBeUndefined()
    })
  })

  describe('health step', () => {
    it('points at Health when the report has not computed yet', () => {
      const health = deriveCoachSteps(input({ report: null }))[2]
      expect(health.jumpTab).toBe('health')
      expect(health.state).toBe('do')
    })

    it('says nothing-to-report when nothing was checked (no graph, no scan, zero findings)', () => {
      const health = deriveCoachSteps(input({ questGraph: null }))[2]
      expect(health.state).toBe('do')
      expect(health.copy).toMatch(/Nothing to report yet/)
    })

    it('flags blocking findings as attention with the count', () => {
      const health = deriveCoachSteps(
        input({ report: report({ blockingCount: 2, go: false }) }),
      )[2]
      expect(health.state).toBe('attention')
      expect(health.count).toBe(2)
      expect(health.copy).toMatch(/2 problems/)
    })

    it('keeps the pack actionable for non-blocking findings', () => {
      const health = deriveCoachSteps(
        input({ report: report({ recommendedCount: 3 }) }),
      )[2]
      expect(health.state).toBe('do')
      expect(health.count).toBe(3)
      expect(health.copy).toMatch(/3 things/)
    })

    it('reports green only when something was actually checked', () => {
      const health = deriveCoachSteps(
        input({ report: report({ stats: { indexedItems: 42, itemCoverage: 1 } }) }),
      )[2]
      expect(health.state).toBe('good')
      expect(health.copy).toMatch(/ready to test/)
    })
  })

  describe('launch step', () => {
    it('is green when the companion is connected', () => {
      expect(deriveCoachSteps(input({ connection: connected }))[3].state).toBe('good')
    })

    it('flags attention when the instance runs but the companion never connected', () => {
      expect(deriveCoachSteps(input({ connection: runningNoCompanion }))[3].state).toBe('attention')
    })

    it('points at the top-bar launch when nothing is running', () => {
      const launch = deriveCoachSteps(input({ connection: offline }))[3]
      expect(launch.state).toBe('do')
      expect(launch.copy).toMatch(/Test in the top bar/)
    })
  })
})
