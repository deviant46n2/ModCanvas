import { useCallback, useEffect, useState } from 'react'
import { listCuratedMods, installModrinthMod, checkCompatibility } from '../services/mods'
import { usePackHealthStore } from '../core/pack-health/pack-health-store'
import { CORE_MOD_PATTERNS } from '../core/pack-health/checks/mods'
import type { CompatibilityInstall, CompatibilityIssue, CuratedMod } from '../services/types'
import type { Project } from '../services/types'

export interface CuratedModsInstallState {
  mods: CuratedMod[] | null
  error: string | null
  installing: Set<string>
  installed: Set<string>
  depIssues: CompatibilityIssue[]
  installingDep: Set<string>
  autoInstalling: boolean
  autoProgress: { name: string; done: number; total: number } | null
  handleInstall: (mod: CuratedMod) => Promise<void>
  handleInstallDep: (install: CompatibilityInstall) => Promise<void>
  handleContinue: (autoInstallTargets: CuratedMod[], installedMods: string[] | null) => Promise<void>
}

/**
 * Curated mods install orchestration, extracted from CuratedModsStep (s70 —
 * P1-HYGIENE split: the step's auto-install state machine is imperative logic
 * mixed into a render component; this hook makes it unit-testable and thins
 * the component to wiring + render).
 *
 * Owns: the curated list load, one-click installs, inline dep repair, and the
 * Continue auto-install loop (ticked Modrinth picks + gate entries whose
 * required mods the scan doesn't show). Pure UI-layer (3-layer rule): all
 * data flows through the mods service; the pack-health store is only fed
 * dep findings for the persistent warning lane.
 */
export function useCuratedModsInstall(project: Project): CuratedModsInstallState {
  const [mods, setMods] = useState<CuratedMod[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [installing, setInstalling] = useState<Set<string>>(new Set())
  const [installed, setInstalled] = useState<Set<string>>(new Set())
  // Missing required deps (the compat check's issues, s54-A: the step closes
  // its own one-click loop — a pick like KubeJS pulls a dep like Rhino, and
  // the fix appears here, not in a hidden tab).
  const [depIssues, setDepIssues] = useState<CompatibilityIssue[]>([])
  const [installingDep, setInstallingDep] = useState<Set<string>>(new Set())
  // Continue auto-installs the ticked Modrinth picks (keyless API — the
  // honest auto-install; s55: users expected "continue" to install the picks,
  // and the step previously required clicking every row). CF picks are
  // excluded — the guide step owns them. Unticked picks (opt-ins like
  // Controllable) install via their row button only.
  const [autoInstalling, setAutoInstalling] = useState(false)
  const [autoProgress, setAutoProgress] = useState<{ name: string; done: number; total: number } | null>(null)

  useEffect(() => {
    let alive = true
    listCuratedMods(project.id)
      .then((list) => {
        if (alive) setMods(list)
      })
      .catch((e) => {
        if (alive) setError(typeof e === 'string' ? e : e?.message || String(e))
      })
    return () => {
      alive = false
    }
  }, [project.id])

  useEffect(() => {
    let alive = true
    checkCompatibility(project.id)
      .then((result) => {
        if (alive) setDepIssues(result.issues)
      })
      .catch(() => {
        /* a failed dep check degrades to no claim — the Mods tab can retry */
      })
    return () => {
      alive = false
    }
  }, [project.id])

  const refreshDepCheck = useCallback(async () => {
    try {
      const result = await checkCompatibility(project.id)
      setDepIssues(result.issues)
      // Feed the health report's persistent (non-blocking) dep warnings
      // (s55 ruling: warn, don't gate).
      usePackHealthStore.getState().setDepIssues(result.issues)
    } catch {
      /* same degrade-to-no-claim rule */
    }
  }, [project.id])

  const handleInstall = useCallback(
    async (mod: CuratedMod) => {
      if (installing.has(mod.mod_id)) return
      setInstalling((prev) => new Set(prev).add(mod.mod_id))
      setError(null)
      try {
        await installModrinthMod({
          projectId: project.id,
          modId: mod.mod_id,
          slug: mod.slug,
          name: mod.name,
          description: mod.description,
        })
        setInstalled((prev) => new Set(prev).add(mod.mod_id))
        // The pick's own deps may now be missing — close the loop inline.
        await refreshDepCheck()
      } catch (e: any) {
        setError(typeof e === 'string' ? e : e?.message || String(e))
      } finally {
        setInstalling((prev) => {
          const next = new Set(prev)
          next.delete(mod.mod_id)
          return next
        })
      }
    },
    [installing, project.id, refreshDepCheck],
  )

  const handleInstallDep = useCallback(
    async (install: CompatibilityInstall) => {
      if (installingDep.has(install.mod_id)) return
      setInstallingDep((prev) => new Set(prev).add(install.mod_id))
      setError(null)
      try {
        await installModrinthMod({
          projectId: project.id,
          modId: install.mod_id,
          slug: install.slug,
          name: install.name,
        })
        await refreshDepCheck()
      } catch (e: any) {
        setError(typeof e === 'string' ? e : e?.message || String(e))
      } finally {
        setInstallingDep((prev) => {
          const next = new Set(prev)
          next.delete(install.mod_id)
          return next
        })
      }
    },
    [installingDep, project.id, refreshDepCheck],
  )

  const handleContinue = useCallback(
    async (autoInstallTargets: CuratedMod[], installedMods: string[] | null) => {
      setAutoInstalling(true)
      const failures: string[] = []
      // Required mods with a Modrinth slug that the scan doesn't show yet —
      // they install automatically (s56). The gate list is the source of
      // truth: a future required mod is one row with a slug, no wizard edits.
      // CF-only required mods (FTB Quests) have no slug — the Prism guide step
      // owns them.
      const scannedNames = (installedMods ?? []).map((n) => n.toLowerCase())
      // The picks loop installs these — the gate loop must not double-install
      // a mod that is both a ticked pick and a gate entry (KubeJS).
      const pickIds = new Set(autoInstallTargets.map((m) => m.mod_id))
      const gateAutoTargets = CORE_MOD_PATTERNS.filter(
        (core) =>
          core.modrinthSlug &&
          !pickIds.has(core.modrinthSlug) &&
          !scannedNames.some((n) => core.pattern.test(n)) &&
          !installed.has(core.modrinthSlug),
      )
      const autoTargets = autoInstallTargets
      const total = autoTargets.length + gateAutoTargets.length
      try {
        for (const mod of autoTargets) {
          try {
            setAutoProgress({ name: mod.name, done: autoTargets.indexOf(mod), total })
            await installModrinthMod({
              projectId: project.id,
              modId: mod.mod_id,
              slug: mod.slug,
              name: mod.name,
              description: mod.description,
            })
            setInstalled((prev) => new Set(prev).add(mod.mod_id))
          } catch (e: any) {
            failures.push(`${mod.name}: ${typeof e === 'string' ? e : e?.message || String(e)}`)
          }
        }
        for (const core of gateAutoTargets) {
          try {
            setAutoProgress({ name: core.name, done: autoTargets.length + gateAutoTargets.indexOf(core), total })
            await installModrinthMod({
              projectId: project.id,
              modId: core.modrinthSlug!,
              slug: core.modrinthSlug!,
              name: core.name,
              description: core.copy,
            })
            setInstalled((prev) => new Set(prev).add(core.modrinthSlug!))
          } catch (e: any) {
            failures.push(`${core.name}: ${typeof e === 'string' ? e : e?.message || String(e)}`)
          }
        }
        // The picks' own deps may now be missing — close the loop (s54-A).
        await refreshDepCheck()
      } finally {
        setAutoInstalling(false)
        setAutoProgress(null)
      }
      if (failures.length > 0) {
        setError(`Couldn't install some mods — retry them below:\n${failures.join('\n')}`)
      }
    },
    [installed, project.id, refreshDepCheck],
  )

  return {
    mods,
    error,
    installing,
    installed,
    depIssues,
    installingDep,
    autoInstalling,
    autoProgress,
    handleInstall,
    handleInstallDep,
    handleContinue,
  }
}