import { invoke } from '@tauri-apps/api/core'
import type { GeneratedScripts, DiscoveredRecipe } from './types'
import type { IngestResult, ItemRegistryEntry, ItemTagInfo } from './quest-types'

export async function scanPackRecipes(projectPath: string): Promise<DiscoveredRecipe[]> {
  return invoke<DiscoveredRecipe[]>('scan_pack_recipes_cmd', { projectPath })
}

export async function generateRecipeScripts(
  projectId: string,
  recipes: unknown[],
  disabledIds: string[] = [],
): Promise<GeneratedScripts> {
  return invoke<GeneratedScripts>('generate_recipe_scripts', { projectId, recipes, disabledIds })
}

/** Comment out a recipe call in a pack script. Returns the disable fingerprint
 *  (SHA-256 hex of the original pre-comment lines) for later re-enable. */
export async function commentOutRecipeCall(
  projectId: string,
  file: string,
  startLine: number,
  endLine: number,
): Promise<string> {
  return invoke<string>('comment_out_recipe_call', { projectId, file, startLine, endLine })
}

/** Reverse a comment-out, integrity-checked against the stored fingerprint. */
export async function uncommentRecipeCall(
  projectId: string,
  file: string,
  startLine: number,
  endLine: number,
  fingerprint: string,
): Promise<void> {
  return invoke('uncomment_recipe_call', { projectId, file, startLine, endLine, fingerprint })
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

export async function scanInstanceTextures(instancePath: string): Promise<Record<string, string>> {
  return invoke<Record<string, string>>('scan_instance_textures_cmd', { instancePath })
}

export async function scanInstanceAnimations(instancePath: string): Promise<Record<string, string>> {
  return invoke<Record<string, string>>('scan_instance_animations_cmd', { instancePath })
}

/** Delete stale per-instance cache files that no longer match the known
 * instances + mods dirs. Returns the number of files removed. */
export async function pruneCaches(
  instancePaths: string[],
  modsDirs: string[],
): Promise<number> {
  return invoke<number>('prune_caches_cmd', { instancePaths, modsDirs })
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

export async function ingestActiveInstance(instancePath: string, force = false): Promise<IngestResult> {
  return invoke<IngestResult>('ingest_active_instance_cmd', { instancePath, force })
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

export async function scanInstanceItems(instancePath: string, kubejsNamespace?: string): Promise<ItemRegistryEntry[]> {
  return invoke<ItemRegistryEntry[]>('scan_instance_items_cmd', { instancePath, kubejsNamespace })
}

/** Local item-tag catalog (id + expanded member count) for the Tags tab. */
export async function listItemTags(instancePath: string): Promise<ItemTagInfo[]> {
  return invoke<ItemTagInfo[]>('list_item_tags_cmd', { instancePath })
}
