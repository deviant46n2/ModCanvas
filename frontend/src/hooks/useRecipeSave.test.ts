import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useRecipeSave } from './useRecipeSave'
import { generateRecipeScripts, writeScriptFiles, wsIpcSendEvent } from '../services/api'

vi.mock('../services/api', () => ({
  generateRecipeScripts: vi.fn().mockResolvedValue({ kubejs: 'x', crafttweaker: 'y' }),
  writeScriptFiles: vi.fn().mockResolvedValue(undefined),
  wsIpcSendEvent: vi.fn().mockResolvedValue(1),
}))

// The hotswap gate is a build-time flag (core/sync/config.ts): the recipe save
// must NOT fire an unverified RELOAD_KUBEJS_SCRIPTS while the KubeJS reload
// evidence shape is unprobed (P2-HOTSWAP silent-divergence rule).
vi.mock('../core/sync/config', () => ({
  KUBEJS_HOTSWAP_ENABLED: false,
}))

import { useRecipeStore } from '../core/recipe/recipe-store'
import type { Recipe } from '../core/recipe/recipe-store'

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

describe('useRecipeSave — hotswap gate (P2-HOTSWAP)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('does NOT broadcast RELOAD_KUBEJS_SCRIPTS while KubeJS hotswap is disabled (silent-divergence guard)', async () => {
    const { result } = renderHook(() => useRecipeSave('p1', '/x/kubejs/server_scripts/recipes.js'))
    const recipes = [makeRecipe()]

    await act(async () => {
      await result.current.save(recipes, () => {})
    })

    expect(writeScriptFiles).toHaveBeenCalledTimes(1)
    expect(wsIpcSendEvent).not.toHaveBeenCalled()
    // The message must surface the reload-vs-restart decision, not claim a reload.
    expect(result.current.saveMessage).toContain('restart the game to apply')
  })

  it('writes the generated scripts regardless of the gate', async () => {
    const { result } = renderHook(() => useRecipeSave('p1', '/x/kubejs/server_scripts/recipes.js'))
    const recipes = [makeRecipe()]

    await act(async () => {
      await result.current.save(recipes, () => {})
    })

    expect(generateRecipeScripts).toHaveBeenCalledTimes(1)
    expect(writeScriptFiles).toHaveBeenCalledTimes(1)
    expect(useRecipeStore.getState().recipes ?? []).toBeDefined()
  })
})
