import { useEffect, useState } from 'react'
import { generateRecipeScripts } from '../services/api'
import type { Recipe } from '../core/recipe/recipe-store'

export function useRecipeScripts(projectId: string, recipe: Recipe, isCraftTweaker: boolean) {
  const [script, setScript] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    generateRecipeScripts(projectId, [recipe as unknown as Record<string, unknown>])
      .then((res) => {
        if (!cancelled) setScript(isCraftTweaker ? res.crafttweaker : res.kubejs)
      })
      .catch((e) => { if (!cancelled) setError(String(e)) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [projectId, recipe, isCraftTweaker])

  return { script, loading, error }
}
