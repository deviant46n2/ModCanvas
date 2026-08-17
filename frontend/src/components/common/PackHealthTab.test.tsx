import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { invoke } from '@tauri-apps/api/core'
import { PackHealthProvider } from './PackHealthProvider'
import { PackHealthTab } from './PackHealthTab'
import type { HealthItem } from '../../core/pack-health/types'
import { usePackHealthStore } from '../../core/pack-health/pack-health-store'
import { useRecipeStore } from '../../core/recipe/recipe-store'
import { useBehaviorStore } from '../../core/behavior/behavior-store'
import { makeGraph, makeNode, makeObjective, makeChapter, makeReward } from '../../core/pack-health/test-fixtures'
import { MIN_TRUSTED_REGISTRY_ITEMS } from '../../core/pack-health'

const project = { id: 'p1', name: 'Pack', description: 'Desc', author: 'Me', pack_version: '1.0.0' }

// The provider fetches the Pack Index on mount (P1-HEALTH-2 availability).
// Stub the command with an empty index — no availability findings, the
// existing tests are unaffected.
beforeEach(() => {
  vi.mocked(invoke).mockImplementation((cmd: string) => {
    if (cmd === 'get_pack_index') {
      return Promise.resolve({ items: [], tags: [], references: [], dead_references: [], recipe_ids: [], recipe_outputs: [], quest_ids: [] })
    }
    return Promise.resolve(undefined)
  })
})

function renderHealth(packLoaded = true, onJumpToFinding?: (item: HealthItem) => void, installedMods: string[] | null = null) {
  return render(
    <PackHealthProvider project={project} packLoaded={packLoaded} installedMods={installedMods}>
      <PackHealthTab onJumpToFinding={onJumpToFinding} />
    </PackHealthProvider>,
  )
}

function bigRegistry(missing: string[] = []): Array<{ id: string; name: string; mod_id: string; texture_data_url: null }> {
  const missingSet = new Set(missing)
  const registry: Array<{ id: string; name: string; mod_id: string; texture_data_url: null }> = []
  for (let i = 0; i < Math.max(MIN_TRUSTED_REGISTRY_ITEMS, 500); i++) {
    const id = `minecraft:item_${i}`
    if (missingSet.has(id)) continue
    registry.push({ id, name: `Item ${i}`, mod_id: 'minecraft', texture_data_url: null })
  }
  return registry
}

describe('PackHealthTab', () => {
  beforeEach(() => {
    usePackHealthStore.setState({ questGraph: null, itemRegistry: null, hasCoverImage: true })
    useRecipeStore.setState({ recipes: [], selectedRecipeId: null })
    useBehaviorStore.setState({ behaviors: [], loaded: false })
  })

  it('shows GO when the pack is healthy', () => {
    renderHealth()
    expect(screen.getByText('Ready to test')).toBeInTheDocument()
    // Quests + Recipes + Behaviors + Mods + Pack all clear.
    expect(screen.getAllByText('All clear')).toHaveLength(5)
  })

  it('shows GO with a registry diagnostic instead of a flood on a degraded registry', () => {
    usePackHealthStore.setState({
      questGraph: makeGraph({
        chapters: [makeChapter({ id: 'ch', title: 'Start' })],
        nodes: [
          makeNode({
            id: 'q1',
            label: 'Get Bedrock',
            objectives: [makeObjective({ id: 'o1', target: 'minecraft:bedrock' })],
          }),
        ],
      }),
      itemRegistry: [{ id: 'minecraft:dirt', name: 'Dirt', mod_id: 'minecraft', texture_data_url: null }],
    })
    renderHealth()
    expect(screen.getByText('Ready to test')).toBeInTheDocument()
    expect(screen.getByText(/item registry is incomplete/i)).toBeInTheDocument()
    expect(screen.queryByText(/Get Bedrock/)).toBeNull()
  })

  it('surfaces recommended item findings with copy buttons on a trusted registry', () => {
    usePackHealthStore.setState({
      questGraph: makeGraph({
        chapters: [makeChapter({ id: 'ch', title: 'Start' })],
        nodes: [
          makeNode({
            id: 'q1',
            chapter_id: 'ch',
            label: 'Get Ghost',
            objectives: [makeObjective({ id: 'o1', target: 'minecraft:ghost' })],
          }),
        ],
      }),
      itemRegistry: bigRegistry(),
    })
    renderHealth()
    expect(screen.getByText('Ready to test')).toBeInTheDocument()
    expect(screen.getByText(/Get Ghost/)).toBeInTheDocument()
    const copyButtons = screen.getAllByRole('button', { name: /copy recommended text/i })
    expect(copyButtons.length).toBeGreaterThan(0)
    fireEvent.click(copyButtons[0])
    expect(screen.getByRole('button', { name: /copy recommended text/i })).toBeInTheDocument()
  })

  it('recommends a cover image without blocking', () => {
    usePackHealthStore.setState({ hasCoverImage: false })
    renderHealth()
    expect(screen.getByText('Ready to test')).toBeInTheDocument()
    expect(screen.getAllByText(/cover image/i).length).toBeGreaterThan(0)
  })

  it('offers a jump button on quest findings with a nodeId and forwards the finding', () => {
    // A quest referencing an undefined reward table fires a blocking finding
    // carrying target.nodeId (checks/quests/structure.ts:44-51) — no graph
    // edges needed, so the fixture stays small.
    usePackHealthStore.setState({
      questGraph: makeGraph({
        chapters: [makeChapter({ id: 'ch', title: 'Start' })],
        nodes: [
          makeNode({
            id: 'q1',
            chapter_id: 'ch',
            label: 'Ghost Table Quest',
            rewards: [makeReward({ table_id: 'ghost_table' })],
          }),
        ],
      }),
      itemRegistry: bigRegistry(),
    })
    const onJumpToFinding = vi.fn()
    renderHealth(true, onJumpToFinding)
    // Both findings (undefined reward table + missing item) carry nodeId q1 —
    // each renders its own jump button; clicking either forwards the quest.
    const jumps = screen.getAllByTitle('Go to the quest')
    expect(jumps.length).toBeGreaterThan(0)
    fireEvent.click(jumps[0])
    expect(onJumpToFinding).toHaveBeenCalledTimes(1)
    const received = onJumpToFinding.mock.calls[0][0] as HealthItem
    expect(received.target?.section).toBe('quests')
    expect(received.target?.nodeId).toBe('q1')
  })

  it('renders no jump button when the finding has no nodeId', () => {
    usePackHealthStore.setState({ hasCoverImage: false }) // pack findings have no nodeId
    renderHealth(true, vi.fn())
    expect(screen.queryByTitle('Go to the quest')).toBeNull()
  })
})
