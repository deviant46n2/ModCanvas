import { createContext, useContext, useEffect, useState } from 'react'
import { useRecipeStore } from '../../core/recipe/recipe-store'
import { useBehaviorStore } from '../../core/behavior/behavior-store'
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
  /** Scanned mods/ jar names (ingest result; null = no mods dir = unknown). */
  installedMods: string[] | null
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
 * editor, recipes from the recipe store). Recomputed (trailing-edge debounced)
 * whenever those inputs change — never on demand, never via IPC (Project
 * Bible §9.2). The debounce means a large recipe import (which commits in
 * chunks) analyzes only the final state instead of every intermediate chunk.
 */
export function PackHealthProvider({ project, packLoaded, installedMods, children }: PackHealthProviderProps) {
  const questGraph = usePackHealthStore((s) => s.questGraph)
  const itemRegistry = usePackHealthStore((s) => s.itemRegistry)
  const hasCoverImage = usePackHealthStore((s) => s.hasCoverImage)
  const recipes = useRecipeStore((s) => s.recipes)
  const behaviors = useBehaviorStore((s) => s.behaviors)

  const packMeta = {
    name: project.name,
    description: project.description,
    author: project.author,
    packVersion: project.pack_version,
  }

  const [report, setReport] = useState<PackHealthReport>(() =>
    analyzePackHealth({
      questGraph,
      itemRegistry,
      recipes,
      behaviors,
      packMeta,
      hasCoverImage,
      packLoaded,
      installedMods,
    }),
  )

  useEffect(() => {
    const t = setTimeout(() => {
      setReport(
        analyzePackHealth({
          questGraph,
          itemRegistry,
          recipes,
          behaviors,
          packMeta,
          hasCoverImage,
          packLoaded,
          installedMods,
        }),
      )
    }, 300)
    return () => clearTimeout(t)
  }, [questGraph, itemRegistry, recipes, behaviors, hasCoverImage, packLoaded, project, installedMods])

  const value = { report }

  return <PackHealthContext.Provider value={value}>{children}</PackHealthContext.Provider>
}
