import { invoke } from '@tauri-apps/api/core'
import type { SearchResult, TagInfo, GeneratedScripts } from './types'

export async function searchItems(
  query: string,
  loader: string,
  mcVersion: string,
): Promise<SearchResult[]> {
  return invoke<SearchResult[]>('search_items', { query, loader, mcVersion })
}

export async function searchTags(
  query: string,
  loader: string,
  mcVersion: string,
): Promise<TagInfo[]> {
  return invoke<TagInfo[]>('search_tags', { query, loader, mcVersion })
}

export async function getItemDetails(
  itemId: string,
): Promise<SearchResult | null> {
  return invoke<SearchResult | null>('get_item_details', { itemId })
}

export async function generateRecipeScripts(
  projectId: string,
  recipes: unknown[],
): Promise<GeneratedScripts> {
  return invoke<GeneratedScripts>('generate_recipe_scripts', { projectId, recipes })
}

export async function writeScriptFiles(
  projectId: string,
  kubejsScript: string,
  crafttweakerScript: string,
): Promise<void> {
  return invoke('write_script_files', {
    projectId,
    kubejsScript,
    crafttweakerScript,
  })
}

export async function scanModJarTextures(modsDir: string): Promise<Record<string, string>> {
  return invoke<Record<string, string>>('scan_mod_jar_textures', { modsDir })
}
