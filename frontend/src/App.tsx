import { useState, useEffect, useRef, useMemo } from 'react'
import './App.css'
import {
  listProjects,
  getCurseforgeApiKey,
  setCurseforgeApiKey as apiSetCurseforgeApiKey,
  getProjectMods,
  getProjectModMetadata,
  getDepNames,
  checkCompatibility,
  listConfigFiles,
  readConfigFile,
  parseConfigFile,
  saveStructuredConfig,
  writeConfigFile,
  addMod,
  removeMod,
  autoImportPack,
  exportModrinthMrpack,
  exportCurseforgeZip,
  createProject,
  searchMods,
  saveProject,
  testProject,
  openPrismLauncher,
  deleteProject,
  scanInstanceMods,
  deployCompanionMod,
  wsIpcGetStatus,
  type WsConnectionStatus,
} from './services/api'
import { listen } from '@tauri-apps/api/event'
import { open } from '@tauri-apps/plugin-dialog'
import { ToastProvider } from './components/ui/Toast'
import { globalAssetCache, CanvasThemeProvider } from './core/theme'
import { ErrorBoundary } from './components/ui/ErrorBoundary'
import ProgressionGraph from './ProgressionGraph'
import QuestBookEditor from './QuestBookEditor'
import RecipeEditor from './RecipeEditor'
import { debounce } from './core/utils/debounce'
import { List, type RowComponentProps } from 'react-window'

interface Project {
  id: string
  name: string
  description: string
  minecraft_version: string
  mod_loader: string
  pack_version: string
  author: string
  created_at: string
  updated_at: string
  path: string
}

interface ImportResult {
  project: Project
  mods: Array<{ mod_id: string; slug: string; name: string; version: string; source: string }>
  unresolved_mods: Array<{ file_name: string; mod_id: string | null; version: string | null; loader: string | null }>
  config_files: Array<{ path: string; content: string; format: string }>
}

interface ModDependency {
  mod_id: string
  dependency_type: string
}

interface ModMetadata {
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
}

interface CompatibilityIssue {
  severity: string
  message: string
  affected_mods: string[]
  affected_mod_names: string[]
}

interface CompatibilityResult {
  compatible: boolean
  issues: CompatibilityIssue[]
  warnings: string[]
}

interface ConfigFileInfo {
  path: string
  name: string
  format: string
  size: number
}

interface ConfigValue {
  type: string
  value?: string | number | boolean
  fields?: Record<string, ConfigValue>
  items?: ConfigValue[]
  options?: string[]
  comment?: string
  min?: number
  max?: number
  step?: number
  unit?: string
}

interface ParsedConfig {
  format: string
  root: ConfigValue
  raw: string
}

function App() {
  const [projects, setProjects] = useState<Project[]>([])
  const [selectedProject, setSelectedProject] = useState<Project | null>(null)
  const [showNewProject, setShowNewProject] = useState(false)
  const [newProjectName, setNewProjectName] = useState('')
  const [mcVersion, setMcVersion] = useState('1.21.1')
  const [modLoader, setModLoader] = useState('Forge')
  const [activeTab, setActiveTab] = useState<'mods' | 'configs' | 'progression' | 'quests' | 'recipes'>('mods')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<ModMetadata[]>([])
  const [projectMods, setProjectMods] = useState<any[]>([])
  const [modFilter, setModFilter] = useState('')
  const [modFilterInput, setModFilterInput] = useState('')
  const [confirmCloseProject, setConfirmCloseProject] = useState(false)

  // Metadata state
  const [modMetadata, setModMetadata] = useState<Map<string, ModMetadata>>(new Map())
  const [depNameMap, setDepNameMap] = useState<Map<string, string>>(new Map())
  const [isLoadingMetadata, setIsLoadingMetadata] = useState(false)

  // Compatibility state
  const [compatResult, setCompatResult] = useState<CompatibilityResult | null>(null)
  const [isCheckingCompat, setIsCheckingCompat] = useState(false)

  // Test instance state
  const [testProgress, setTestProgress] = useState('')
  const [testError, setTestError] = useState('')
  const [isTesting, setIsTesting] = useState(false)
  const unlistenRef = useRef<(() => void) | null>(null)

  // WebSocket IPC state
  const [wsStatus, setWsStatus] = useState<WsConnectionStatus>({ connected: false, client_count: 0, port: 9876 })

  // Import state
  const [showImport, setShowImport] = useState(false)
  const [importPath, setImportPath] = useState('')
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const [isImporting, setIsImporting] = useState(false)
  const [importError, setImportError] = useState('')

  // Export state
  const [showExport, setShowExport] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [exportError, setExportError] = useState('')
  const [exportPath, setExportPath] = useState('')

  // Deploy companion state
  const [deployCompanionMessage, setDeployCompanionMessage] = useState('')

  // Settings state
  const [showSettings, setShowSettings] = useState(false)
  const [curseforgeApiKey, setCurseforgeApiKey] = useState('')
  const [settingsSaving, setSettingsSaving] = useState(false)
  const [settingsMessage, setSettingsMessage] = useState('')

  // Config state
  const [configFiles, setConfigFiles] = useState<ConfigFileInfo[]>([])
  const [selectedConfig, setSelectedConfig] = useState<ConfigFileInfo | null>(null)
  const [configContent, setConfigContent] = useState('')
  const [configSaving, setConfigSaving] = useState(false)
  const [parsedConfig, setParsedConfig] = useState<ParsedConfig | null>(null)
  const [configMode, setConfigMode] = useState<'structured' | 'raw'>('structured')
  const [configUndoStack, setConfigUndoStack] = useState<ConfigValue[]>([])

  // Debounced filter and memoized filtered mods
  const debouncedSetModFilter = useMemo(
    () => debounce((value: string) => setModFilter(value), 300),
    [],
  )
  const filteredMods = useMemo(() => {
    return projectMods.filter(mod =>
      !modFilter ||
      mod.name.toLowerCase().includes(modFilter.toLowerCase()) ||
      mod.author.toLowerCase().includes(modFilter.toLowerCase())
    )
  }, [projectMods, modFilter])

  useEffect(() => {
    loadProjects()
    loadCurseforgeApiKey()

    const onVisibility = () => {
      if (document.visibilityState === 'visible') loadProjects()
    }
    document.addEventListener('visibilitychange', onVisibility)

    // Listen for WebSocket IPC status changes
    const setupWsListeners = async () => {
      const unlistenWsStatus = await listen<WsConnectionStatus>('ws-ipc:status', (event) => {
        setWsStatus(event.payload)
      })
      const unlistenWsEvent = await listen('ws-ipc:event', (event) => {
        const payload = event.payload as Record<string, unknown> | undefined
        const eventType = payload?.event as string | undefined
        console.log('[ModCanvas] Received WebSocket event from Minecraft:', eventType, payload)

        if (eventType === 'ASSETS_READY' && payload?.payload) {
          globalAssetCache.processAssetsReady(payload.payload).catch((err: unknown) => {
            console.error('[ModCanvas] Failed to process assets:', err)
          })
        }
      })

      // Sync current status in case events were emitted before listener was registered
      const currentStatus = await wsIpcGetStatus()
      if (!cancelled) setWsStatus(currentStatus)

      return () => {
        unlistenWsStatus()
        unlistenWsEvent()
      }
    }

    let cancelled = false
    setupWsListeners().then(cleanup => {
      if (cancelled) { cleanup() } else { unlistenRef.current = cleanup }
    })

    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      cancelled = true
      unlistenRef.current?.()
    }
  }, [])

  useEffect(() => {
    if (selectedProject) {
      loadProjectMods(selectedProject.id)
      setSearchQuery('')
      setSearchResults([])
      setModFilter('')
      setModFilterInput('')
      setModMetadata(new Map())
      setDepNameMap(new Map())
      setCompatResult(null)
      setConfigFiles([])
      setSelectedConfig(null)
      setConfigContent('')
    }
  }, [selectedProject])

  async function loadProjects() {
    try {
      const result = await listProjects()
      setProjects(result)
    } catch (e) {
      console.error('Failed to load projects:', e)
    }
  }

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
      const map = new Map<string, ModMetadata>()
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
        console.log('[ModCanvas] Fetching names for dep IDs:', depIdsArray)
        const depNames = await getDepNames(depIdsArray)
        console.log('[ModCanvas] Got dep names:', depNames)
        const nameMap = new Map<string, string>()
        for (const d of depNames) {
          nameMap.set(d.mod_id, d.name)
          nameMap.set(d.slug, d.name)
        }
        setDepNameMap(nameMap)
        console.log('[ModCanvas] depNameMap size:', nameMap.size)
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

  async function loadConfigFiles() {
    if (!selectedProject) return
    try {
      const files = await listConfigFiles(selectedProject.id)
      setConfigFiles(files)
    } catch (e) {
      console.error('Failed to load config files:', e)
    }
  }

  async function openConfigFile(file: ConfigFileInfo) {
    try {
      const content = await readConfigFile(file.path)
      setSelectedConfig(file)
      setConfigContent(content)
      setConfigMode('structured')
      setConfigUndoStack([])

      // Try to parse as structured config
      try {
        const parsed = await parseConfigFile(file.path)
        setParsedConfig(parsed)
      } catch {
        // Fall back to raw mode if parsing fails
        setParsedConfig(null)
        setConfigMode('raw')
      }
    } catch (e) {
      console.error('Failed to read config file:', e)
    }
  }

  async function saveConfigFile() {
    if (!selectedConfig) return
    setConfigSaving(true)
    try {
      if (configMode === 'structured' && parsedConfig) {
        await saveStructuredConfig(selectedConfig.path, parsedConfig.root)
      } else {
        await writeConfigFile(selectedConfig.path, configContent)
      }
    } catch (e) {
      console.error('Failed to save config file:', e)
    } finally {
      setConfigSaving(false)
    }
  }

  function updateConfigValue(path: string[], value: ConfigValue) {
    if (!parsedConfig) return

    // Push to undo stack
    setConfigUndoStack((prev) => [...prev, JSON.parse(JSON.stringify(parsedConfig.root))])

    // Deep clone the root
    const newRoot = JSON.parse(JSON.stringify(parsedConfig.root)) as ConfigValue

    // Navigate to the correct position and update
    let current = newRoot
    for (let i = 0; i < path.length - 1; i++) {
      if (current.type === 'object' && current.fields) {
        current = current.fields[path[i]]
      } else if (current.type === 'group' && current.fields) {
        current = current.fields[path[i]]
      } else if (current.type === 'array' && current.items) {
        current = current.items[parseInt(path[i])]
      }
    }

    const lastKey = path[path.length - 1]
    if (current.type === 'object' && current.fields) {
      current.fields[lastKey] = value
    } else if (current.type === 'group' && current.fields) {
      current.fields[lastKey] = value
    } else if (current.type === 'array' && current.items) {
      current.items[parseInt(lastKey)] = value
    }

    setParsedConfig({ ...parsedConfig, root: newRoot })
  }

  function undoConfigChange() {
    if (configUndoStack.length === 0 || !parsedConfig) return
    const prev = configUndoStack[configUndoStack.length - 1]
    setConfigUndoStack((s) => s.slice(0, -1))
    setParsedConfig({ ...parsedConfig, root: prev })
  }

  async function addModToProject(mod: any) {
    if (!selectedProject) return
    try {
      await addMod(
        selectedProject.id,
        mod.mod_id,
        mod.slug,
        mod.name,
        mod.version || '',
        mod.description || '',
        mod.author || '',
        'Modrinth',
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
      await removeMod(selectedProject.id, mod.mod_id)
      await addMod(
        selectedProject.id,
        mod.mod_id,
        mod.slug,
        mod.name,
        mod.version || '',
        mod.description || '',
        mod.author || '',
        mod.source || 'Modrinth',
        !mod.enabled,
      )
      await loadProjectMods(selectedProject.id)
    } catch (e) {
      console.error('Failed to toggle mod:', e)
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
      await loadProjects()
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

  async function handleCreateProject() {
    try {
      const project = await createProject(
        newProjectName,
        mcVersion,
        modLoader,
        `~/modpacks/${newProjectName.toLowerCase().replace(/\s+/g, '-')}`,
      )
      setProjects([project, ...projects])
      setSelectedProject(project)
      setShowNewProject(false)
      setNewProjectName('')
    } catch (e) {
      console.error('Failed to create project:', e)
    }
  }

  async function handleSearchMods() {
    if (!searchQuery || !selectedProject) return
    try {
      const results = await searchMods(
        searchQuery,
        selectedProject.mod_loader,
        selectedProject.minecraft_version,
      )
      setSearchResults(results)
    } catch (e) {
      console.error('Failed to search mods:', e)
    }
  }

  async function handleSaveProject() {
    if (!selectedProject) return
    try {
      await saveProject(selectedProject.id)
    } catch (e) {
      console.error('Failed to save project:', e)
    }
  }

  async function handleTestProject() {
    if (!selectedProject) return
    setTestError('')
    setIsTesting(true)
    setTestProgress('Preparing test instance...')

    try {
      await testProject(selectedProject.id, 'Player', '2G', '4G')
      setTestProgress('Test instance launched!')
    } catch (e: any) {
      console.error('[ModCanvas] test_project failed:', e)
      setTestError(typeof e === 'string' ? e : e?.message || String(e))
    } finally {
      setIsTesting(false)
    }
  }

  async function handleDeployCompanion() {
    if (!selectedProject) return
    setDeployCompanionMessage('Deploying...')
    try {
      await deployCompanionMod(selectedProject.id)
      setDeployCompanionMessage('\u2713 Companion mod deployed')
      setTimeout(() => setDeployCompanionMessage(''), 3000)
    } catch (e: any) {
      setDeployCompanionMessage('\u2717 ' + (e?.message || String(e)))
      setTimeout(() => setDeployCompanionMessage(''), 5000)
    }
  }

  function getMissingDependencies(modId: string): ModDependency[] {
    const meta = modMetadata.get(modId)
    if (!meta) return []
    return meta.dependencies.filter(dep => {
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

  function handleTabChange(tab: 'mods' | 'configs' | 'progression' | 'quests' | 'recipes') {
    setActiveTab(tab)
    if (tab === 'configs' && selectedProject) {
      loadConfigFiles()
    }
  }

  return (
    <ToastProvider>
      <ErrorBoundary>
        <div className="app">
      <aside className="sidebar">
        <div className="sidebar-header">
          <h1>ModCanvas</h1>
          <button className="btn-icon" onClick={() => setShowSettings(true)} title="Settings" aria-label="Settings">{'\u2699'}</button>
        </div>

        <div className="sidebar-section">
          <div className="section-header">
            <h3>Projects</h3>
            <div style={{ display: 'flex', gap: '4px' }}>
              <button className="btn-icon" onClick={async () => { await openPrismLauncher() }} title="Browse Modpacks in Prism Launcher" aria-label="Browse Modpacks in Prism Launcher">{'\uD83D\uDD0D'}</button>
              <button className="btn-icon" onClick={loadProjects} title="Refresh Instances from Prism" aria-label="Refresh instances">{'\u21BB'}</button>
              <button className="btn-icon" onClick={() => setShowImport(true)} title="Import Modpack" aria-label="Import modpack">{'\u2193'}</button>
              <button className="btn-icon" onClick={() => setShowNewProject(true)} title="Create new project" aria-label="Create new project">+</button>
            </div>
          </div>
          <div className="project-list">
            {projects.map((project) => (
              <div
                key={project.id}
                className={`project-item ${selectedProject?.id === project.id ? 'active' : ''}`}
                onClick={() => setSelectedProject(project)}
              >
                <div className="project-name">{project.name}</div>
                <div className="project-meta">
                  MC {project.minecraft_version} &bull; {project.mod_loader}
                </div>
              </div>
            ))}
          </div>
        </div>
      </aside>

      <main className="main-content">
        {showNewProject && (
          <div className="modal-overlay" onClick={() => setShowNewProject(false)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <h2>New Project</h2>
              <div className="form-group">
                <label>Project Name</label>
                <input
                  type="text"
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  placeholder="My Modpack"
                />
              </div>
              <div className="form-group">
                <label>Minecraft Version</label>
                <select value={mcVersion} onChange={(e) => setMcVersion(e.target.value)}>
                  <option value="1.21.1">1.21.1</option>
                  <option value="1.20.1">1.20.1</option>
                  <option value="1.19.2">1.19.2</option>
                </select>
              </div>
              <div className="form-group">
                <label>Mod Loader</label>
                <select value={modLoader} onChange={(e) => setModLoader(e.target.value)}>
                  <option value="Forge">Forge</option>
                  <option value="NeoForge">NeoForge</option>
                  <option value="Fabric">Fabric</option>
                  <option value="Quilt">Quilt</option>
                </select>
              </div>
              <div className="modal-actions">
                <button className="btn-secondary" onClick={() => setShowNewProject(false)}>Cancel</button>
                <button className="btn-primary" onClick={handleCreateProject}>Create</button>
              </div>
            </div>
          </div>
        )}

        {selectedProject ? (
          <div className="project-workspace">
            <div className="workspace-header">
              <h2>{selectedProject.name}</h2>
              <div className="workspace-meta">
                MC {selectedProject.minecraft_version} &bull; {selectedProject.mod_loader} &bull; v{selectedProject.pack_version}
              </div>
              <div className="workspace-status">
                <span 
                  className={`ws-status ${wsStatus.connected ? 'connected' : 'disconnected'}`}
                  title={`WebSocket: ${wsStatus.connected ? 'Minecraft Connected' : 'Offline / Idle'} \u2022 Port: ${wsStatus.port} \u2022 Clients: ${wsStatus.client_count}`}
                >
                  {wsStatus.connected ? '\uD83D\uDFE2' : '\u26AA'}
                  <span>{wsStatus.connected ? 'Minecraft Connected' : 'Offline / Idle'}</span>
                </span>
              </div>
              <div className="instance-actions">
                <button className="btn-secondary" onClick={handleSaveProject}>Save</button>
                <button className="btn-success" onClick={handleTestProject} disabled={isTesting}>
                  {isTesting ? 'Testing...' : 'Test'}
                </button>
                <button className="btn-secondary" onClick={handleDeployCompanion}>Deploy Companion</button>
                <button className="btn-secondary" onClick={() => setShowExport(true)}>Export</button>
                <button className="btn-danger" onClick={() => setConfirmCloseProject(true)}>
                  Delete
                </button>
              </div>
              {deployCompanionMessage && (
                <div className="deploy-companion-message" style={{ marginTop: 8, fontSize: 13, color: deployCompanionMessage.startsWith('\u2717') ? '#e74c3c' : '#27ae60' }}>
                  {deployCompanionMessage}
                </div>
              )}
            </div>

            {testProgress && (
              <div className="launch-progress">
                <div className="progress-phase">{testProgress}</div>
              </div>
            )}

            {testError && (
              <div className="launch-error">
                <div className="error-header">
                  <strong>Test Error:</strong>
                  <button className="btn-copy" onClick={() => navigator.clipboard.writeText(testError)} aria-label="Copy error text">Copy</button>
                </div>
                <pre className="copyable">{testError}</pre>
              </div>
            )}
            <div className="workspace-tabs" role="tablist">
              {(['mods', 'configs', 'progression', 'quests', 'recipes'] as const).map((tab) => (
                <button
                  key={tab}
                  id={`tab-${tab}`}
                  role="tab"
                  aria-selected={activeTab === tab}
                  aria-controls={`tabpanel-${tab}`}
                  className={`tab ${activeTab === tab ? 'active' : ''}`}
                  onClick={() => handleTabChange(tab)}
                >
                  {tab.charAt(0).toUpperCase() + tab.slice(1)}
                </button>
              ))}
            </div>
            <div className="workspace-content">
              {activeTab === 'mods' && (
                <ErrorBoundary>
                <div className="mods-panel" id="tabpanel-mods" role="tabpanel" aria-labelledby="tab-mods">
                  <div className="mods-section">
                    <div className="section-header">
                      <h3>Project Mods ({projectMods.length})</h3>
                      <div className="section-actions">
                        <button
                          className="btn-secondary btn-sm"
                          onClick={handleScanInstanceMods}
                          disabled={!selectedProject}
                          title="Scan instance's mods folder and populate database"
                        >
                          Scan Instance Mods
                        </button>
                        <button
                          className="btn-secondary btn-sm"
                          onClick={loadModMetadata}
                          disabled={isLoadingMetadata || projectMods.length === 0}
                        >
                          {isLoadingMetadata ? 'Loading...' : 'Load Dependencies'}
                        </button>
                        <button
                          className="btn-secondary btn-sm"
                          onClick={handleCheckCompat}
                          disabled={isCheckingCompat || projectMods.length === 0}
                        >
                          {isCheckingCompat ? 'Checking...' : 'Check Compatibility'}
                        </button>
                        <input
                          type="text"
                          placeholder="Filter mods..."
                          value={modFilterInput}
                          onChange={(e) => {
                            setModFilterInput(e.target.value)
                            debouncedSetModFilter(e.target.value)
                          }}
                          className="mod-filter"
                          aria-label="Filter mods"
                        />
                      </div>
                    </div>

                    {compatResult && (
                      <div className={`compat-panel ${compatResult.compatible ? 'compatible' : 'has-issues'}`}>
                        <div className="compat-header">
                          <span className="compat-status">
                            {compatResult.compatible ? 'All checks passed' : `${compatResult.issues.length} issue(s) found`}
                          </span>
                          <button className="btn-close" onClick={() => setCompatResult(null)} aria-label="Close compatibility results">{'\u00D7'}</button>
                        </div>
                        {compatResult.issues.length > 0 && (
                          <div className="compat-issues">
                            {compatResult.issues.map((issue, i) => (
                              <div key={i} className={`compat-issue ${issue.severity.toLowerCase()}`}>
                                <span className="issue-severity">{issue.severity}</span>
                                <span className="issue-message">{issue.message}</span>
                                <span className="issue-mods">
                                  {issue.affected_mod_names.join(' \u2194 ')}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                        {compatResult.warnings.length > 0 && (
                          <div className="compat-warnings">
                            {compatResult.warnings.map((warn, i) => (
                              <div key={i} className="compat-warning">{warn}</div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    <div className="mod-list" style={{ height: 'calc(100vh - 250px)' }}>
                      {projectMods.length === 0 ? (
                        <div className="empty-state">No mods in this project yet. Search and add mods below.</div>
                      ) : filteredMods.length === 0 ? (
                        <div className="empty-state">No mods match your filter.</div>
                      ) : (
                        <List<ModRowExtraProps>
                          style={{ height: '100%', width: '100%' }}
                          rowComponent={ModRow}
                          rowCount={filteredMods.length}
                          rowHeight={200}
                          rowProps={{
                            filteredMods,
                            modMetadata,
                            projectMods,
                            getMissingDependencies,
                            toggleModEnabled,
                            removeModFromProject,
                            getModNameById,
                          }}
                        />
                      )}
                    </div>
                  </div>

                  <div className="mods-section">
                    <div className="section-header">
                      <h3>Add Mods from Modrinth</h3>
                    </div>
                    <div className="search-bar">
                      <input
                        type="text"
                        placeholder="Search mods on Modrinth..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSearchMods()}
                        aria-label="Search mods on Modrinth"
                      />
                      <button onClick={handleSearchMods} aria-label="Search">Search</button>
                    </div>
                    <div className="search-results" style={{ height: 'calc(100vh - 480px)' }}>
                      {searchResults.length > 0 && (
                        <List<SearchResultRowExtraProps>
                          style={{ height: '100%', width: '100%' }}
                          rowComponent={SearchResultRow}
                          rowCount={searchResults.length}
                          rowHeight={80}
                          rowProps={{
                            searchResults,
                            projectMods,
                            addModToProject,
                          }}
                        />
                      )}
                    </div>
                  </div>
                </div>
                </ErrorBoundary>
              )}
              {activeTab === 'configs' && (
                <ErrorBoundary>
                <div className="configs-panel" id="tabpanel-configs" role="tabpanel" aria-labelledby="tab-configs">
                  <div className="configs-sidebar">
                    <div className="section-header">
                      <h3>Config Files ({configFiles.length})</h3>
                    </div>
                    <div className="config-file-list" style={{ height: 'calc(100vh - 300px)' }}>
                      {configFiles.length === 0 ? (
                        <div className="empty-state">No config files found. Import a modpack to get config files.</div>
                      ) : (
                        <List<ConfigRowExtraProps>
                          style={{ height: '100%', width: '100%' }}
                          rowComponent={ConfigFileRow}
                          rowCount={configFiles.length}
                          rowHeight={60}
                          rowProps={{
                            configFiles,
                            selectedConfig,
                            openConfigFile,
                          }}
                        />
                      )}
                    </div>
                  </div>
                  <div className="config-editor">
                    {selectedConfig ? (
                      <>
                        <div className="config-editor-header">
                          <span className="config-editor-filename">{selectedConfig.name}</span>
                          <div className="config-editor-actions">
                            {parsedConfig && (
                              <div className="config-mode-toggle">
                                <button
                                  className={`btn-mode ${configMode === 'structured' ? 'active' : ''}`}
                                  onClick={() => setConfigMode('structured')}
                                >
                                  Structured
                                </button>
                                <button
                                  className={`btn-mode ${configMode === 'raw' ? 'active' : ''}`}
                                  onClick={() => setConfigMode('raw')}
                                >
                                  Raw
                                </button>
                              </div>
                            )}
                            {configMode === 'structured' && configUndoStack.length > 0 && (
                              <button className="btn-secondary btn-sm" onClick={undoConfigChange}>
                                Undo
                              </button>
                            )}
                            <button className="btn-primary btn-sm" onClick={saveConfigFile} disabled={configSaving}>
                              {configSaving ? 'Saving...' : 'Save'}
                            </button>
                          </div>
                        </div>
                        {configMode === 'structured' && parsedConfig ? (
                          <div className="config-structured-editor">
                            {parsedConfig.root.type === 'object' || parsedConfig.root.type === 'group' ? (
                              Object.entries(parsedConfig.root.fields || {}).map(([key, val]) => (
                                <ConfigValueEditor
                                  key={key}
                                  value={val}
                                  path={[key]}
                                  onChange={updateConfigValue}
                                />
                              ))
                            ) : (
                              <ConfigValueEditor
                                value={parsedConfig.root}
                                path={['root']}
                                onChange={updateConfigValue}
                              />
                            )}
                          </div>
                        ) : (
                          <textarea
                            className="config-editor-textarea"
                            value={configContent}
                            onChange={(e) => setConfigContent(e.target.value)}
                            spellCheck={false}
                          />
                        )}
                      </>
                    ) : (
                      <div className="empty-state">Select a config file to edit.</div>
                    )}
                  </div>
                </div>
                </ErrorBoundary>
              )}
              {activeTab === 'progression' && selectedProject && (
                <ErrorBoundary>
                <div id="tabpanel-progression" role="tabpanel" aria-labelledby="tab-progression">
                  <ProgressionGraph projectId={selectedProject.id} />
                </div>
                </ErrorBoundary>
              )}
              {activeTab === 'quests' && selectedProject && (
                <ErrorBoundary>
                <div id="tabpanel-quests" role="tabpanel" aria-labelledby="tab-quests">
                  <CanvasThemeProvider>
                    <QuestBookEditor projectId={selectedProject.id} projectPath={selectedProject.path} wsConnected={wsStatus.connected} />
                  </CanvasThemeProvider>
                </div>
                </ErrorBoundary>
              )}
              {activeTab === 'recipes' && selectedProject && (
                <ErrorBoundary>
                <div id="tabpanel-recipes" role="tabpanel" aria-labelledby="tab-recipes">
                  <RecipeEditor projectId={selectedProject.id} projectPath={selectedProject.path} />
                </div>
                </ErrorBoundary>
              )}
            </div>
          </div>
        ) : (
          <div className="welcome">
            <div className="welcome-content">
              <h2>Welcome to ModCanvas</h2>
              <p>Select a project or create a new one to get started.</p>
            </div>
          </div>
        )}
      </main>

      {showImport && (
          <div className="modal-overlay" onClick={() => { setShowImport(false); setImportPath(''); setImportResult(null); setImportError(''); }}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <h2>Import Modpack</h2>
              <div className="form-group">
                <label>Modpack File</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    type="text"
                    value={importPath}
                    onChange={(e) => setImportPath(e.target.value)}
                    placeholder="Select .mrpack, pack.toml, or instance folder"
                    readOnly
                    style={{ flex: 1 }}
                  />
                  <button className="btn-secondary" onClick={pickImportPath} aria-label="Browse for modpack file">Browse</button>
                </div>
              </div>
              
              {importError && (
                <div className="launch-error" style={{ marginTop: '16px' }}>
                  <div className="error-header">
                    <strong>Import Error:</strong>
                    <button className="btn-copy" onClick={() => navigator.clipboard.writeText(importError)} aria-label="Copy error text">Copy</button>
                  </div>
                  <pre className="copyable">{importError}</pre>
                </div>
              )}
              
              {importResult && (
                <div style={{ marginTop: '16px', padding: '12px', background: 'var(--color-bg-surface-1)', borderRadius: '8px' }}>
                  <h4>Import Successful: {importResult.project.name}</h4>
                  <div style={{ marginTop: '8px', fontSize: '14px', color: 'var(--color-text-tertiary)' }}>
                    MC {importResult.project.minecraft_version} &bull; {importResult.project.mod_loader} &bull; {importResult.mods.length} mods
                  </div>
                  {importResult.unresolved_mods.length > 0 && (
                    <div style={{ marginTop: '8px', fontSize: '13px', color: 'var(--color-warning)' }}>
                      {importResult.unresolved_mods.length} mods could not be auto-resolved
                    </div>
                  )}
                </div>
              )}
              
              <div className="modal-actions">
                <button className="btn-secondary" onClick={() => { setShowImport(false); setImportPath(''); setImportResult(null); setImportError(''); }}>Cancel</button>
                {!importResult && <button className="btn-primary" onClick={importPack} disabled={isImporting || !importPath}>
                  {isImporting ? 'Importing...' : 'Import'}
                </button>}
                {importResult && <button className="btn-primary" onClick={() => { setShowImport(false); setImportPath(''); setImportResult(null); }}>Done</button>}
              </div>
            </div>
          </div>
        )}

      {showExport && (
          <div className="modal-overlay" onClick={() => { setShowExport(false); setExportPath(''); setExportError(''); }}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <h2>Export Modpack</h2>
              <p style={{ marginBottom: '16px', color: 'var(--color-text-secondary)' }}>
                Export <strong>{selectedProject?.name}</strong> as a modpack file.
              </p>
              
              {exportError && (
                <div className="launch-error" style={{ marginTop: '16px' }}>
                  <div className="error-header">
                    <strong>Export Error:</strong>
                    <button className="btn-copy" onClick={() => navigator.clipboard.writeText(exportError)} aria-label="Copy error text">Copy</button>
                  </div>
                  <pre className="copyable">{exportError}</pre>
                </div>
              )}
              
              {exportPath && (
                <div style={{ marginTop: '16px', padding: '12px', background: 'var(--color-bg-surface-1)', borderRadius: '8px' }}>
                  <h4>Export Complete</h4>
                  <div style={{ marginTop: '8px', fontSize: '13px', color: 'var(--color-text-tertiary)', wordBreak: 'break-all' }}>
                    {exportPath}
                  </div>
                </div>
              )}
              
              <div className="modal-actions">
                <button className="btn-secondary" onClick={() => { setShowExport(false); setExportPath(''); setExportError(''); }}>
                  {exportPath ? 'Close' : 'Cancel'}
                </button>
                {!exportPath && (
                  <>
                    <button className="btn-primary" onClick={exportMrpack} disabled={isExporting}>
                      {isExporting ? 'Exporting...' : 'Export as .mrpack'}
                    </button>
                    <button className="btn-primary" onClick={exportCurseforge} disabled={isExporting}>
                      {isExporting ? 'Exporting...' : 'Export as CurseForge'}
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

      {confirmCloseProject && (
          <div className="modal-overlay" onClick={() => setConfirmCloseProject(false)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <h2>Delete Project</h2>
              <p style={{ marginBottom: '16px', color: 'var(--color-text-secondary)' }}>
                Are you sure you want to delete <strong>{selectedProject?.name}</strong>?
                This will permanently remove the project and all its mods. This cannot be undone.
              </p>
              <div className="modal-actions">
                <button className="btn-secondary" onClick={() => setConfirmCloseProject(false)}>Cancel</button>
                <button className="btn-danger" onClick={async () => {
                  try {
                    await deleteProject(selectedProject!.id)
                    await loadProjects()
                    setSelectedProject(null)
                    setActiveTab('mods')
                    setSearchQuery('')
                    setSearchResults([])
                  } catch (e) {
                    console.error('Failed to delete project:', e)
                  }
                  setConfirmCloseProject(false)
                }}>Delete Project</button>
              </div>
            </div>
          </div>
        )}

      {showSettings && (
        <div className="modal-overlay" onClick={() => { setShowSettings(false); setSettingsMessage(''); }}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Settings</h2>
            <p style={{ marginBottom: '16px', color: 'var(--color-text-secondary)' }}>
              Configure API keys and application settings.
            </p>

            <div style={{ marginTop: '16px' }}>
              <h3 style={{ marginBottom: '12px', fontSize: '14px' }}>CurseForge API</h3>
              <p style={{ fontSize: '13px', color: 'var(--color-text-tertiary)', marginBottom: '12px' }}>
                A CurseForge API key enables resolving mods that are only available on CurseForge.
                Get your key at <a href="https://console.curseforge.com/#/api-keys" target="_blank" rel="noopener noreferrer">console.curseforge.com</a>
              </p>
              <div className="form-group">
                <label>API Key</label>
                <input
                  type="password"
                  className="config-input"
                  value={curseforgeApiKey}
                  onChange={(e) => setCurseforgeApiKey(e.target.value)}
                  placeholder="Enter your CurseForge API key"
                />
              </div>
              {settingsMessage && (
                <div style={{ marginTop: '8px', fontSize: '13px', color: settingsMessage.startsWith('Error') ? 'var(--color-error)' : 'var(--color-success)' }}>
                  {settingsMessage}
                </div>
              )}
            </div>

            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => { setShowSettings(false); setSettingsMessage(''); }}>Cancel</button>
              <button className="btn-primary" onClick={saveCurseforgeApiKey} disabled={settingsSaving}>
                {settingsSaving ? 'Saving...' : 'Save Settings'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  </ErrorBoundary>
</ToastProvider>
  )
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// Structured Config Editor Component
function ConfigValueEditor({
  value,
  path,
  onChange,
  depth = 0,
}: {
  value: ConfigValue
  path: string[]
  onChange: (path: string[], value: ConfigValue) => void
  depth?: number
}) {
  const [expanded, setExpanded] = useState(depth < 2)

  if (value.type === 'string') {
    return (
      <div className="config-field" style={{ marginLeft: depth * 16 }}>
        <label className="config-key">{path[path.length - 1]}</label>
        <input
          type="text"
          className="config-input"
          value={value.value as string}
          onChange={(e) => onChange(path, { ...value, value: e.target.value })}
        />
        {value.comment && <span className="config-comment">{value.comment}</span>}
      </div>
    )
  }

  if (value.type === 'number') {
    const hasRange = value.min !== undefined && value.max !== undefined
    return (
      <div className="config-field" style={{ marginLeft: depth * 16 }}>
        <label className="config-key">{path[path.length - 1]}</label>
        {hasRange ? (
          <div className="config-slider-group">
            <input
              type="range"
              className="config-slider"
              min={value.min}
              max={value.max}
              step={value.step || 1}
              value={value.value as number}
              onChange={(e) => onChange(path, { ...value, value: parseFloat(e.target.value) })}
            />
            <span className="config-value-display">
              {value.value}{value.unit ? ` ${value.unit}` : ''}
            </span>
          </div>
        ) : (
          <input
            type="number"
            className="config-input config-number"
            value={value.value as number}
            step={value.step || 'any'}
            onChange={(e) => onChange(path, { ...value, value: parseFloat(e.target.value) })}
          />
        )}
        {value.comment && <span className="config-comment">{value.comment}</span>}
      </div>
    )
  }

  if (value.type === 'boolean') {
    return (
      <div className="config-field" style={{ marginLeft: depth * 16 }}>
        <label className="config-key">{path[path.length - 1]}</label>
        <button
          className={`config-toggle ${value.value ? 'on' : 'off'}`}
          onClick={() => onChange(path, { ...value, value: !value.value })}
          aria-pressed={value.value as boolean}
        >
          {value.value ? 'ON' : 'OFF'}
        </button>
        {value.comment && <span className="config-comment">{value.comment}</span>}
      </div>
    )
  }

  if (value.type === 'enum' && value.options) {
    return (
      <div className="config-field" style={{ marginLeft: depth * 16 }}>
        <label className="config-key">{path[path.length - 1]}</label>
        <select
          className="config-select"
          value={value.value as string}
          onChange={(e) => onChange(path, { ...value, value: e.target.value })}
        >
          {value.options.map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
        {value.comment && <span className="config-comment">{value.comment}</span>}
      </div>
    )
  }

  if (value.type === 'color') {
    return (
      <div className="config-field" style={{ marginLeft: depth * 16 }}>
        <label className="config-key">{path[path.length - 1]}</label>
        <div className="config-color-group">
          <input
            type="color"
            className="config-color-picker"
            value={value.value as string}
            onChange={(e) => onChange(path, { ...value, value: e.target.value })}
          />
          <input
            type="text"
            className="config-input config-color-text"
            value={value.value as string}
            onChange={(e) => onChange(path, { ...value, value: e.target.value })}
          />
        </div>
        {value.comment && <span className="config-comment">{value.comment}</span>}
      </div>
    )
  }

  if (value.type === 'object' || value.type === 'group') {
    const fields = value.fields || {}
    const fieldCount = Object.keys(fields).length
    return (
      <div className="config-section" style={{ marginLeft: depth * 16 }}>
        <div className="config-section-header" onClick={() => setExpanded(!expanded)}>
          <span className="config-expand-icon">{expanded ? '\u25BC' : '\u25B6'}</span>
          <span className="config-section-title">
            {value.type === 'group' ? (value as any).label : path[path.length - 1]}
          </span>
          <span className="config-field-count">{fieldCount} fields</span>
        </div>
        {value.comment && <span className="config-comment" style={{ marginLeft: 20 }}>{value.comment}</span>}
        {expanded && (
          <div className="config-section-body">
            {Object.entries(fields).map(([key, val]) => (
              <ConfigValueEditor
                key={key}
                value={val}
                path={[...path, key]}
                onChange={onChange}
                depth={depth + 1}
              />
            ))}
          </div>
        )}
      </div>
    )
  }

  if (value.type === 'array' && value.items) {
    return (
      <div className="config-section" style={{ marginLeft: depth * 16 }}>
        <div className="config-section-header" onClick={() => setExpanded(!expanded)}>
          <span className="config-expand-icon">{expanded ? '\u25BC' : '\u25B6'}</span>
          <span className="config-section-title">{path[path.length - 1]}</span>
          <span className="config-field-count">{value.items.length} items</span>
        </div>
        {value.comment && <span className="config-comment" style={{ marginLeft: 20 }}>{value.comment}</span>}
        {expanded && (
          <div className="config-section-body">
            {value.items.map((item, i) => (
              <ConfigValueEditor
                key={i}
                value={item}
                path={[...path, i.toString()]}
                onChange={onChange}
                depth={depth + 1}
              />
            ))}
          </div>
        )}
      </div>
    )
  }

  return <div className="config-unknown">Unsupported: {value.type}</div>
}

// =========================================================
// ModListRow - Virtual list row component for react-window
// =========================================================
interface ModRowExtraProps {
  filteredMods: any[]
  modMetadata: Map<string, ModMetadata>
  projectMods: any[]
  getMissingDependencies: (modId: string) => ModDependency[]
  toggleModEnabled: (mod: any) => Promise<void>
  removeModFromProject: (modId: string) => Promise<void>
  getModNameById: (modId: string) => string
}

function ModRow({
  index,
  style,
  filteredMods,
  modMetadata,
  projectMods,
  getMissingDependencies,
  toggleModEnabled,
  removeModFromProject,
  getModNameById,
}: RowComponentProps<ModRowExtraProps>) {
  const mod = filteredMods[index]
  const meta = modMetadata.get(mod.mod_id)
  const missingDeps = getMissingDependencies(mod.mod_id)
  return (
    <div style={style}>
      <div className={`mod-card ${!mod.enabled ? 'disabled' : ''} ${missingDeps.length > 0 ? 'has-missing-deps' : ''}`}>
        <div className="mod-card-header">
          <div className="mod-info">
            <div className="mod-name">{mod.name}</div>
            <div className="mod-author">{mod.author}</div>
          </div>
          <div className="mod-actions">
            <button
              className={`btn-toggle ${mod.enabled ? 'enabled' : 'disabled'}`}
              onClick={() => toggleModEnabled(mod)}
              title={mod.enabled ? 'Disable' : 'Enable'}
              aria-pressed={mod.enabled}
            >
              {mod.enabled ? 'ON' : 'OFF'}
            </button>
            <button
              className="btn-remove"
              onClick={() => removeModFromProject(mod.mod_id)}
              title="Remove mod"
              aria-label={`Remove ${mod.name}`}
            >
              {'\u00D7'}
            </button>
          </div>
        </div>
        <div className="mod-desc">{mod.description}</div>
        <div className="mod-meta">
          <span>{mod.source}</span>
          {mod.version && <span>v{mod.version}</span>}
          {meta && meta.categories.length > 0 && (
            <span className="mod-categories">{meta.categories.join(', ')}</span>
          )}
        </div>
        {meta && meta.dependencies.length > 0 && (
          <div className="mod-dependencies">
            {meta.dependencies.map((dep, i) => {
              const isPresent = projectMods.some(m => m.mod_id === dep.mod_id)
              return (
                <span key={i} className={`dep-badge ${dep.dependency_type} ${isPresent ? 'present' : 'missing'}`}>
                  {dep.dependency_type}: {getModNameById(dep.mod_id)}
                </span>
              )
            })}
          </div>
        )}
        {missingDeps.length > 0 && (
          <div className="mod-missing-deps">
            Missing required: {missingDeps.map(d => d.mod_id).join(', ')}
          </div>
        )}
      </div>
    </div>
  )
}

// =========================================================
// ConfigFileRow - Virtual list row component for config files
// =========================================================
interface ConfigRowExtraProps {
  configFiles: ConfigFileInfo[]
  selectedConfig: ConfigFileInfo | null
  openConfigFile: (file: ConfigFileInfo) => Promise<void>
}

function ConfigFileRow({
  index,
  style,
  configFiles,
  selectedConfig,
  openConfigFile,
}: RowComponentProps<ConfigRowExtraProps>) {
  const file = configFiles[index]
  return (
    <div style={style}>
      <div
        className={`config-file-item ${selectedConfig?.path === file.path ? 'active' : ''}`}
        onClick={() => openConfigFile(file)}
      >
        <div className="config-file-name">{file.name}</div>
        <div className="config-file-meta">{file.format} &bull; {formatFileSize(file.size)}</div>
      </div>
    </div>
  )
}

// =========================================================
// SearchResultRow - Virtual list row component for search results
// =========================================================
interface SearchResultRowExtraProps {
  searchResults: ModMetadata[]
  projectMods: any[]
  addModToProject: (mod: any) => Promise<void>
}

function SearchResultRow({
  index,
  style,
  searchResults,
  projectMods,
  addModToProject,
}: RowComponentProps<SearchResultRowExtraProps>) {
  const mod = searchResults[index]
  const isAdded = projectMods.some(m => m.mod_id === mod.mod_id)
  return (
    <div style={style}>
      <div className="mod-card" style={{ height: '100%' }}>
        <div className="mod-card-header">
          <div className="mod-info">
            <div className="mod-name">{mod.name}</div>
            <div className="mod-author">{mod.author}</div>
          </div>
          <button
            className={`btn-add ${isAdded ? 'added' : ''}`}
            onClick={() => !isAdded && addModToProject(mod)}
            disabled={isAdded}
            aria-label={isAdded ? `${mod.name} already added` : `Add ${mod.name}`}
          >
            {isAdded ? 'Added' : '+ Add'}
          </button>
        </div>
        <div className="mod-desc" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {mod.description}
        </div>
        <div className="mod-meta">
          <span>{mod.downloads.toLocaleString()} downloads</span>
          {mod.categories.length > 0 && (
            <span className="mod-categories">{mod.categories.join(', ')}</span>
          )}
        </div>
      </div>
    </div>
  )
}

export default App
