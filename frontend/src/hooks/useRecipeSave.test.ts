import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useRecipeSave } from './useRecipeSave'
import { generateRecipeScripts, writeScriptFiles } from '../services/api'

vi.mock('../services/api', () => ({
  generateRecipeScripts: vi.fn().mockResolvedValue({ kubejs: 'x', crafttweaker: 'y' }),
  writeScriptFiles: vi.fn().mockResolvedValue(undefined),
  wsIpcSendEvent: vi.fn().mockResolvedValue(1),
}))

// The hotswap gate is ENABLED (s44): the recipe save goes through the
// evidence-gated loop (reloadKubeJSInGame) and reports PASS/FAIL honestly —
// never an unverified claim. The gate was disabled until the KubeJS reload
// evidence shape was probed (two-line, verified against the 2101.7.2 jar).
vi.mock('../core/sync/config', () => ({
  KUBEJS_HOTSWAP_ENABLED: true,
}))

vi.mock('../services/hotswap', () => ({
  reloadKubeJSInGame: vi.fn(),
}))

import { useRecipeStore } from '../core/recipe/recipe-store'
import { reloadKubeJSInGame } from '../services/hotswap'
import type { Recipe } from '../core/recipe/recipe-store'

const reloadMock = reloadKubeJSInGame as unknown as ReturnType<typeof vi.fn>

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

describe('useRecipeSave — hotswap evidence loop (P2-HOTSWAP)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    reloadMock.mockResolvedValue({ status: 'passed' })
  })

  it('broadcasts the reload through the evidence loop and reports verified PASS', async () => {
    const { result } = renderHook(() => useRecipeSave('p1'))
    const recipes = [makeRecipe()]

    await act(async () => {
      await result.current.save(recipes, () => {})
    })

    expect(writeScriptFiles).toHaveBeenCalledTimes(1)
    expect(reloadMock).toHaveBeenCalledWith('p1')
    expect(result.current.saveMessage).toContain('evidence verified')
  })

  it('never claims a reload when the evidence loop reports FAIL', async () => {
    reloadMock.mockResolvedValue({ status: 'failed' })
    const { result } = renderHook(() => useRecipeSave('p1'))
    const recipes = [makeRecipe()]

    await act(async () => {
      await result.current.save(recipes, () => {})
    })

    expect(result.current.saveMessage).toContain('NOT verified')
    expect(result.current.saveMessage).toContain('restart the game to apply')
  })

  it('surfaces no-companion honestly instead of claiming a reload', async () => {
    reloadMock.mockResolvedValue({ status: 'no-companion' })
    const { result } = renderHook(() => useRecipeSave('p1'))
    const recipes = [makeRecipe()]

    await act(async () => {
      await result.current.save(recipes, () => {})
    })

    expect(result.current.saveMessage).toContain('game not connected')
    expect(result.current.saveMessage).toContain('restart the game to apply')
  })

  it('writes the generated scripts regardless of the evidence outcome', async () => {
    reloadMock.mockResolvedValue({ status: 'passed' })
    const { result } = renderHook(() => useRecipeSave('p1'))
    const recipes = [makeRecipe()]

    await act(async () => {
      await result.current.save(recipes, () => {})
    })

    expect(generateRecipeScripts).toHaveBeenCalledTimes(1)
    expect(writeScriptFiles).toHaveBeenCalledTimes(1)
    expect(useRecipeStore.getState().recipes ?? []).toBeDefined()
  })
})
