import { invoke } from '@tauri-apps/api/core'
import type { ModMetadata, CompatibilityResult, CuratedMod } from './types'

export async function addMod(
  projectId: string,
  modId: string,
  slug: string,
  name: string,
  version: string,
  description: string,
  author: string,
  source: string,
  enabled?: boolean,
): Promise<void> {
  const args: Record<string, unknown> = { projectId, modId, slug, name, version, description, author, source }
  if (enabled !== undefined) args.enabled = enabled
  return invoke('add_mod', args)
}

export interface RemoveModResult {
  rowRemoved: boolean
  fileRemoved: boolean
  /** The stored file name pointed at a jar already gone from disk (deleted
   *  externally). The row was still removed; surface this as a warning. */
  fileMissing: boolean
  message: string
}

export async function removeMod(projectId: string, modId: string): Promise<RemoveModResult> {
  return invoke<RemoveModResult>('remove_mod', { projectId, modId })
}

export async function getProjectMods(projectId: string): Promise<any[]> {
  return invoke<any[]>('get_project_mods', { projectId })
}

export async function scanInstanceMods(projectId: string): Promise<any[]> {
  return invoke<any[]>('scan_instance_mods', { projectId })
}

export async function deployCompanionMod(projectId: string): Promise<void> {
  return invoke('deploy_companion_mod_for_project', { projectId })
}

export async function getProjectModMetadata(projectId: string): Promise<ModMetadata[]> {
  return invoke<ModMetadata[]>('get_project_mod_metadata', { projectId })
}

export async function getDepNames(
  modIds: string[],
): Promise<Array<{ mod_id: string; slug: string; name: string }>> {
  return invoke<Array<{ mod_id: string; slug: string; name: string }>>('get_dep_names', { modIds })
}

export async function checkCompatibility(projectId: string): Promise<CompatibilityResult> {
  return invoke<CompatibilityResult>('check_compatibility_async', { projectId })
}

/** Curated mod picks for the First-Pack wizard, filtered to this pack. */
export async function listCuratedMods(projectId: string): Promise<CuratedMod[]> {
  return invoke<CuratedMod[]>('list_curated_mods', { projectId })
}

export async function searchMods(
  query: string,
  loader: string,
  mcVersion: string,
  sources: Array<'modrinth' | 'curseforge'>,
  categories: string[] = [],
): Promise<ModMetadata[]> {
  return invoke<ModMetadata[]>('search_mods', { query, loader, mcVersion, sources, categories })
}

export interface InstallModArgs {
  projectId: string
  source: 'modrinth' | 'curseforge'
  modId: string
  slug: string
  name: string
  author: string
  description: string
  version?: string
  icon?: string | null
}

/** Download a searched mod's jar into the instance's mods/ folder + record it. */
export async function installModFromSearch(args: InstallModArgs): Promise<any> {
  return invoke<any>('install_mod_from_search', { ...args })
}

export async function getPackIcon(path: string): Promise<string | null> {
  return invoke<string | null>('get_pack_icon', { path })
}
