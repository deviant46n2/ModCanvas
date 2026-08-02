import { useState, useEffect, useCallback } from 'react'
import { open } from '@tauri-apps/plugin-dialog'
import {
  getCurseforgeApiKey,
  setCurseforgeApiKey as apiSetCurseforgeApiKey,
  autoImportPack,
  exportModrinthMrpack,
  exportCurseforgeZip,
  openPrismLauncher,
  ingestActiveInstance as apiIngestActiveInstance,
  scanInstanceMods as apiScanInstanceMods,
  importFtbQuestsFromDir as apiImportFtbQuests,
  saveQuestGraph as apiSaveQuestGraph,
} from '../services/api'
import { useProjectState, type Project } from './useProjectState'
import { useModState } from './useModState'
import { useConfigState } from './useConfigState'
import { useLaunchState } from './useLaunchState'
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
  const { selectedProject } = projectState
  const modState = useModState(selectedProject)
  const configState = useConfigState(selectedProject)
  const launchState = useLaunchState(selectedProject)

  const [activeTab, setActiveTab] = useState<'mods' | 'configs' | 'progression' | 'quests' | 'recipes'>('mods')

  const [showImport, setShowImport] = useState(false)
  const [importPath, setImportPath] = useState('')
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const [isImporting, setIsImporting] = useState(false)
  const [importError, setImportError] = useState('')

  const [showExport, setShowExport] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [exportError, setExportError] = useState('')
  const [exportPath, setExportPath] = useState('')

  const [showSettings, setShowSettings] = useState(false)
  const [curseforgeApiKey, setCurseforgeApiKey] = useState('')
  const [settingsSaving, setSettingsSaving] = useState(false)
  const [settingsMessage, setSettingsMessage] = useState('')

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

  async function loadPack(project: Project) {
    if (!project.path) return
    setPackLoaded(false)
    setShowLoadPack(true)
    setLoadPackProgress({ stage: 'textures', message: 'Preparing to scan textures...', progress: 5 })
    
    // Yield to let modal render first
    await new Promise(r => setTimeout(r, 0))

    try {
      // Stage 1: Ingest textures
      setLoadPackProgress({ stage: 'textures', message: 'Scanning JAR files...', progress: 10 })
      console.log('[Frontend] Load Pack - calling ingest for path:', project.path)
      const ingestResult = await apiIngestActiveInstance(project.path)
      console.log('[Frontend] Ingest result:', {
        textures_indexed: ingestResult.textures_indexed,
        jars_scanned: ingestResult.jars_scanned,
      })
      setIngestResult(ingestResult)
      setLoadPackProgress({ stage: 'textures', message: `Indexed ${ingestResult.textures_indexed} textures from ${ingestResult.jars_scanned} mods`, progress: 30 })

      // Stage 2: Import FTB Quests
      setLoadPackProgress({ stage: 'quests', message: 'Reading FTB Quests data...', progress: 40 })
      const importResult = await apiImportFtbQuests(project.path)
      setLoadPackProgress({ stage: 'quests', message: `Found ${importResult.chapter_count} chapters, ${importResult.quest_count} quests`, progress: 55 })
      
      // Save quest graph to database
      if (importResult.graph && importResult.graph.chapters.length > 0) {
        setLoadPackProgress({ stage: 'quests', message: 'Saving quest graph to database...', progress: 65 })
        await apiSaveQuestGraph(project.id, importResult.graph)
      }

      // Stage 3: Load mods
      setLoadPackProgress({ stage: 'mods', message: 'Scanning instance mods folder...', progress: 70 })
      await apiScanInstanceMods(project.id)
      setLoadPackProgress({ stage: 'mods', message: 'Loading mod metadata...', progress: 80 })
      await modState.loadProjectMods(project.id)

      // Stage 4: Load configs
      setLoadPackProgress({ stage: 'mods', message: 'Loading config files...', progress: 90 })
      await configState.loadConfigFiles()

      // Complete
      setLoadPackProgress({ stage: 'complete', message: 'Pack loaded successfully!', progress: 100 })
      setPackLoaded(true)
      
      // Auto-close modal after brief delay
      setTimeout(() => setShowLoadPack(false), 1500)
    } catch (e: any) {
      const msg = typeof e === 'string' ? e : e?.message || String(e)
      console.error('[Frontend] Load pack failed:', msg)
      setLoadPackProgress({ stage: 'error', message: 'Failed to load pack', progress: 0, error: msg })
    }
  }

  function closePack() {
    setPackLoaded(false)
    setIngestResult(null)
    setIngestError('')
    projectState.handleCloseProject()
    modState.setSearchQuery('')
    modState.setSearchResults([])
  }

  useEffect(() => {
    projectState.loadProjects()
    loadCurseforgeApiKey()

    const onVisibility = () => {
      if (document.visibilityState === 'visible') projectState.loadProjects()
    }
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  useEffect(() => {
    if (selectedProject) {
      modState.loadProjectMods(selectedProject.id)
      modState.resetModState()
      configState.resetConfigState()
    }
  }, [selectedProject])

  async function loadCurseforgeApiKey() {
    try {
      const key = await getCurseforgeApiKey()
      if (key) setCurseforgeApiKey(key)
    } catch (e) {
      console.error('Failed to load CurseForge API key:', e)
    }
  }

  async function saveCurseforgeApiKey() {
    setSettingsSaving(true)
    setSettingsMessage('')
    try {
      await apiSetCurseforgeApiKey(curseforgeApiKey)
      setSettingsMessage('API key saved successfully')
    } catch (e) {
      setSettingsMessage(`Error: ${e}`)
    } finally {
      setSettingsSaving(false)
    }
  }

  async function pickImportPath() {
    try {
      const path = await open({
        filters: [
          { name: 'Modpack Files', extensions: ['mrpack', 'toml', 'zip'] },
          { name: 'All Files', extensions: ['*'] }
        ],
        multiple: false,
        directory: false
      })
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
    if (!selectedProject) return
    setIsExporting(true)
    setExportError('')
    try {
      const path = await exportModrinthMrpack(selectedProject.id)
      setExportPath(path)
      setExportError('')
    } catch (e: any) {
      setExportError(typeof e === 'string' ? e : e?.message || String(e))
    } finally {
      setIsExporting(false)
    }
  }

  async function exportCurseforge() {
    if (!selectedProject) return
    setIsExporting(true)
    setExportError('')
    try {
      const path = await exportCurseforgeZip(selectedProject.id)
      setExportPath(path)
      setExportError('')
    } catch (e: any) {
      setExportError(typeof e === 'string' ? e : e?.message || String(e))
    } finally {
      setIsExporting(false)
    }
  }

  function handleTabChange(tab: 'mods' | 'configs' | 'progression' | 'quests' | 'recipes') {
    setActiveTab(tab)
    if (tab === 'configs' && selectedProject) {
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

  function handleCloseSettings() {
    setShowSettings(false)
    setSettingsMessage('')
  }

  async function handleConfirmDelete() {
    const success = await projectState.handleConfirmDelete()
    if (success) {
      setActiveTab('mods')
      modState.setSearchQuery('')
      modState.setSearchResults([])
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
    showSettings, setShowSettings,
    curseforgeApiKey, setCurseforgeApiKey,
    settingsSaving,
    settingsMessage,
    handleTabChange,
    handleCloseImport,
    handleImportDone,
    resetImportState,
    handleCloseExport,
    handleCloseSettings,
    handleConfirmDelete,
    loadCurseforgeApiKey,
    saveCurseforgeApiKey,
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
    loadPack,
    closePack,
  }
}
