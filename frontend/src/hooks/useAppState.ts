import { useState, useEffect } from 'react'
import { open } from '@tauri-apps/plugin-dialog'
import {
  getCurseforgeApiKey,
  setCurseforgeApiKey as apiSetCurseforgeApiKey,
  autoImportPack,
  exportModrinthMrpack,
  exportCurseforgeZip,
  openPrismLauncher,
} from '../services/api'
import { useProjectState, type Project } from './useProjectState'
import { useModState } from './useModState'
import { useConfigState } from './useConfigState'
import { useLaunchState } from './useLaunchState'

export type { Project } from './useProjectState'
export type { ModDependency, ModMetadata, CompatibilityIssue, CompatibilityResult } from './useModState'

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
  }
}
