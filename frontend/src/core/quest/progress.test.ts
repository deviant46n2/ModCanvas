import { describe, it, expect } from 'vitest'
import { computeVisibility, isLocked } from './progress'
import type { QuestEdgeData, QuestNodeData } from '../../services/quest-types'

const edge = (id: string, source: string, target: string): QuestEdgeData => ({
  id, source, target, label: null, edge_type: 'prerequisite', inverted: false,
})

const quest = (overrides: Partial<QuestNodeData>): QuestNodeData => ({
  id: 'q',
  node_type: 'quest',
  label: 'Q',
  description: '',
  position: { x: 0, y: 0 },
  data: {},
  objectives: [],
  rewards: [],
  required_items: [],
  chapter_id: null,
  icon: '',
  size: { width: 24, height: 24 },
  color: '',
  visibility: 'normal',
  optional: false,
  silently_complete: false,
  can_be_repeatable: false,
  repeat_min_delay: 0,
  repeat_max_delay: 0,
  repeat_time: 0,
  hide_quest_until_deps_complete: false,
  hide_quest_until_quest_complete: false,
  hide_quest_until_all_complete: false,
  disable_reward: false,
  pause_reward: false,
  lock_icon: '',
  subtitle: '',
  quest_background: '',
  shape: '',
  icon_scaling: 1.0,
  tags: [],
  progression_mode: 'default',
  sequential_tasks: false,
  disable_completion_toast: false,
  ignore_reward_blocking: false,
  disable_jei_recipe: false,
  min_window_width: 0,
  hide_details_until_startable: false,
  hide_text_until_completed: false,
  invisible_until_completed: false,
  invisible_until_x_tasks: 0,
  hide_dependency_lines: false,
  hide_dependent_lines: false,
  min_required_dependencies: 0,
  dependency_requirement: 'all_completed',
  ...overrides,
})

describe('progress simulation', () => {
  it('quest with no deps is not locked', () => {
    expect(isLocked('q', [], {})).toBe(false)
  })

  it('quest is locked until all deps complete (default ALL)', () => {
    const edges = [edge('e1', 'a', 'q'), edge('e2', 'b', 'q')]
    expect(isLocked('q', edges, {})).toBe(true)
    expect(isLocked('q', edges, { a: 'complete' })).toBe(true)
    expect(isLocked('q', edges, { a: 'complete', b: 'complete' })).toBe(false)
  })

  it('never-visible quests are hidden', () => {
    expect(computeVisibility('q', { q: quest({ visibility: 'never_visible' }) }, [], {}).visible).toBe(false)
  })

  it('hide_until_deps_complete only reveals when deps complete', () => {
    const q = quest({ hide_quest_until_deps_complete: true })
    const edges = [edge('e1', 'a', 'q')]
    const quests = { q }
    expect(computeVisibility('q', quests, edges, {}).visible).toBe(false)
    expect(computeVisibility('q', quests, edges, { a: 'complete' }).visible).toBe(true)
  })

  it('hide_until_all_complete hides until all deps complete', () => {
    const q = quest({ hide_quest_until_all_complete: true })
    const edges = [edge('e1', 'a', 'q'), edge('e2', 'b', 'q')]
    const quests = { q }
    expect(computeVisibility('q', quests, edges, { a: 'complete' }).visible).toBe(false)
    expect(computeVisibility('q', quests, edges, { a: 'complete', b: 'complete' }).visible).toBe(true)
  })

  it('invisible until completed hides unfinished quests', () => {
    const q = quest({ invisible_until_completed: true })
    const quests = { q }
    expect(computeVisibility('q', quests, [], {}).visible).toBe(false)
    expect(computeVisibility('q', quests, [], { q: 'complete' }).visible).toBe(true)
  })
})
