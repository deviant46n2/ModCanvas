// Instance metadata for the First-Pack wizard (list_mc_instances).
//
// The s49 wizard reshape: every wizard start auto-creates a fresh Prism
// instance (MC 1.21.1 · NeoForge), so the where-picker and its instance
// listing are gone — only create + resolve remain.
import { invoke } from '@tauri-apps/api/core'

export interface MinecraftInstance {
  id: string
  name: string
  mc_version: string
  loader: string
  loader_version: string | null
  game_dir: string
  status: string
}

/** Create a fresh Prism instance (the wizard's auto-create path). */
export async function createMcInstance(
  name: string,
  mcVersion: string,
  loader: string,
  loaderVersion: string,
): Promise<MinecraftInstance> {
  return invoke<MinecraftInstance>('create_mc_instance', {
    name,
    mcVersion,
    loader,
    loaderVersion,
  })
}

/** Latest stable loader version for the wizard's supported combo. None =
 *  unresolvable — callers fail loudly, never write a guessed version. */
export async function resolveLoaderVersion(
  mcVersion: string,
  loader: string,
): Promise<string | null> {
  return invoke<string | null>('resolve_loader_version', { mcVersion, loader })
}
