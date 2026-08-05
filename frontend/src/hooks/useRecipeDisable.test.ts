import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  toggleRecipeDisable,
  manifestEntryFor,
  manifestRecipesFrom,
  type DisableServices,
} from './useRecipeDisable'
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

const SCRIPT_SOURCE = '/x/kubejs/server_scripts/recipes.js'

const scriptRecipe = makeRecipe({
  id: 's1',
  origin: 'kubejs',
  name: 'Script Recipe',
  source: SCRIPT_SOURCE,
  sourceLines: { start: 3, end: 5 },
})

const ctRecipe = makeRecipe({
  id: 'c1',
  origin: 'crafttweaker',
  name: 'CT Recipe',
  source: '/x/scripts/recipes.zs',
  sourceLines: { start: 10, end: 10 },
})

let commentOut: ReturnType<typeof vi.fn<DisableServices['commentOut']>>
let uncomment: ReturnType<typeof vi.fn<DisableServices['uncomment']>>
let services: DisableServices
let confirmFn: ReturnType<typeof vi.fn<(message: string) => boolean>>

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
  commentOut = vi.fn<DisableServices['commentOut']>().mockResolvedValue('abc123')
  uncomment = vi.fn<DisableServices['uncomment']>().mockResolvedValue(undefined)
  confirmFn = vi.fn<(message: string) => boolean>(() => true)
  services = { commentOut, uncomment }
})

describe('toggleRecipeDisable — dispatch per origin', () => {
  it('authored flips the disabled flag without IPC', async () => {
    const id = useRecipeStore.getState().addRecipe(makeRecipe())
    await toggleRecipeDisable('p1', { ...makeRecipe({ id }), origin: 'authored' }, confirmFn, services)
    expect(useRecipeStore.getState().recipes.find((r) => r.id === id)?.disabled).toBe(true)
    expect(commentOut).not.toHaveBeenCalled()
    expect(uncomment).not.toHaveBeenCalled()
  })

  it('vanilla toggles disabledIds without IPC', async () => {
    const vanilla = makeRecipe({ id: 'minecraft:stick', origin: 'vanilla' })
    await toggleRecipeDisable('p1', vanilla, confirmFn, services)
    expect(useRecipeStore.getState().disabledIds).toEqual(['minecraft:stick'])
    expect(commentOut).not.toHaveBeenCalled()
    await toggleRecipeDisable('p1', vanilla, confirmFn, services)
    expect(useRecipeStore.getState().disabledIds).toEqual([])
  })

  it('kubejs comments out via IPC and records the manifest entry', async () => {
    await toggleRecipeDisable('p1', scriptRecipe, confirmFn, services)
    expect(commentOut).toHaveBeenCalledWith('p1', scriptRecipe.source, 3, 5)
    const entries = useRecipeStore.getState().disabledScripts
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({
      file: SCRIPT_SOURCE,
      startLine: 3,
      endLine: 5,
      name: 'Script Recipe',
      outputItem: 'minecraft:diamond_block',
      type: 'shaped',
      fingerprint: 'abc123',
    })
  })

  it('crafttweaker comments out via IPC too', async () => {
    await toggleRecipeDisable('p1', ctRecipe, confirmFn, services)
    expect(commentOut).toHaveBeenCalledWith('p1', ctRecipe.source, 10, 10)
    expect(useRecipeStore.getState().disabledScripts).toHaveLength(1)
  })

  it('confirm dialog cancel skips the comment-out', async () => {
    confirmFn.mockReturnValue(false)
    await toggleRecipeDisable('p1', scriptRecipe, confirmFn, services)
    expect(commentOut).not.toHaveBeenCalled()
    expect(useRecipeStore.getState().disabledScripts).toHaveLength(0)
  })

  it('re-enabling a commented recipe calls uncomment + removes the manifest entry', async () => {
    useRecipeStore.getState().addDisabledScript({
      file: SCRIPT_SOURCE,
      startLine: 3,
      endLine: 5,
      name: 'Script Recipe',
      outputItem: 'minecraft:diamond_block',
      type: 'shaped',
      fingerprint: 'abc123',
    })
    await toggleRecipeDisable('p1', scriptRecipe, confirmFn, services)
    expect(uncomment).toHaveBeenCalledWith('p1', scriptRecipe.source, 3, 5, 'abc123')
    expect(commentOut).not.toHaveBeenCalled()
    expect(useRecipeStore.getState().disabledScripts).toHaveLength(0)
  })

  it('missing source span throws instead of guessing', async () => {
    const bare = makeRecipe({ id: 'x', origin: 'kubejs', source: undefined, sourceLines: undefined })
    await expect(toggleRecipeDisable('p1', bare, confirmFn, services)).rejects.toThrow(/no source span/)
  })

  it('manifest-only pseudo-recipes re-enable through the manifest', async () => {
    useRecipeStore.getState().addDisabledScript({
      file: SCRIPT_SOURCE,
      startLine: 3,
      endLine: 5,
      name: 'Script Recipe',
      outputItem: 'minecraft:diamond_block',
      type: 'shaped',
      fingerprint: 'fp',
    })
    const [pseudo] = manifestRecipesFrom(useRecipeStore.getState().disabledScripts)
    await toggleRecipeDisable('p1', pseudo, confirmFn, services)
    expect(uncomment).toHaveBeenCalledWith('p1', scriptRecipe.source, 3, 5, 'fp')
    expect(useRecipeStore.getState().disabledScripts).toHaveLength(0)
  })
})

describe('manifest helpers', () => {
  const manifest = [{
    file: SCRIPT_SOURCE,
    startLine: 3,
    endLine: 5,
    name: 'Script Recipe',
    outputItem: 'minecraft:diamond_block',
    type: 'shaped' as const,
    fingerprint: 'fp',
  }]

  it('manifestEntryFor matches by file + startLine', () => {
    expect(manifestEntryFor(scriptRecipe, manifest)).toEqual(manifest[0])
    expect(manifestEntryFor(makeRecipe({ id: 'z', origin: 'kubejs', source: '/other.js', sourceLines: { start: 9, end: 9 } }), manifest)).toBeNull()
    expect(manifestEntryFor(makeRecipe(), manifest)).toBeNull()
  })

  it('manifestRecipesFrom derives dimmed pseudo-recipes', () => {
    const pseudo = manifestRecipesFrom(manifest)
    expect(pseudo).toHaveLength(1)
    expect(pseudo[0]).toMatchObject({
      name: 'Script Recipe',
      output: { item: 'minecraft:diamond_block', count: 1 },
      type: 'shaped',
      source: SCRIPT_SOURCE,
      sourceLines: { start: 3, end: 5 },
    })
  })
})
