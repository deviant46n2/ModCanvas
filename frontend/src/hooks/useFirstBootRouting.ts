import { useEffect, useRef } from 'react'
import { getAppSetting, setAppSetting, FIRST_BOOT_KEY } from '../services/settings'

/**
 * First-boot routing: when the project list has loaded successfully and is
 * empty AND the intro has never been shown (`first_boot_seen` unset), call
 * `onOpenWizard` exactly once and persist the flag immediately — a crash or
 * restart never re-triggers the intro.
 *
 * Guard rails (mirroring the auto-reopen pattern in useAppState):
 * - waits for `projectsLoaded` (a failed load never fires the wizard — an
 *   empty list is ambiguous until the load succeeds);
 * - returning users (projectCount > 0) are skipped permanently;
 * - the flag is written when the wizard opens, so closing it without
 *   creating is still "seen".
 */
export function useFirstBootRouting(
  projectsLoaded: boolean,
  projectCount: number,
  onOpenWizard: () => void,
) {
  const done = useRef(false)

  useEffect(() => {
    if (done.current) return
    if (!projectsLoaded) return
    if (projectCount > 0) {
      done.current = true
      return
    }
    done.current = true
    let cancelled = false
    getAppSetting(FIRST_BOOT_KEY)
      .then((seen) => {
        if (cancelled || seen === '1') return
        onOpenWizard()
        setAppSetting(FIRST_BOOT_KEY, '1')
      })
      .catch(() => {
        // Unknown settings state — never block the app on the intro.
      })
    return () => {
      cancelled = true
    }
  }, [projectsLoaded, projectCount, onOpenWizard])
}
