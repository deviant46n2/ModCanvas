import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PackHealthProvider } from './PackHealthProvider'
import { PackHealthTab } from './PackHealthTab'
import { usePackHealthStore } from '../../core/pack-health/pack-health-store'
import { useRecipeStore } from '../../core/recipe/recipe-store'
import { useBehaviorStore } from '../../core/behavior/behavior-store'
import { makeGraph, makeNode, makeObjective, makeChapter } from '../../core/pack-health/test-fixtures'
import { MIN_TRUSTED_REGISTRY_ITEMS } from '../../core/pack-health'

const project = { name: 'Pack', description: 'Desc', author: 'Me', pack_version: '1.0.0' }

function renderHealth(packLoaded = true) {
  return render(
    <PackHealthProvider project={project} packLoaded={packLoaded}>
      <PackHealthTab />
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
    // Quests + Recipes + Behaviors + Pack all clear.
    expect(screen.getAllByText('All clear')).toHaveLength(4)
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
})
