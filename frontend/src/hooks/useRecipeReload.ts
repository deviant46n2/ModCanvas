// useRecipeReload — the recipes tab's "Reload Recipes" state + callback.
//
// Extracted from RecipeEditor.tsx (300-line rule, s22 meta-rule). Recipes are
// auto-loaded when the pack opens; this re-scans in case files changed since.
// Idempotent — existing recipes are kept, new/changed ones are merged in.
import { useCallback, useState } from 'react'
import { reloadPackRecipes } from '../components/recipe/recipe-editor-utils'
import type { Recipe } from '../core/recipe/recipe-store'

export function useRecipeReload(
  projectPath: string,
  loadRecipesFromPack: (recipes: Recipe[]) => number,
) {
  const [reloading, setReloading] = useState(false)
  const [reloadMsg, setReloadMsg] = useState('')

  const reloadRecipes = useCallback(async () => {
    setReloading(true)
    setReloadMsg('')
    try {
      setReloadMsg(await reloadPackRecipes(projectPath, loadRecipesFromPack))
    } catch (e) {
      setReloadMsg(`Reload failed: ${String(e)}`)
    } finally {
      setReloading(false)
    }
  }, [projectPath, loadRecipesFromPack])

  return { reloading, reloadMsg, reloadRecipes }
}
