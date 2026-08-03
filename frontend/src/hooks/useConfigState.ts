import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { listConfigFiles, readConfigFile, parseConfigFile, saveStructuredConfig, writeConfigFile } from '../services/api'
import type { Project } from './useProjectState'
import { useHistory } from './history-provider'
import type { ConfigValue, ConfigFileInfo, ParsedConfig } from '../core/config/types'
import { defaultChild, deleteAt, duplicateAt, getAt, moveArrayAt, setAt } from '../core/config/tree'

function formatForPath(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? ''
  switch (ext) {
    case 'toml':
    case 'cfg':
    case 'properties':
      return 'toml'
    case 'json':
    case 'json5':
      return 'json'
    case 'yaml':
    case 'yml':
      return 'yaml'
    case 'hocon':
      return 'hocon'
    default:
      return 'toml'
  }
}

export function useConfigState(selectedProject: Project | null) {
  const [configFiles, setConfigFiles] = useState<ConfigFileInfo[]>([])
  const [selectedConfig, setSelectedConfig] = useState<ConfigFileInfo | null>(null)
  const [configContent, setConfigContent] = useState('')
  const [configSaving, setConfigSaving] = useState(false)
  const [parsedConfig, setParsedConfig] = useState<ParsedConfig | null>(null)
  const [configMode, setConfigMode] = useState<'structured' | 'raw'>('structured')
  const [configSearch, setConfigSearch] = useState('')
  const lastSavedRef = useRef<string>('')
  const history = useHistory()

  // Dirty tracking: a config file is "dirty" when its in-memory content no
  // longer matches the last saved/reloaded snapshot (deep-compared for the
  // structured tree, raw string for raw mode).
  const configDirty = useMemo(() => {
    if (!selectedConfig) return false
    if (configMode === 'structured' && parsedConfig) {
      return JSON.stringify(parsedConfig.root) !== lastSavedRef.current
    }
    return configContent !== lastSavedRef.current
  }, [selectedConfig, configMode, parsedConfig, configContent])

  // Restore history steps that target the currently-open config file. If the
  // step targets a different file, open that file with the restored payload so
  // cross-tool undo is visible even when you weren't editing it. Object payloads
  // are structured trees; string payloads are raw file content.
  useEffect(() => {
    return history.register('config', (entry, direction) => {
      const payload = direction === 'before' ? entry.before : entry.after
      if (payload === null || payload === undefined) return
      const isStructured = typeof payload === 'object'
      const isOpen = selectedConfig && entry.target === selectedConfig.path

      if (isStructured) {
        if (isOpen) {
          setParsedConfig((prev) => (prev ? { ...prev, root: payload as ConfigValue } : prev))
          return
        }
        const file = configFiles.find((f) => f.path === entry.target)
        if (file) {
          setSelectedConfig(file)
          setConfigMode('structured')
          setParsedConfig((prev) => ({
            format: prev?.format ?? formatForPath(file.path),
            root: payload as ConfigValue,
            raw: prev?.raw ?? '',
          }))
        }
      } else if (isOpen) {
        setConfigContent(payload as string)
        setConfigMode('raw')
      } else {
        const file = configFiles.find((f) => f.path === entry.target)
        if (file) {
          setSelectedConfig(file)
          setConfigContent(payload as string)
          setConfigMode('raw')
        }
      }
    })
  }, [history, selectedConfig, configFiles])

  async function loadConfigFiles() {
    if (!selectedProject) return
    try {
      const files = await listConfigFiles(selectedProject.id)
      setConfigFiles(files)
    } catch (e) {
      console.error('Failed to load config files:', e)
    }
  }

  const maybeDiscard = useCallback((): boolean => {
    if (!configDirty) return true
    // eslint-disable-next-line no-alert
    return window.confirm('You have unsaved changes. Discard them?')
  }, [configDirty])

  async function openConfigFile(file: ConfigFileInfo) {
    if (!selectedProject) return
    if (!maybeDiscard()) return
    try {
      const content = await readConfigFile(selectedProject.id, file.path)
      setSelectedConfig(file)
      setConfigContent(content)
      setConfigMode('structured')
      setConfigSearch('')

      try {
        const parsed = await parseConfigFile(selectedProject.id, file.path)
        setParsedConfig(parsed)
        lastSavedRef.current = JSON.stringify(parsed.root)
      } catch {
        setParsedConfig(null)
        setConfigMode('raw')
        lastSavedRef.current = content
      }
    } catch (e) {
      console.error('Failed to read config file:', e)
    }
  }

  async function revertConfigFile() {
    if (!selectedConfig || !selectedProject) return
    try {
      const content = await readConfigFile(selectedProject.id, selectedConfig.path)
      setConfigContent(content)
      setConfigMode('structured')
      try {
        const parsed = await parseConfigFile(selectedProject.id, selectedConfig.path)
        setParsedConfig(parsed)
        lastSavedRef.current = JSON.stringify(parsed.root)
      } catch {
        setParsedConfig(null)
        setConfigMode('raw')
        lastSavedRef.current = content
      }
    } catch (e) {
      console.error('Failed to revert config file:', e)
    }
  }

  async function saveConfigFile() {
    if (!selectedConfig || !selectedProject) return
    setConfigSaving(true)
    try {
      if (configMode === 'structured' && parsedConfig) {
        await saveStructuredConfig(selectedProject.id, selectedConfig.path, parsedConfig.root)
        lastSavedRef.current = JSON.stringify(parsedConfig.root)
      } else {
        await writeConfigFile(selectedProject.id, selectedConfig.path, configContent)
        lastSavedRef.current = configContent
      }
    } catch (e) {
      console.error('Failed to save config file:', e)
    } finally {
      setConfigSaving(false)
    }
  }

  const commitRoot = useCallback((nextRoot: ConfigValue, label: string, before: ConfigValue) => {
    if (!selectedConfig) return
    setParsedConfig((prev) => (prev ? { ...prev, root: nextRoot } : prev))
    history.commit({
      subject: 'config',
      target: selectedConfig.path,
      label,
      before,
      after: nextRoot,
    })
  }, [selectedConfig, history])

  function updateConfigValue(path: string[], value: ConfigValue) {
    if (!parsedConfig || !selectedConfig) return
    const before = JSON.parse(JSON.stringify(parsedConfig.root)) as ConfigValue
    const newRoot = setAt(parsedConfig.root, path, value)
    commitRoot(newRoot, `Edit ${selectedConfig.name}`, before)
  }

  function addConfigArrayItem(path: string[]) {
    if (!parsedConfig || !selectedConfig) return
    const array = getAt(parsedConfig.root, path)
    if (!array || array.type !== 'array') return
    const template = array.items?.length ? array.items[array.items.length - 1] : undefined
    const newItem = defaultChild(template)
    const before = JSON.parse(JSON.stringify(parsedConfig.root)) as ConfigValue
    const newRoot = setAt(parsedConfig.root, [...path, String(array.items?.length ?? 0)], newItem)
    commitRoot(newRoot, `Edit ${selectedConfig.name}`, before)
  }

  function addConfigField(path: string[]) {
    if (!parsedConfig || !selectedConfig) return
    // eslint-disable-next-line no-alert
    const key = window.prompt('New field name')
    if (!key) return
    const before = JSON.parse(JSON.stringify(parsedConfig.root)) as ConfigValue
    const newRoot = setAt(parsedConfig.root, [...path, key], defaultChild(undefined))
    commitRoot(newRoot, `Edit ${selectedConfig.name}`, before)
  }

  function removeConfigAt(path: string[]) {
    if (!parsedConfig || !selectedConfig || path.length === 0) return
    const before = JSON.parse(JSON.stringify(parsedConfig.root)) as ConfigValue
    const newRoot = deleteAt(parsedConfig.root, path)
    commitRoot(newRoot, `Edit ${selectedConfig.name}`, before)
  }

  function moveConfigArrayItem(arrayPath: string[], from: number, to: number) {
    if (!parsedConfig || !selectedConfig) return
    const before = JSON.parse(JSON.stringify(parsedConfig.root)) as ConfigValue
    const newRoot = moveArrayAt(parsedConfig.root, arrayPath, from, to)
    if (newRoot === parsedConfig.root) return
    commitRoot(newRoot, `Edit ${selectedConfig.name}`, before)
  }

  function duplicateConfigAt(path: string[]) {
    if (!parsedConfig || !selectedConfig || path.length === 0) return
    const before = JSON.parse(JSON.stringify(parsedConfig.root)) as ConfigValue
    const newRoot = duplicateAt(parsedConfig.root, path)
    commitRoot(newRoot, `Edit ${selectedConfig.name}`, before)
  }

  function undoConfigChange() {
    history.undo()
  }

  // Raw-mode edits are also recorded, so typing in the textarea participates in
  // the app-wide undo/redo (rapid keystrokes coalesce into one step).
  function setRawConfigContent(content: string) {
    if (!selectedConfig) {
      setConfigContent(content)
      return
    }
    history.commit({
      subject: 'config',
      target: selectedConfig.path,
      label: `Edit ${selectedConfig.name} (raw)`,
      before: configContent,
      after: content,
    })
    setConfigContent(content)
  }

  function resetConfigState() {
    setConfigFiles([])
    setSelectedConfig(null)
    setConfigContent('')
    setConfigSearch('')
    lastSavedRef.current = ''
  }

  // The config tab's undo button only shows when the top history entry is a
  // config edit, so it never implies undoing a quest change from here.
  const canUndoConfig = history.canUndo && history.peekUndo?.subject === 'config'

  return {
    configFiles,
    selectedConfig,
    configContent, setConfigContent: setRawConfigContent,
    configSaving,
    parsedConfig,
    configMode, setConfigMode,
    configSearch, setConfigSearch,
    configDirty,
    canUndoConfig,
    loadConfigFiles,
    openConfigFile,
    revertConfigFile,
    saveConfigFile,
    updateConfigValue,
    addConfigArrayItem,
    addConfigField,
    removeConfigAt,
    moveConfigArrayItem,
    duplicateConfigAt,
    undoConfigChange,
    resetConfigState,
  }
}
