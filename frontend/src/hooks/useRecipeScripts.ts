import { useEffect, useState } from 'react'
import { generateRecipeScripts } from '../services/api'
import { selectSaveableRecipes } from '../core/recipe/validation'
import { useRecipeStore, type Recipe } from '../core/recipe/recipe-store'

const DEBOUNCE_MS = 400

/** Live render of the exact on-disk script (`generate_recipe_scripts` over the
 *  same saveable recipe set the save button writes). Debounced so typing in the
 *  grid doesn't hammer the backend on every keystroke. */
export function useRecipeScripts(projectId: string, recipes: Recipe[], isCraftTweaker: boolean) {
  const [script, setScript] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const disabledIds = useRecipeStore((s) => s.disabledIds)

  useEffect(() => {
    let cancelled = false
    let timer: number | undefined

    const valid = selectSaveableRecipes(recipes)
    if (valid.length === 0) {
      setScript('')
      setLoading(false)
      setError('')
      return
    }

    setLoading(true)
    setError('')
    timer = window.setTimeout(() => {
      generateRecipeScripts(projectId, valid as unknown as Record<string, unknown>[], disabledIds)
        .then((res) => {
          if (!cancelled) setScript(isCraftTweaker ? res.crafttweaker : res.kubejs)
        })
        .catch((e) => { if (!cancelled) setError(String(e)) })
        .finally(() => { if (!cancelled) setLoading(false) })
    }, DEBOUNCE_MS)

    return () => {
      cancelled = true
      if (timer !== undefined) window.clearTimeout(timer)
    }
  }, [projectId, recipes, isCraftTweaker, disabledIds])

  return { script, loading, error }
}
