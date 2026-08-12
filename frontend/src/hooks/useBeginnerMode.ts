import { useCallback, useEffect, useState } from 'react'
import { BEGINNER_MODE_KEY, getAppSetting, setAppSetting } from '../services/settings'

/**
 * P0-BEGINNER — Beginner Mode flag. Reads `beginner_mode` from the app
 * settings table on mount, exposes the value + a persisted toggle.
 *
 * Semantics: ON = hide raw/code surfaces (raw config mode, script preview,
 * script drawer) so a first-timer never trips on code-shaped UI. OFF = the
 * full IDE. The mode is global (not per-project) — it's a user preference,
 * and the settings table is app-scoped (db.rs `settings` table).
 *
 * Honest states: unknown until the setting loads (avoid flashing surfaces
 * before the read resolves); the toggle persists through set_app_setting.
 */
export function useBeginnerMode() {
  const [beginnerMode, setBeginnerModeState] = useState<boolean | null>(null)

  useEffect(() => {
    let cancelled = false
    getAppSetting(BEGINNER_MODE_KEY)
      .then((v) => { if (!cancelled) setBeginnerModeState(v === '1') })
      .catch(() => { if (!cancelled) setBeginnerModeState(false) })
    return () => { cancelled = true }
  }, [])

  const setBeginnerMode = useCallback((next: boolean) => {
    setBeginnerModeState((prev) => {
      // Optimistic set; on persistence failure revert to the value the disk
      // actually has (the honest-state rule — never claim a mode that
      // didn't persist).
      setAppSetting(BEGINNER_MODE_KEY, next ? '1' : '0').catch(() => {
        setBeginnerModeState(prev)
      })
      return next
    })
  }, [])

  return { beginnerMode, setBeginnerMode }
}
