import { createContext, useContext, useMemo } from 'react'
import { useRecipeStore } from '../../core/recipe/recipe-store'
import { usePackHealthStore } from '../../core/pack-health/pack-health-store'
import { analyzePackHealth } from '../../core/pack-health'
import type { PackHealthReport } from '../../core/pack-health/types'

export interface PackHealthProviderProps {
  project: {
    name: string
    description: string
    author: string
    pack_version: string
  }
  packLoaded: boolean
  children: React.ReactNode
}

interface PackHealthContextValue {
  report: PackHealthReport
}

const PackHealthContext = createContext<PackHealthContextValue | null>(null)

export function usePackHealth(): PackHealthContextValue {
  const value = useContext(PackHealthContext)
  if (!value) throw new Error('usePackHealth must be used within a PackHealthProvider')
  return value
}

/**
 * Wraps the workspace and derives the Pack Health report as a pure function of
 * already-materialized state (quest graph + item registry pushed by the quest
 * editor, recipes from the recipe store). Recomputed via memo whenever those
 * inputs change — never on demand, never via IPC (Project Bible §9.2).
 */
export function PackHealthProvider({ project, packLoaded, children }: PackHealthProviderProps) {
  const questGraph = usePackHealthStore((s) => s.questGraph)
  const itemRegistry = usePackHealthStore((s) => s.itemRegistry)
  const hasCoverImage = usePackHealthStore((s) => s.hasCoverImage)
  const recipes = useRecipeStore((s) => s.recipes)

  const report = useMemo(
    () =>
      analyzePackHealth({
        questGraph,
        itemRegistry,
        recipes,
        packMeta: {
          name: project.name,
          description: project.description,
          author: project.author,
          packVersion: project.pack_version,
        },
        hasCoverImage,
        packLoaded,
      }),
    [questGraph, itemRegistry, recipes, hasCoverImage, packLoaded, project],
  )

  const value = useMemo(() => ({ report }), [report])

  return <PackHealthContext.Provider value={value}>{children}</PackHealthContext.Provider>
}
