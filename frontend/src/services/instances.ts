// Instance metadata for the First-Pack wizard (list_mc_instances).
//
// `list_prism_instances` returns only {name, path}; the wizard needs the
// full record — mc_version, loader, game_dir, status — because it derives
// the project's version/loader from the picked instance and never asks a
// beginner a technical question.
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

export async function listMcInstances(): Promise<MinecraftInstance[]> {
  return invoke<MinecraftInstance[]>('list_mc_instances')
}

/** Instances the wizard can scaffold into: known loader, not running. */
export function wizardCandidates(instances: MinecraftInstance[]): MinecraftInstance[] {
  return instances.filter(
    (i) => i.status !== 'Running' && i.loader !== 'Unknown' && i.mc_version !== 'Unknown',
  )
}
