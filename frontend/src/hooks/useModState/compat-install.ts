// One-click missing-dependency installs for the compat panel. Extracted from
// useModState (the 300-line rule — the s22 meta-rule applies to the app's own
// code just as much as to the tooling). Owns its in-flight set so the panel
// can disable buttons; the caller supplies the side-effect seams.

import { useState } from 'react'
import { installModrinthMod } from '../../services/api'
import type { CompatibilityInstall, CompatibilityResult } from '../../services/types'
import type { Project } from '../useProjectState'
import type { Toast } from '../../components/ui/Toast'

export interface CompatInstallSeams {
  selectedProject: Project | null
  showToast: (toast: Omit<Toast, 'id'>) => string
  loadProjectMods: (projectId: string) => Promise<void>
  /** Re-run the compatibility check. Called once after a successful single
   *  install or once after the whole batch — never per install, or a
   *  ten-dep batch would re-fetch metadata ten times. */
  recheck: () => Promise<void>
}

export function useCompatInstall(
  seams: CompatInstallSeams,
  compatResult: CompatibilityResult | null,
) {
  const [installingMissing, setInstallingMissing] = useState<Set<string>>(new Set())

  /** Install one resolved missing dep; returns success so the batch can
   *  count failures. Does NOT re-check — the wrappers decide when. */
  async function installOne(install: CompatibilityInstall): Promise<boolean> {
    if (!seams.selectedProject) return false
    setInstallingMissing((prev) => new Set(prev).add(install.mod_id))
    try {
      const installed = await installModrinthMod({
        projectId: seams.selectedProject.id,
        modId: install.mod_id,
        slug: install.slug,
        name: install.name,
        version: undefined,
      })
      seams.showToast({
        type: 'success',
        title: `Installed ${installed.name || install.name}`,
        message: `Dependency added to ${seams.selectedProject.name}`,
      })
      await seams.loadProjectMods(seams.selectedProject.id)
      return true
    } catch (e: any) {
      const msg = typeof e === 'string' ? e : e?.message || String(e)
      console.error('[ModCanvas] Failed to install dependency:', msg)
      seams.showToast({
        type: 'error',
        title: `Failed to install ${install.name}`,
        message: msg,
        duration: 8000,
      })
      return false
    } finally {
      setInstallingMissing((prev) => {
        const next = new Set(prev)
        next.delete(install.mod_id)
        return next
      })
    }
  }

  /** Single-install button: install one missing dep, then refresh the check. */
  async function installMissingDependency(install: CompatibilityInstall) {
    if (await installOne(install)) await seams.recheck()
  }

  /** Install every missing dep the check resolved, then re-run the check once. */
  async function installAllMissingDependencies() {
    if (!seams.selectedProject || !compatResult) return
    const installables = compatResult.issues
      .map((i) => i.install)
      .filter((p): p is CompatibilityInstall => p !== null)
    if (installables.length === 0) return
    let ok = 0
    const failed: string[] = []
    // Sequential: each install is a network download + jar scan; parallel
    // would hammer both the registry and the disk at once.
    for (const install of installables) {
      if (await installOne(install)) ok++
      else failed.push(install.name)
    }
    if (failed.length === 0) {
      seams.showToast({
        type: 'success',
        title: `Installed ${ok} missing dependenc${ok === 1 ? 'y' : 'ies'}`,
        message: 'All resolved dependencies are now in your pack.',
      })
    } else {
      seams.showToast({
        type: 'warning',
        title: `Installed ${ok} of ${ok + failed.length}`,
        message: `Failed: ${failed.join(', ')}`,
        duration: 8000,
      })
    }
    await seams.recheck()
  }

  return { installingMissing, installMissingDependency, installAllMissingDependencies }
}
