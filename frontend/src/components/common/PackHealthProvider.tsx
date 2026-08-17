import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { useRecipeStore } from '../../core/recipe/recipe-store'
import { useBehaviorStore } from '../../core/behavior/behavior-store'
import { usePackHealthStore } from '../../core/pack-health/pack-health-store'
import { analyzePackHealth } from '../../core/pack-health'
import type { PackHealthReport } from '../../core/pack-health/types'
import { getPackIndex, invalidatePackIndex } from '../../services/pack-index'
import type { PackIndex } from '../../services/pack-index'

export interface PackHealthProviderProps {
  project: {
    id: string
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
  const depIssues = usePackHealthStore((s) => s.depIssues)
  const recipes = useRecipeStore((s) => s.recipes)
  const behaviors = useBehaviorStore((s) => s.behaviors)

  const packMeta = {
    name: project.name,
    description: project.description,
    author: project.author,
    packVersion: project.pack_version,
  }

  // Pack Index for the availability check (P1-HEALTH-2). Two fetch paths:
  //  1. mount / project change — load the memoized index for this project.
  //  2. recipe SAVE (dirty true→false — scripts written to disk, `markClean`)
  //     — invalidate + refetch so saved recipes show up (same freshness
  //     contract as the palette's usageRefreshKey, at the provider level).
  // Per-edit dirty flips (true) do NOT refetch (nothing is on disk yet).
  // Failures degrade to null → the availability check is skipped, never
  // fired as "no recipes".
  const [packIndex, setPackIndex] = useState<PackIndex | null>(null)
  const recipeDirty = useRecipeStore((s) => s.dirty)
  const wasDirty = useRef(recipeDirty)

  useEffect(() => {
    let cancelled = false
    getPackIndex(project.id)
      .then((idx) => { if (!cancelled) setPackIndex(idx) })
      .catch(() => { if (!cancelled) setPackIndex(null) })
    return () => { cancelled = true }
  }, [project.id])

  useEffect(() => {
    // Save transition detection: dirty went true → false means scripts were
    // written to disk (markClean). Skip the initial mount (wasDirty starts
    // as the current value) and the edit-start flip (dirty → true).
    const saveLanded = wasDirty.current === true && recipeDirty === false
    wasDirty.current = recipeDirty
    if (!saveLanded) return
    let cancelled = false
    invalidatePackIndex(project.id)
    getPackIndex(project.id)
      .then((idx) => { if (!cancelled) setPackIndex(idx) })
      .catch(() => { if (!cancelled) setPackIndex(null) })
    return () => { cancelled = true }
  }, [project.id, recipeDirty])

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
      depIssues,
      packIndex,
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
          depIssues,
          packIndex,
        }),
      )
    }, 300)
    return () => clearTimeout(t)
  }, [questGraph, itemRegistry, recipes, behaviors, hasCoverImage, packLoaded, project, installedMods, depIssues, packIndex])

  const value = { report }

  return <PackHealthContext.Provider value={value}>{children}</PackHealthContext.Provider>
}
