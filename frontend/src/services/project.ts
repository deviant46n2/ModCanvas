import { invoke } from '@tauri-apps/api/core'
import type { Project, ImportResult } from './types'

export async function createProject(
  name: string,
  minecraftVersion: string,
  modLoader: string,
  path: string,
): Promise<Project> {
  return invoke<Project>('create_project', { name, minecraftVersion, modLoader, path })
}

export async function listProjects(): Promise<Project[]> {
  return invoke<Project[]>('list_projects')
}

export async function saveProject(projectId: string): Promise<void> {
  return invoke('save_project', { projectId })
}

export async function deleteProject(projectId: string): Promise<void> {
  return invoke('delete_project', { projectId })
}

export async function testProject(
  projectId: string,
  username: string,
  minMem: string,
  maxMem: string,
): Promise<void> {
  return invoke('test_project', { projectId, username, minMem, maxMem })
}

export async function autoImportPack(path: string): Promise<ImportResult> {
  return invoke<ImportResult>('auto_import_pack', { path })
}

export async function pickImportFile(): Promise<string | null> {
  return invoke<string | null>('pick_import_file')
}

export async function exportModrinthMrpack(projectId: string): Promise<string> {
  return invoke<string>('export_modrinth_mrpack', { projectId })
}

export async function exportCurseforgeZip(projectId: string): Promise<string> {
  return invoke<string>('export_curseforge_zip', { projectId })
}

export async function getCurseforgeApiKey(): Promise<string | null> {
  return invoke<string | null>('get_curseforge_api_key')
}

export async function setCurseforgeApiKey(key: string): Promise<void> {
  return invoke('set_curseforge_api_key', { key })
}

export async function openPrismLauncher(): Promise<void> {
  return invoke('open_prism_launcher')
}
