import { render, screen, act, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { RecipeScriptDrawer } from './RecipeScriptDrawer'
import { useRecipeStore, type Recipe } from '../../core/recipe/recipe-store'
import * as api from '../../services/api'

vi.mock('../../services/api', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../../services/api')>()
  return { ...mod, generateRecipeScripts: vi.fn() }
})

const mockedGen = vi.mocked(api.generateRecipeScripts)

function makeRecipe(over: Partial<Recipe> = {}): Recipe {
  return {
    id: 'r1',
    type: 'shaped',
    name: 'Test',
    pattern: ['A'],
    key: { A: { item: 'minecraft:diamond', tag: false } },
    ingredients: [],
    output: { item: 'minecraft:diamond_block', count: 1 },
    origin: 'authored',
    editable: true,
    disabled: false,
    ...over,
  }
}

beforeEach(() => {
  localStorage.clear()
  useRecipeStore.setState({
    recipes: [],
    selectedRecipeId: null,
    dirty: false,
    canUndo: false,
    canRedo: false,
    disabledIds: [],
    disabledScripts: [],
  })
  mockedGen.mockReset()
  mockedGen.mockResolvedValue({ kubejs: 'event.shaped("out", ["A"], { A: "in" })', crafttweaker: '' })
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

async function flush() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(500)
  })
}

describe('RecipeScriptDrawer', () => {
  it('emits the full file for a saveable authored recipe', async () => {
    const r = makeRecipe()
    render(<RecipeScriptDrawer projectId="p" recipes={[r]} selectedRecipe={r} loader="kubejs" />)
    await flush()
    expect(mockedGen).toHaveBeenCalled()
    expect(screen.getByText(/event\.shaped/)).toBeTruthy()
  })

  it('this-recipe preview passes no removes and renders the emission', async () => {
    useRecipeStore.setState({ ...useRecipeStore.getState(), disabledIds: ['minecraft:stick'] })
    const r = makeRecipe()
    render(<RecipeScriptDrawer projectId="p" recipes={[r]} selectedRecipe={r} loader="kubejs" />)
    await flush()
    const calls = mockedGen.mock.calls
    expect(calls.length).toBeGreaterThanOrEqual(2)
    // full file → store disabledIds; this recipe → []
    expect(calls.some((c) => JSON.stringify(c[2]) === '["minecraft:stick"]')).toBe(true)
    expect(calls.some((c) => JSON.stringify(c[2]) === '[]')).toBe(true)
    fireEventClick('This recipe')
    await flush()
    expect(screen.getByText(/event\.shaped/)).toBeTruthy()
  })

  it('explains why nothing is emitted for a discovered (non-authored) recipe', async () => {
    const r = makeRecipe({ origin: 'kubejs', source: '/x/recipes.js' })
    render(<RecipeScriptDrawer projectId="p" recipes={[r]} selectedRecipe={r} loader="kubejs" />)
    await flush()
    fireEventClick('This recipe')
    await flush()
    expect(screen.getByText(/nothing to emit/i)).toBeTruthy()
    expect(screen.getByText(/Edit a copy/i)).toBeTruthy()
  })

  it('explains when the selected recipe has no output', async () => {
    const r = makeRecipe({ output: { item: '', count: 1 } })
    render(<RecipeScriptDrawer projectId="p" recipes={[r]} selectedRecipe={r} loader="kubejs" />)
    await flush()
    fireEventClick('This recipe')
    await flush()
    expect(screen.getByText(/set an output item/i)).toBeTruthy()
  })

  it('shows a helpful message for an empty full file', async () => {
    const r = makeRecipe({ origin: 'vanilla', editable: true })
    render(<RecipeScriptDrawer projectId="p" recipes={[r]} selectedRecipe={r} loader="kubejs" />)
    await flush()
    expect(screen.getByText(/no authored recipes with an output/i)).toBeTruthy()
  })
})

function fireEventClick(label: string) {
  const button = screen.getByRole('button', { name: label })
  fireEvent.click(button)
}
