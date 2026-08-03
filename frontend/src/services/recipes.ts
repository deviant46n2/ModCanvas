import { invoke } from '@tauri-apps/api/core'
import type { SearchResult, TagInfo, GeneratedScripts, DiscoveredRecipe } from './types'
import type { IngestResult, ItemRegistryEntry } from './quest-types'

export async function scanPackRecipes(projectPath: string): Promise<DiscoveredRecipe[]> {
  return invoke<DiscoveredRecipe[]>('scan_pack_recipes_cmd', { projectPath })
}

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

export async function scanInstanceTextures(instancePath: string): Promise<Record<string, string>> {
  return invoke<Record<string, string>>('scan_instance_textures_cmd', { instancePath })
}

export async function scanInstanceAnimations(instancePath: string): Promise<Record<string, string>> {
  return invoke<Record<string, string>>('scan_instance_animations_cmd', { instancePath })
}

export async function reindexTextures(modsDir: string): Promise<Record<string, string>> {
  return invoke<Record<string, string>>('reindex_textures', { modsDir })
}

export async function getQuestThemeBackground(
  instancePath: string,
  chapterId: string,
): Promise<string | null> {
  return invoke<string | null>('get_quest_theme_background', { instancePath, chapterId })
}

export async function logDebug(message: string): Promise<void> {
  return invoke('log_debug', { message })
}

export async function ingestActiveInstance(instancePath: string): Promise<IngestResult> {
  return invoke<IngestResult>('ingest_active_instance_cmd', { instancePath })
}

export async function getTextureFiles(
  textureKeys: string[],
  instancePath: string,
): Promise<Record<string, string | null>> {
  return invoke<Record<string, string | null>>('get_texture_files', {
    textureKeys,
    instancePath,
  })
}

export async function scanInstanceItems(instancePath: string): Promise<ItemRegistryEntry[]> {
  return invoke<ItemRegistryEntry[]>('scan_instance_items_cmd', { instancePath })
}
