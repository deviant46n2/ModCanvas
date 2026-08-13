import { invoke } from '@tauri-apps/api/core'

/** Read an app-level setting from the key/value settings table. */
export function getAppSetting(key: string): Promise<string | null> {
  return invoke<string | null>('get_app_setting', { key })
}

/** Write an app-level setting (INSERT OR REPLACE). */
export function setAppSetting(key: string, value: string): Promise<void> {
  return invoke<void>('set_app_setting', { key, value })
}

/** The settings-table key for Beginner Mode. */
export const BEGINNER_MODE_KEY = 'beginner_mode'
