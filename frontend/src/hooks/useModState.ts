// Mod management hook: install/remove, metadata + dependency lookup, and
// compatibility checks (the search surface was deleted under PRISM-LEAN s54 —
// browsing/installing new mods happens in Prism; the one-click Modrinth
// installs that remain feed the compat panel and the wizard). Types live in
// `./useModState/types` and the pure lookups in `./useModState/helpers`.

import { useState, useMemo, useCallback } from 'react'
import { getProjectMods, getProjectModMetadata, getDepNames, checkCompatibility, addMod, removeMod, scanInstanceMods } from '../services/api'
import { useToast } from '../components/ui/Toast'
import { debounce } from '../core/utils/debounce'
import { usePackHealthStore } from '../core/pack-health/pack-health-store'
import type { Project } from './useProjectState'
import type { CompatibilityResult } from '../services/types'
import { filterMods, findMissingDependencies, resolveModName } from './useModState/helpers'
import { useCompatInstall } from './useModState/compat-install'

export type { ModDependency, ModMetadata, CompatibilityIssue, CompatibilityResult } from './useModState/types'

export function useModState(selectedProject: Project | null) {
  const [projectMods, setProjectMods] = useState<any[]>([])
  const [modFilter, setModFilter] = useState('')
  const [modFilterInput, setModFilterInput] = useState('')
  const [modMetadata, setModMetadata] = useState<Map<string, any>>(new Map())
  const [depNameMap, setDepNameMap] = useState<Map<string, string>>(new Map())
  const [isLoadingMetadata, setIsLoadingMetadata] = useState(false)
  const [compatResult, setCompatResult] = useState<CompatibilityResult | null>(null)
  const [isCheckingCompat, setIsCheckingCompat] = useState(false)
  const { showToast } = useToast()

  const debouncedSetModFilter = useCallback(
    debounce((value: string) => setModFilter(value), 300),
    []
  )
  const filteredMods = useMemo(() => {
    return filterMods(projectMods, modFilter)
  }, [projectMods, modFilter])

  async function loadProjectMods(projectId?: string) {
    const id = projectId || selectedProject?.id
    if (!id) return
    try {
      const result = await getProjectMods(id)
      setProjectMods(result)
    } catch (e) {
      console.error('Failed to load project mods:', e)
    }
  }

  async function handleScanInstanceMods() {
    if (!selectedProject) return
    try {
      const scannedMods = await scanInstanceMods(selectedProject.id)
      setProjectMods(scannedMods)
      console.log(`[ModCanvas] Scanned ${scannedMods.length} mods from instance`)
    } catch (e) {
      console.error('Failed to scan instance mods:', e)
    }
  }

  async function loadModMetadata() {
    if (!selectedProject || projectMods.length === 0) return
    setIsLoadingMetadata(true)
    try {
      const metadata = await getProjectModMetadata(selectedProject.id)
      const map = new Map<string, any>()
      for (const m of metadata) {
        map.set(m.mod_id, m)
      }
      setModMetadata(map)

      const depIds = new Set<string>()
      for (const m of metadata) {
        for (const dep of m.dependencies) {
          if (!projectMods.some(pm => pm.mod_id === dep.mod_id)) {
            depIds.add(dep.mod_id)
          }
        }
      }
      if (depIds.size > 0) {
        const depIdsArray = Array.from(depIds)
        const depNames = await getDepNames(depIdsArray)
        const nameMap = new Map<string, string>()
        for (const d of depNames) {
          nameMap.set(d.mod_id, d.name)
          nameMap.set(d.slug, d.name)
        }
        setDepNameMap(nameMap)
      }
    } catch (e) {
      console.error('Failed to load mod metadata:', e)
    } finally {
      setIsLoadingMetadata(false)
    }
  }

  async function handleCheckCompat() {
    if (!selectedProject) return
    setIsCheckingCompat(true)
    try {
      const result = await checkCompatibility(selectedProject.id)
      setCompatResult(result)
      // The health report's persistent (non-blocking) dep warnings read from
      // this store (s55 ruling: warn, don't gate — the user may not want to
      // install a mod right now).
      usePackHealthStore.getState().setDepIssues(result.issues)
    } catch (e) {
      console.error('Failed to check compatibility:', e)
    } finally {
      setIsCheckingCompat(false)
    }
  }

  // One-click missing-dependency installs (compat panel). Extracted to its
  // own sub-hook: it owns the in-flight set and the batch/single wrappers.
  const compatInstall = useCompatInstall(
    {
      selectedProject,
      showToast,
      loadProjectMods,
      recheck: handleCheckCompat,
    },
    compatResult,
  )

  async function removeModFromProject(modId: string) {
    if (!selectedProject) return
    const row = projectMods.find((m) => m.mod_id === modId)
    const label = row?.name || modId
    try {
      const result = await removeMod(selectedProject.id, modId)
      if (result.fileMissing) {
        showToast({
          type: 'warning',
          title: `Removed ${label}`,
          message: 'Its jar was already missing from the instance.',
          duration: 6000,
        })
      } else {
        showToast({
          type: 'success',
          title: `Removed ${label}`,
          message: result.message,
        })
      }
      await loadProjectMods(selectedProject.id)
    } catch (e: any) {
      const msg = typeof e === 'string' ? e : e?.message || String(e)
      console.error('Failed to remove mod:', e)
      showToast({
        type: 'error',
        title: `Failed to remove ${label}`,
        message: msg,
        duration: 8000,
      })
    }
  }

  async function toggleModEnabled(mod: any) {
    if (!selectedProject) return
    try {
      await addMod(
        selectedProject.id,
        mod.mod_id,
        mod.slug,
        mod.name,
        mod.version,
        mod.description,
        mod.author,
        mod.source || 'Modrinth',
        !mod.enabled,
      )
      await loadProjectMods(selectedProject.id)
    } catch (e) {
      console.error('Failed to toggle mod:', e)
    }
  }

  function getMissingDependencies(modId: string) {
    return findMissingDependencies(modMetadata, projectMods, modId)
  }

  function getModNameById(modId: string): string {
    return resolveModName(projectMods, modMetadata, depNameMap, modId)
  }

  function resetModState() {
    setModFilter('')
    setModFilterInput('')
    setModMetadata(new Map())
    setDepNameMap(new Map())
    setCompatResult(null)
  }

  return {
    projectMods,
    modFilterInput, setModFilterInput,
    modMetadata,
    isLoadingMetadata,
    compatResult, setCompatResult,
    isCheckingCompat,
    debouncedSetModFilter,
    filteredMods,
    loadProjectMods,
    handleScanInstanceMods,
    loadModMetadata,
    handleCheckCompat,
    ...compatInstall,
    removeModFromProject,
    toggleModEnabled,
    getMissingDependencies,
    getModNameById,
    resetModState,
  }
}
