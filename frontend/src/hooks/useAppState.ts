import { useState, useEffect, useCallback, useRef } from 'react'
import { listen } from '@tauri-apps/api/event'
import { getCurrentWindow } from '@tauri-apps/api/window'
import {
  autoImportPack,
  pickImportFile,
  exportModrinthMrpack,
  exportCurseforgeZip,
  openPrismLauncher,
  ingestActiveInstance as apiIngestActiveInstance,
  scanInstanceMods as apiScanInstanceMods,
  importFtbQuestsFromDir as apiImportFtbQuests,
  saveQuestGraph as apiSaveQuestGraph,
  scanPackRecipes as apiScanPackRecipes,
} from '../services/api'
import { useProjectState, type Project } from './useProjectState'
import { useModState } from './useModState'
import { useConfigState } from './useConfigState'
import { useLaunchState } from './useLaunchState'
import { useRecipeStore } from '../core/recipe/recipe-store'
import type { IngestResult } from '../services/quest-types'
import type { LoadPackProgress } from '../services/types'

export type { Project } from './useProjectState'
export type { ModDependency, ModMetadata, CompatibilityIssue, CompatibilityResult } from './useModState'
export type { LoadPackProgress } from '../services/types'

export interface ImportResult {
  project: Project
  mods: Array<{ mod_id: string; slug: string; name: string; version: string; source: string }>
  unresolved_mods: Array<{ file_name: string; mod_id: string | null; version: string | null; loader: string | null }>
  config_files: Array<{ path: string; content: string; format: string }>
}

export function useAppState() {
  const projectState = useProjectState()
  const { openProject } = projectState
  const modState = useModState(openProject)
  const configState = useConfigState(openProject)
  const launchState = useLaunchState(openProject)

  const [activeTab, setActiveTab] = useState<'mods' | 'configs' | 'progression' | 'quests' | 'recipes' | 'health'>('mods')

  const [showImport, setShowImport] = useState(false)
  const [importPath, setImportPath] = useState('')
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const [isImporting, setIsImporting] = useState(false)
  const [importError, setImportError] = useState('')

  const [showExport, setShowExport] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [exportError, setExportError] = useState('')
  const [exportPath, setExportPath] = useState('')

  const [ingestResult, setIngestResult] = useState<IngestResult | null>(null)
  const [ingesting, setIngesting] = useState(false)
  const [ingestError, setIngestError] = useState('')

  const [showLoadPack, setShowLoadPack] = useState(false)
  const [loadPackProgress, setLoadPackProgress] = useState<LoadPackProgress>({
    stage: 'idle',
    message: '',
    progress: 0,
  })
  const [packLoaded, setPackLoaded] = useState(false)
  // Save / Discard / Cancel guard shown when leaving a dirty pack.
  const [showLeavePack, setShowLeavePack] = useState(false)
  const autoReopenDone = useRef(false)

  // Listen for granular progress events emitted by the backend during ingest
  // (per-jar texture scanning), so the load bar shows real file-by-file work.
  useEffect(() => {
    let unlisten: (() => void) | undefined
    listen<LoadPackProgress>('modcanvas-load-pack-progress', (event) => {
      const p = event.payload
      setLoadPackProgress((prev) => ({
        ...prev,
        stage: p.stage === 'textures' ? 'textures' : prev.stage,
        message: p.message,
        progress: Math.max(prev.progress, p.progress),
        file: p.file,
        done: p.done,
        total: p.total,
      }))
    }).then((u) => { unlisten = u })
    return () => { unlisten?.() }
  }, [])

  const runIngestion = useCallback(async (instancePath: string) => {
    if (!instancePath) return
    setIngesting(true)
    setIngestError('')
    try {
      console.log('[Frontend] Starting ingestion for:', instancePath)
      const result = await apiIngestActiveInstance(instancePath)
      console.log('[Frontend] Ingestion result:', result)
      setIngestResult(result)
    } catch (e: any) {
      const msg = typeof e === 'string' ? e : e?.message || String(e)
      console.error('[Frontend] Ingestion failed:', msg)
      setIngestError(msg)
    } finally {
      setIngesting(false)
    }
  }, [])

  /** Shared cache-aware load pipeline: texture ingest → FTB import → save graph
   *  → scan + load mods → load configs. `force` bypasses the ingest cache.
   *  Returns true on success. */
  const runLoadPipeline = useCallback(async (project: Project, force: boolean, wasLoaded: boolean): Promise<boolean> => {
    if (!project.path) return false
    setPackLoaded(false)
    setShowLoadPack(true)
    setLoadPackProgress({ stage: 'idle', message: 'Preparing to scan textures...', progress: 2 })

    // Yield to let modal render first
    await new Promise(r => setTimeout(r, 0))

    try {
      // Stage 1: Ingest textures (backend emits per-jar progress events that
      // the listener above forwards into the load bar).
      setLoadPackProgress({ stage: 'textures', message: 'Scanning mod jars for textures...', progress: 5 })
      const ingestResult = await apiIngestActiveInstance(project.path, force)
      setIngestResult(ingestResult)
      setLoadPackProgress({ stage: 'textures', message: `Indexed ${ingestResult.textures_indexed} textures from ${ingestResult.jars_scanned} mods`, progress: 32 })

      // Stage 2: Import FTB Quests
      setLoadPackProgress({ stage: 'quests', message: 'Locating FTB Quests data files...', progress: 36 })
      const importResult = await apiImportFtbQuests(project.path)
      setLoadPackProgress({ stage: 'quests', message: `Found ${importResult.chapter_count} chapters, ${importResult.quest_count} quests`, progress: 55 })

      // Save quest graph to database
      if (importResult.graph && importResult.graph.chapters.length > 0) {
        setLoadPackProgress({ stage: 'quests', message: 'Saving quest graph to database...', progress: 60 })
        await apiSaveQuestGraph(project.id, importResult.graph)
      }

      // Stage 3: Scan + load mods (file-by-file via the returned mod list)
      setLoadPackProgress({ stage: 'mods', message: 'Scanning instance mods folder...', progress: 64 })
      const scannedMods = await apiScanInstanceMods(project.id)
      setLoadPackProgress({ stage: 'mods', message: `Found ${scannedMods.length} mods in instance`, progress: 72 })

      setLoadPackProgress({ stage: 'mods', message: 'Loading mod details...', progress: 78 })
      await modState.loadProjectMods(project.id)

      // Stage 4: Load configs
      setLoadPackProgress({ stage: 'mods', message: 'Loading config files...', progress: 86 })
      await configState.loadConfigFiles()

      // Stage 5: Scan pack recipes (mod jars + vanilla data + KubeJS/CT) into
      // the recipe store. Cache-aware, so repeat opens are instant.
      setLoadPackProgress({ stage: 'recipes', message: 'Scanning pack recipes...', progress: 88 })
      const discovered = await apiScanPackRecipes(project.path)
      setLoadPackProgress({
        stage: 'recipes',
        message: `Found ${discovered.length} recipes across the pack`,
        progress: 92,
      })
      // Preserve origin/source/editable so read-only jar recipes are marked and
      // pack-health skips them.
      const discoveredWithMeta = discovered.map((r) => ({
        ...r.recipe,
        origin: r.origin,
        source: r.source,
        editable: r.editable,
        sourceLines: r.span ?? undefined,
      }))
      useRecipeStore.getState().loadRecipesFromPack(discoveredWithMeta)

      // Stage 6: Prepare quest/progression/recipe data
      setLoadPackProgress({ stage: 'recipes', message: 'Preparing editor data...', progress: 94 })

      // Complete
      setLoadPackProgress({ stage: 'complete', message: 'Pack loaded successfully!', progress: 100 })
      setPackLoaded(true)

      // Auto-close modal after brief delay
      setTimeout(() => setShowLoadPack(false), 1500)
      return true
    } catch (e: any) {
      const msg = typeof e === 'string' ? e : e?.message || String(e)
      console.error('[Frontend] Load pack failed:', msg)
      setLoadPackProgress({ stage: 'error', message: 'Failed to load pack', progress: 0, error: msg })
      // Restore the prior loaded state so a failed refresh does not strand the
      // workspace in a half-loaded state.
      setPackLoaded(wasLoaded)
      return false
    }
  }, [modState, configState])

  /** Open a pack: enter the workspace and run the full cache-aware load. */
  async function openPack(project: Project) {
    if (!project.path) return
    projectState.openPack(project)
    const ok = await runLoadPipeline(project, false, false)
    if (!ok) {
      // Roll back to the launcher; the modal keeps showing the error.
      projectState.closePack()
      setPackLoaded(false)
      setIngestResult(null)
      setIngestError('')
      modState.resetModState()
      modState.setSearchQuery('')
      modState.setSearchResults([])
      configState.resetConfigState()
    }
  }

  /** Re-run the load pipeline against the open pack (manual Refresh). */
  async function refreshPack(force: boolean) {
    const project = projectState.openProject
    if (!project) return
    await runLoadPipeline(project, force, true)
  }

  /** Create a project, then open it (full cache-aware load). */
  async function handleCreateProject() {
    const project = await projectState.handleCreateProject()
    if (project) {
      setActiveTab('mods')
      await openPack(project)
    }
  }

  /** Dismiss the load modal. If a fresh open failed, also leave the workspace. */
  function dismissLoadModal() {
    setShowLoadPack(false)
    if (!packLoaded && projectState.openProject) {
      closePack()
    }
  }

  function closePack() {
    setPackLoaded(false)
    setIngestResult(null)
    setIngestError('')
    projectState.closePack()
    modState.resetModState()
    modState.setSearchQuery('')
    modState.setSearchResults([])
    configState.resetConfigState()
  }

  /** Leave the pack, guarding against a dirty config editor. */
  function requestClosePack() {
    if (configState.configDirty) {
      setShowLeavePack(true)
    } else {
      closePack()
    }
  }

  async function saveAndClosePack() {
    setShowLeavePack(false)
    if (configState.configDirty) {
      await configState.saveConfigFile()
    }
    closePack()
  }

  function discardAndClosePack() {
    setShowLeavePack(false)
    closePack()
  }

  function cancelLeavePack() {
    setShowLeavePack(false)
  }

  useEffect(() => {
    projectState.loadProjects()

    const onVisibility = () => {
      if (document.visibilityState === 'visible') projectState.loadProjects()
    }
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Prune stale per-instance caches (old scans/instances leave junk that can
  // total gigabytes). Runs once after the project list loads, keeping caches
  // for every known project path + mods dir.
  const prunedRef = useRef(false)
  useEffect(() => {
    if (prunedRef.current || projectState.projects.length === 0) return
    prunedRef.current = true
    import('../services/recipes').then(({ pruneCaches }) => {
      const instancePaths = projectState.projects.map((p) => p.path)
      const modsDirs = projectState.projects.map((p) => `${p.path}/mods`)
      pruneCaches(instancePaths, modsDirs).catch(() => {})
    })
  }, [projectState.projects])

  // Auto-reopen the last-opened pack on launch: after the project list loads,
  // if a last-project id was stored and matches a known project, open it (full
  // cache-aware load). The heavy stages are cache-validated, so reopen is fast
  // when caches are warm. Otherwise stay on the launcher.
  useEffect(() => {
    if (autoReopenDone.current) return
    const id = projectState.getLastProjectId()
    if (!id) {
      autoReopenDone.current = true
      return
    }
    // Wait for the project list to actually load before giving up.
    if (projectState.projects.length === 0) return
    const target = projectState.projects.find((p) => p.id === id)
    if (!target) {
      autoReopenDone.current = true
      return
    }
    autoReopenDone.current = true
    setActiveTab('mods')
    openPack(target)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectState.projects])

  // Drag-and-drop pack import: the native dialog can hang on some Wayland
  // setups, so dropping a pack file onto the window is a reliable alternative.
  // Tauri's drag-drop event carries real absolute paths (unlike a hidden
  // <input type="file">, which does not expose paths on WebKitGTK).
  useEffect(() => {
    let unlisten: (() => void) | undefined
    getCurrentWindow().onDragDropEvent((event) => {
      if (event.payload.type !== 'drop') return
      const pack = event.payload.paths.find((p) => /\.(zip|mrpack|toml)$/i.test(p))
      if (!pack) return
      setImportPath(pack)
      setImportError('')
      setImportResult(null)
      setShowImport(true)
    }).then((u) => { unlisten = u })
    return () => { unlisten?.() }
  }, [])

  async function pickImportPath() {
    try {
      const path = await pickImportFile()
      if (path) setImportPath(path)
    } catch (e) {
      console.error('Failed to pick import path:', e)
    }
  }

  async function importPack() {
    if (!importPath) return
    setIsImporting(true)
    setImportError('')
    setImportResult(null)

    try {
      const result = await autoImportPack(importPath)
      setImportResult(result)
      await projectState.loadProjects()
    } catch (e: any) {
      setImportError(typeof e === 'string' ? e : e?.message || String(e))
    } finally {
      setIsImporting(false)
    }
  }

  async function exportMrpack() {
    if (!openProject) return
    setIsExporting(true)
    setExportError('')
    try {
      const path = await exportModrinthMrpack(openProject.id)
      setExportPath(path)
      setExportError('')
    } catch (e: any) {
      setExportError(typeof e === 'string' ? e : e?.message || String(e))
    } finally {
      setIsExporting(false)
    }
  }

  async function exportCurseforge() {
    if (!openProject) return
    setIsExporting(true)
    setExportError('')
    try {
      const path = await exportCurseforgeZip(openProject.id)
      setExportPath(path)
      setExportError('')
    } catch (e: any) {
      setExportError(typeof e === 'string' ? e : e?.message || String(e))
    } finally {
      setIsExporting(false)
    }
  }

  function handleTabChange(tab: 'mods' | 'configs' | 'progression' | 'quests' | 'recipes' | 'health') {
    setActiveTab(tab)
    if (tab === 'configs' && openProject) {
      configState.loadConfigFiles()
    }
  }

  function resetImportState() {
    setImportPath('')
    setImportResult(null)
    setImportError('')
  }

  function handleCloseImport() {
    setShowImport(false)
    resetImportState()
  }

  function handleImportDone() {
    setShowImport(false)
    setImportPath('')
    setImportResult(null)
  }

  function handleCloseExport() {
    setShowExport(false)
    setExportPath('')
    setExportError('')
  }

  async function handleConfirmDelete() {
    const wasOpen = !!projectState.openProject
    const success = await projectState.handleConfirmDelete()
    if (success) {
      if (wasOpen) {
        closePack()
      } else {
        modState.setSearchQuery('')
        modState.setSearchResults([])
      }
      setActiveTab('mods')
    }
  }

  return {
    ...projectState,
    ...modState,
    ...configState,
    ...launchState,
    activeTab,
    showImport, setShowImport,
    importPath, setImportPath,
    importResult,
    isImporting,
    importError,
    showExport, setShowExport,
    isExporting,
    exportError,
    exportPath,
    handleTabChange,
    handleCloseImport,
    handleImportDone,
    resetImportState,
    handleCloseExport,
    handleConfirmDelete,
    pickImportPath,
    importPack,
    exportMrpack,
    exportCurseforge,
    openPrismLauncher,
    runIngestion,
    ingestResult,
    ingesting,
    ingestError,
    showLoadPack,
    setShowLoadPack,
    loadPackProgress,
    packLoaded,
    openPack,
    refreshPack,
    closePack,
    dismissLoadModal,
    showLeavePack,
    requestClosePack,
    saveAndClosePack,
    discardAndClosePack,
    cancelLeavePack,
    handleCreateProject,
  }
}
