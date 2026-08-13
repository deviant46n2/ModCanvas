// Open the pack's user-writable texture folder (kubejs/assets) in the system
// file manager. The decorations library scans that folder for self-authored
// PNGs; opening it directly is how a user drops their own assets in (s49).
import { invoke } from '@tauri-apps/api/core'

export async function openAssetsFolder(projectId: string): Promise<void> {
  await invoke('open_assets_folder', { projectId })
}
