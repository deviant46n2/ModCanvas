import { useEffect, useState } from 'react'
import { listConfigFiles, readConfigFile, parseConfigFile, saveStructuredConfig, writeConfigFile } from '../services/api'
import type { Project } from './useProjectState'
import { useHistory } from './history-provider'

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
  const history = useHistory()

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

  async function openConfigFile(file: ConfigFileInfo) {
    if (!selectedProject) return
    try {
      const content = await readConfigFile(selectedProject.id, file.path)
      setSelectedConfig(file)
      setConfigContent(content)
      setConfigMode('structured')

      try {
        const parsed = await parseConfigFile(selectedProject.id, file.path)
        setParsedConfig(parsed)
      } catch {
        setParsedConfig(null)
        setConfigMode('raw')
      }
    } catch (e) {
      console.error('Failed to read config file:', e)
    }
  }

  async function saveConfigFile() {
    if (!selectedConfig || !selectedProject) return
    setConfigSaving(true)
    try {
      if (configMode === 'structured' && parsedConfig) {
        await saveStructuredConfig(selectedProject.id, selectedConfig.path, parsedConfig.root)
      } else {
        await writeConfigFile(selectedProject.id, selectedConfig.path, configContent)
      }
    } catch (e) {
      console.error('Failed to save config file:', e)
    } finally {
      setConfigSaving(false)
    }
  }

  function updateConfigValue(path: string[], value: ConfigValue) {
    if (!parsedConfig || !selectedConfig) return

    const before = JSON.parse(JSON.stringify(parsedConfig.root)) as ConfigValue
    const newRoot = JSON.parse(JSON.stringify(parsedConfig.root)) as ConfigValue

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
    history.commit({
      subject: 'config',
      target: selectedConfig.path,
      label: `Edit ${selectedConfig.name}`,
      before,
      after: newRoot,
    })
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
    canUndoConfig,
    loadConfigFiles,
    openConfigFile,
    saveConfigFile,
    updateConfigValue,
    undoConfigChange,
    resetConfigState,
  }
}