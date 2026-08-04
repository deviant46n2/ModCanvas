import { useEffect, useState } from 'react'
import { scanPackRecipes } from '../services/api'
import type { DiscoveredRecipe } from '../services/api'

export function usePackRecipes(projectPath: string) {
  const [scanning, setScanning] = useState(true)
  const [error, setError] = useState('')
  const [recipes, setRecipes] = useState<DiscoveredRecipe[]>([])

  useEffect(() => {
    let cancelled = false
    setScanning(true)
    setError('')
    scanPackRecipes(projectPath)
      .then((r) => { if (!cancelled) setRecipes(r) })
      .catch((e) => { if (!cancelled) setError(String(e)) })
      .finally(() => { if (!cancelled) setScanning(false) })
    return () => { cancelled = true }
  }, [projectPath])

  return { scanning, error, recipes }
}
