import { invoke } from '@tauri-apps/api/core'
import type { ConfigFileInfo, ConfigValue, ParsedConfig } from './types'

export async function listConfigFiles(projectId: string): Promise<ConfigFileInfo[]> {
  return invoke<ConfigFileInfo[]>('list_config_files', { projectId })
}

export async function readConfigFile(projectId: string, path: string): Promise<string> {
  return invoke<string>('read_config_file', { projectId, path })
}

export async function writeConfigFile(projectId: string, path: string, content: string): Promise<void> {
  return invoke('write_config_file', { projectId, path, content })
}

export async function parseConfigFile(projectId: string, path: string): Promise<ParsedConfig> {
  return invoke<ParsedConfig>('parse_config_file', { projectId, path })
}

export async function saveStructuredConfig(projectId: string, path: string, config: ConfigValue): Promise<void> {
  return invoke('save_structured_config', { projectId, path, config })
}