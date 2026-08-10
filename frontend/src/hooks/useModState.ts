import { useState, useMemo, useCallback } from 'react'
import { getProjectMods, getProjectModMetadata, getDepNames, checkCompatibility, searchMods, addMod, removeMod, scanInstanceMods, installModFromSearch } from '../services/api'
import { useToast } from '../components/ui/Toast'
import { debounce } from '../core/utils/debounce'
import type { Project } from './useProjectState'

export interface ModDependency {
  mod_id: string
  dependency_type: string
}

export interface ModMetadata {
  mod_id: string
  slug: string
  name: string
  description: string
  author: string
  categories: string[]
  dependencies: ModDependency[]
  supported_loaders: string[]
  supported_versions: string[]
  downloads: number
  source_url: string | null
  issues_url: string | null
  documentation_url: string | null
  icon: string | null
  source: 'modrinth' | 'curseforge'
  mismatch?: string | null
}

export interface CompatibilityIssue {
  severity: string
  message: string
  affected_mods: string[]
  affected_mod_names: string[]
}

export interface CompatibilityResult {
  compatible: boolean
  issues: CompatibilityIssue[]
  warnings: string[]
}

export function useModState(selectedProject: Project | null) {
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<any[]>([])
  const [searchSources, setSearchSources] = useState<Array<'modrinth' | 'curseforge'>>(['modrinth', 'curseforge'])
  // Modrinth category facet for the mod search ('' = all categories). Only
  // Modrinth supports category facets; CurseForge results are unaffected.
  const [searchCategory, setSearchCategory] = useState('')
  const [projectMods, setProjectMods] = useState<any[]>([])
  const [modFilter, setModFilter] = useState('')
  const [modFilterInput, setModFilterInput] = useState('')
  const [modMetadata, setModMetadata] = useState<Map<string, any>>(new Map())
  const [depNameMap, setDepNameMap] = useState<Map<string, string>>(new Map())
  const [isLoadingMetadata, setIsLoadingMetadata] = useState(false)
  const [compatResult, setCompatResult] = useState<any | null>(null)
  const [isCheckingCompat, setIsCheckingCompat] = useState(false)
  // Mod ids currently being downloaded/installed from search results.
  const [installingIds, setInstallingIds] = useState<Set<string>>(new Set())
  const { showToast } = useToast()

  const debouncedSetModFilter = useCallback(
    debounce((value: string) => setModFilter(value), 300),
    []
  )
  const filteredMods = useMemo(() => {
    return projectMods.filter(mod =>
      !modFilter ||
      mod.name.toLowerCase().includes(modFilter.toLowerCase()) ||
      mod.author.toLowerCase().includes(modFilter.toLowerCase())
    )
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
    } catch (e) {
      console.error('Failed to check compatibility:', e)
    } finally {
      setIsCheckingCompat(false)
    }
  }

  async function addModToProject(mod: any) {
    if (!selectedProject) return
    const modId = mod.mod_id as string
    const source: 'modrinth' | 'curseforge' =
      mod.source === 'curseforge' || mod.source === 'modrinth'
        ? mod.source
        // Backend stamps `source` on every search result, so this fallback is
        // defensive only; the first selected source is the deterministic pick.
        : (searchSources[0] ?? 'modrinth')
    setInstallingIds(prev => new Set(prev).add(modId))
    try {
      const installed = await installModFromSearch({
        projectId: selectedProject.id,
        source,
        modId,
        slug: mod.slug,
        name: mod.name,
        author: mod.author,
        description: mod.description,
        version: mod.version,
        icon: mod.icon ?? null,
      })
      showToast({
        type: 'success',
        title: `Installed ${installed.name || mod.name}`,
        message: `Downloaded and added to ${selectedProject.name}`,
      })
      await loadProjectMods(selectedProject.id)
    } catch (e: any) {
      const msg = typeof e === 'string' ? e : e?.message || String(e)
      console.error('[ModCanvas] Failed to install mod:', msg)
      showToast({
        type: 'error',
        title: `Failed to install ${mod.name}`,
        message: msg,
        duration: 8000,
      })
    } finally {
      setInstallingIds(prev => {
        const next = new Set(prev)
        next.delete(modId)
        return next
      })
    }
  }

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

  async function handleSearchMods() {
    if (!selectedProject || searchSources.length === 0) return
    // A query OR a category is a valid search — browsing by category with an
    // empty query is the "show me tech mods" flow, not a no-op.
    if (!searchQuery && !searchCategory) return
    try {
      const results = await searchMods(
        searchQuery,
        selectedProject.mod_loader,
        selectedProject.minecraft_version,
        searchSources,
        searchCategory ? [searchCategory] : [],
      )
      setSearchResults(results)
    } catch (e) {
      console.error('Failed to search mods:', e)
    }
  }

  // Source toggles must visibly take effect: clear the stale results list so
  // a toggle never leaves the previous search's results on screen pretending
  // to be current (that made the toggles look dead/bouncing depending on
  // whether the user happened to re-search before looking).
  const handleSearchSourcesChange = useCallback((sources: Array<'modrinth' | 'curseforge'>) => {
    setSearchSources(sources)
    setSearchResults([])
  }, [])

  function getMissingDependencies(modId: string) {
    const meta = modMetadata.get(modId)
    if (!meta) return []
    return meta.dependencies.filter((dep: ModDependency) => {
      if (dep.dependency_type !== 'required') return false
      return !projectMods.some(m => m.mod_id === dep.mod_id)
    })
  }

  function getModNameById(modId: string): string {
    const mod = projectMods.find(m => m.mod_id === modId)
    if (mod) return mod.name
    const meta = modMetadata.get(modId)
    if (meta) return meta.name
    const depName = depNameMap.get(modId)
    if (depName) return depName
    return modId
  }

  function resetModState() {
    setSearchQuery('')
    setSearchResults([])
    setModFilter('')
    setModFilterInput('')
    setModMetadata(new Map())
    setDepNameMap(new Map())
    setCompatResult(null)
  }

  return {
    projectMods,
    searchQuery, setSearchQuery,
    searchResults, setSearchResults,
    searchSources, setSearchSources: handleSearchSourcesChange,
    searchCategory, setSearchCategory,
    modFilterInput, setModFilterInput,
    modMetadata,
    isLoadingMetadata,
    compatResult, setCompatResult,
    isCheckingCompat,
    installingIds,
    debouncedSetModFilter,
    filteredMods,
    loadProjectMods,
    handleScanInstanceMods,
    loadModMetadata,
    handleCheckCompat,
    addModToProject,
    removeModFromProject,
    toggleModEnabled,
    handleSearchMods,
    getMissingDependencies,
    getModNameById,
    resetModState,
  }
}