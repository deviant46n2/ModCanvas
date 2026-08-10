import { invoke } from '@tauri-apps/api/core'
import type { Project, ImportResult, ProjectTemplate } from './types'

export async function createProject(
  name: string,
  minecraftVersion: string,
  modLoader: string,
  path: string,
  templateId: string | null = null,
): Promise<Project> {
  return invoke<Project>('create_project', { name, minecraftVersion, modLoader, path, templateId })
}

/** Template packages the First-Pack wizard can offer (ids owned by Rust). */
export async function listProjectTemplates(): Promise<ProjectTemplate[]> {
  return invoke<ProjectTemplate[]>('list_project_templates')
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

/** Key storage status for Settings — NEVER the key value itself. The
 *  renderer only learns whether a key exists and which store holds it. */
export interface KeyStorageInfo {
  has_key: boolean
  /** "keychain" | "database" | "none" */
  store: string
}

export async function getKeyStorage(): Promise<KeyStorageInfo> {
  return invoke<KeyStorageInfo>('get_curseforge_api_key')
}

/** Save the key to the OS keychain (or the app database as a reported
 *  fallback). Returns the store used: "keychain" | "database". */
export async function setCurseforgeApiKey(key: string): Promise<string> {
  return invoke<string>('set_curseforge_api_key', { key })
}

export async function clearCurseforgeApiKey(): Promise<void> {
  return invoke('clear_curseforge_api_key')
}

export async function openPrismLauncher(): Promise<void> {
  return invoke('open_prism_launcher')
}
