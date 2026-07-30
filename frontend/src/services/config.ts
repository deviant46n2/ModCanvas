import { invoke } from '@tauri-apps/api/core'
import type { ConfigFileInfo, ConfigValue, ParsedConfig } from './types'

export async function listConfigFiles(projectId: string): Promise<ConfigFileInfo[]> {
  return invoke<ConfigFileInfo[]>('list_config_files', { projectId })
}

export async function readConfigFile(path: string): Promise<string> {
  return invoke<string>('read_config_file', { path })
}

export async function writeConfigFile(path: string, content: string): Promise<void> {
  return invoke('write_config_file', { path, content })
}

export async function parseConfigFile(path: string): Promise<ParsedConfig> {
  return invoke<ParsedConfig>('parse_config_file', { path })
}

export async function saveStructuredConfig(path: string, config: ConfigValue): Promise<void> {
  return invoke('save_structured_config', { path, config })
}
