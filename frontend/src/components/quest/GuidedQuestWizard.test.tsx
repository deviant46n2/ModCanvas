import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { GuidedQuestWizard, type GuidedQuestSpec } from './GuidedQuestWizard'
import type { ItemRegistryEntry, ItemTagInfo } from '../../services/quest-types/registry'

// P0-MINIWIZ contract: the wizard collects a spec and hands it to onCreate —
// it never touches the graph or history itself (no parallel generation paths).
// The quest lands in the editor through the same commitGraph path.

const items: ItemRegistryEntry[] = [
  { id: 'minecraft:diamond', name: 'Diamond', mod_id: 'minecraft', texture_data_url: null },
  { id: 'minecraft:iron_ingot', name: 'Iron Ingot', mod_id: 'minecraft', texture_data_url: null },
]
const tags: ItemTagInfo[] = []

function renderWizard(onCreate: (spec: GuidedQuestSpec) => void) {
  render(
    <GuidedQuestWizard
      open
      items={items}
      tags={tags}
      getPickerTextureUrl={() => null}
      onClose={() => {}}
      onCreate={onCreate}
    />,
  )
}

describe('GuidedQuestWizard', () => {
  it('defaults include a collect-N-get-N reward (the template pack shape)', () => {
    const onCreate = vi.fn()
    renderWizard(onCreate)

    // Step 1: pick an item (item names render as slot tooltips).
    fireEvent.click(screen.getByTitle('Diamond'))
    // Step 2: goal defaults to Collect; review.
    fireEvent.click(screen.getByText('Review'))
    // Step 3: create.
    fireEvent.click(screen.getByText('Add quest'))

    expect(onCreate).toHaveBeenCalledTimes(1)
    const spec = onCreate.mock.calls[0][0]
    expect(spec.target).toBe('minecraft:diamond')
    expect(spec.objectiveType).toBe('item_acquisition')
    expect(spec.count).toBe(1)
    expect(spec.rewardItem).toBe('minecraft:diamond')
    expect(spec.rewardCount).toBe(1)
    expect(spec.includeReward).toBe(true)
  })

  it('honors an un-checked reward toggle', () => {
    const onCreate = vi.fn()
    renderWizard(onCreate)

    fireEvent.click(screen.getByTitle('Diamond'))
    fireEvent.click(screen.getByText('Review'))
    fireEvent.click(screen.getByText('Reward the item back (collect-N-get-N)'))
    fireEvent.click(screen.getByText('Add quest'))

    const spec = onCreate.mock.calls[0][0]
    expect(spec.includeReward).toBe(false)
  })

  it('uses a custom count from step 2', () => {
    const onCreate = vi.fn()
    renderWizard(onCreate)

    fireEvent.click(screen.getByTitle('Diamond'))
    const countInput = screen.getByRole('spinbutton')
    fireEvent.change(countInput, { target: { value: '8' } })
    fireEvent.click(screen.getByText('Review'))
    fireEvent.click(screen.getByText('Add quest'))

    const spec = onCreate.mock.calls[0][0]
    expect(spec.count).toBe(8)
    expect(spec.rewardCount).toBe(8)
  })
})
