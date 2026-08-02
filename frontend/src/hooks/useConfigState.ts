import { useState } from 'react'
import { listConfigFiles, readConfigFile, parseConfigFile, saveStructuredConfig, writeConfigFile } from '../services/api'
import type { Project } from './useProjectState'

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

export function useConfigState(selectedProject: Project | null) {
  const [configFiles, setConfigFiles] = useState<ConfigFileInfo[]>([])
  const [selectedConfig, setSelectedConfig] = useState<ConfigFileInfo | null>(null)
  const [configContent, setConfigContent] = useState('')
  const [configSaving, setConfigSaving] = useState(false)
  const [parsedConfig, setParsedConfig] = useState<ParsedConfig | null>(null)
  const [configMode, setConfigMode] = useState<'structured' | 'raw'>('structured')
  const [configUndoStack, setConfigUndoStack] = useState<ConfigValue[]>([])

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
      setConfigUndoStack([])

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
    if (!parsedConfig) return

    setConfigUndoStack((prev) => [...prev, JSON.parse(JSON.stringify(parsedConfig.root))])

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
  }

  function undoConfigChange() {
    if (configUndoStack.length === 0 || !parsedConfig) return
    const prev = configUndoStack[configUndoStack.length - 1]
    setConfigUndoStack((s) => s.slice(0, -1))
    setParsedConfig({ ...parsedConfig, root: prev })
  }

  function resetConfigState() {
    setConfigFiles([])
    setSelectedConfig(null)
    setConfigContent('')
  }

  return {
    configFiles,
    selectedConfig,
    configContent, setConfigContent,
    configSaving,
    parsedConfig,
    configMode, setConfigMode,
    configUndoStack,
    loadConfigFiles,
    openConfigFile,
    saveConfigFile,
    updateConfigValue,
    undoConfigChange,
    resetConfigState,
  }
}
