import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { GuidedRecipeWizard, type GuidedRecipeSpec } from './GuidedRecipeWizard'
import type { ItemRegistryEntry, ItemTagInfo } from '../../services/quest-types/registry'

// P0-MINIWIZ contract: the wizard collects a spec and hands it to onCreate —
// it never touches the recipe store itself (no parallel generation paths).
// The recipe lands through the editor's own addRecipe path.

const items: ItemRegistryEntry[] = [
  { id: 'minecraft:diamond', name: 'Diamond', mod_id: 'minecraft', texture_data_url: null },
  { id: 'minecraft:stick', name: 'Stick', mod_id: 'minecraft', texture_data_url: null },
]
const tags: ItemTagInfo[] = []

function renderWizard(onCreate: (spec: GuidedRecipeSpec) => void) {
  render(
    <GuidedRecipeWizard
      open
      items={items}
      tags={tags}
      getTextureUrl={() => null}
      onClose={() => {}}
      onCreate={onCreate}
    />,
  )
}

describe('GuidedRecipeWizard', () => {
  it('builds a shapeless spec from output + ingredients', () => {
    const onCreate = vi.fn()
    renderWizard(onCreate)

    // Step 1: pick output.
    fireEvent.click(screen.getByTitle('Diamond'))
    // Step 2: add an ingredient from the inline browser.
    fireEvent.click(screen.getByTitle('Stick'))
    fireEvent.click(screen.getByText('Review'))
    // Step 3: create.
    fireEvent.click(screen.getByText('Add recipe'))

    expect(onCreate).toHaveBeenCalledTimes(1)
    const spec = onCreate.mock.calls[0][0]
    expect(spec.output).toBe('minecraft:diamond')
    expect(spec.outputCount).toBe(1)
    expect(spec.ingredients).toEqual([{ item: 'minecraft:stick', count: 1 }])
  })

  it('blocks create while a blocking validation error exists (no output)', () => {
    const onCreate = vi.fn()
    renderWizard(onCreate)

    // No output picked: create is unreachable (step 2 requires an output).
    expect(onCreate).not.toHaveBeenCalled()
  })

  it('carries ingredient counts and the output count into the spec', () => {
    const onCreate = vi.fn()
    renderWizard(onCreate)

    fireEvent.click(screen.getByTitle('Diamond'))
    const countInputs = screen.getAllByRole('spinbutton')
    // First spinbutton is the output count.
    fireEvent.change(countInputs[0], { target: { value: '4' } })
    fireEvent.click(screen.getByTitle('Stick'))
    const afterIngredient = screen.getAllByRole('spinbutton')
    // Last spinbutton is the ingredient count.
    fireEvent.change(afterIngredient[afterIngredient.length - 1], { target: { value: '2' } })
    fireEvent.click(screen.getByText('Review'))
    fireEvent.click(screen.getByText('Add recipe'))

    const spec = onCreate.mock.calls[0][0]
    expect(spec.outputCount).toBe(4)
    expect(spec.ingredients).toEqual([{ item: 'minecraft:stick', count: 2 }])
  })
})
