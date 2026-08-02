import { useState, useMemo, useCallback } from 'react'
import { getProjectMods, getProjectModMetadata, getDepNames, checkCompatibility, searchMods, addMod, removeMod, scanInstanceMods } from '../services/api'
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
  source: 'modrinth' | 'curseforge'
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
  const [searchSource, setSearchSource] = useState<'modrinth' | 'curseforge'>('modrinth')
  const [projectMods, setProjectMods] = useState<any[]>([])
  const [modFilter, setModFilter] = useState('')
  const [modFilterInput, setModFilterInput] = useState('')
  const [modMetadata, setModMetadata] = useState<Map<string, any>>(new Map())
  const [depNameMap, setDepNameMap] = useState<Map<string, string>>(new Map())
  const [isLoadingMetadata, setIsLoadingMetadata] = useState(false)
  const [compatResult, setCompatResult] = useState<any | null>(null)
  const [isCheckingCompat, setIsCheckingCompat] = useState(false)

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
        true,
      )
      await loadProjectMods(selectedProject.id)
    } catch (e) {
      console.error('Failed to add mod:', e)
    }
  }

  async function removeModFromProject(modId: string) {
    if (!selectedProject) return
    try {
      await removeMod(selectedProject.id, modId)
      await loadProjectMods(selectedProject.id)
    } catch (e) {
      console.error('Failed to remove mod:', e)
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
    if (!searchQuery || !selectedProject) return
    try {
      const results = await searchMods(
        searchQuery,
        selectedProject.mod_loader,
        selectedProject.minecraft_version,
        searchSource,
      )
      setSearchResults(results)
    } catch (e) {
      console.error('Failed to search mods:', e)
    }
  }

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
    searchSource, setSearchSource,
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
    addModToProject,
    removeModFromProject,
    toggleModEnabled,
    handleSearchMods,
    getMissingDependencies,
    getModNameById,
    resetModState,
  }
}