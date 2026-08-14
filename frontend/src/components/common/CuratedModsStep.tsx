// Wizard step 4: curated mod picks (roadmap §9.3 step 4). PRISM-LEAN (s53/s54):
// the step CURATES — it tells the user which mods a first pack needs, filtered
// backend-side to what the pack's loader/version supports. Execution splits on
// registry: Modrinth picks install in-app with one click (keyless); CurseForge
// picks (FTB Quests) install through Prism's own downloader, which resolves
// versions AND dependencies ModCanvas cannot see — the step guides that flow
// explicitly, naming the three required FTB deps. Non-instance-backed packs
// (scratch projects) fall back to manual-download links.

import { useEffect, useState } from 'react'
import { listCuratedMods, installModrinthMod, checkCompatibility } from '../../services/mods'
import { openPrismForProject } from '../../services/project'
import type { CompatibilityInstall, CompatibilityIssue, CuratedMod } from '../../services/types'
import type { Project } from '../../services/types'
import { CuratedModRow } from './CuratedModRow'

interface CuratedModsStepProps {
  project: Project
  /** Re-run the load pipeline when the wizard continues, so the green check
   * sees whatever Prism installed. */
  onRefresh: () => Promise<void>
  onContinue: () => void
}

export function CuratedModsStep({ project, onRefresh, onContinue }: CuratedModsStepProps) {
  const [mods, setMods] = useState<CuratedMod[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [opening, setOpening] = useState(false)
  const [installing, setInstalling] = useState<Set<string>>(new Set())
  const [installed, setInstalled] = useState<Set<string>>(new Set())
  // Missing required deps (the compat check's issues, s54-A: the step closes
  // its own one-click loop — a pick like KubeJS pulls a dep like Rhino, and
  // the fix appears here, not in a hidden tab).
  const [depIssues, setDepIssues] = useState<CompatibilityIssue[]>([])
  const [installingDep, setInstallingDep] = useState<Set<string>>(new Set())

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

  async function refreshDepCheck() {
    try {
      const result = await checkCompatibility(project.id)
      setDepIssues(result.issues)
    } catch {
      /* same degrade-to-no-claim rule */
    }
  }

  async function handleInstall(mod: CuratedMod) {
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
  }

  async function handleInstallDep(install: CompatibilityInstall) {
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
  }

  async function handleOpenPrism() {
    if (opening) return
    setOpening(true)
    setError(null)
    try {
      await openPrismForProject(project.id)
    } catch (e: any) {
      setError(typeof e === 'string' ? e : e?.message || String(e))
    } finally {
      setOpening(false)
    }
  }

  async function handleContinue() {
    try {
      await onRefresh()
    } catch {
      /* a failed refresh degrades to a shorter green check, not a dead end */
    }
    onContinue()
  }

  const coreMods = mods?.filter((m) => m.core) ?? []
  const funMods = mods?.filter((m) => !m.core) ?? []
  const manualLinks = mods?.filter((m) => m.page_url) ?? []
  // FTB Quests is the only CurseForge pick (CF-only) — it needs the Prism
  // guide; everything else installs in-app.
  const needsPrismGuide = mods?.some((m) => m.source === 'curseforge') ?? false

  return (
    <div>
      <div style={{ color: 'var(--color-text-secondary)', fontSize: 14, marginBottom: 10 }}>
        Your first pack works best with a few mods. ModCanvas's editors write to
        the first two — without them your quest book and recipes stay invisible
        in-game. The rest go great with any pack. Everything below is
        pre-filtered to your version and loader.
      </div>

      {error && (
        <div className="launch-error" style={{ marginBottom: 10, padding: 10 }}>
          <div style={{ fontSize: 13, marginBottom: 6 }}>{error}</div>
          {manualLinks.length > 0 && (
            <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
              Install the mods manually from their project pages:
              {manualLinks.map((m) => (
                <div key={m.slug} style={{ marginTop: 4 }}>
                  <a href={m.page_url!} target="_blank" rel="noreferrer" style={{ color: 'var(--color-accent)' }}>
                    {m.name}
                  </a>{' '}
                  — download the jar and drop it into the pack's mods folder.
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {mods === null && !error && (
        <div style={{ color: 'var(--color-text-tertiary)' }}>Loading suggestions…</div>
      )}

      {coreMods.length > 0 && (
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-accent)', margin: '10px 0 6px' }}>
          Needed by ModCanvas
        </div>
      )}
      {coreMods.map((mod) => (
        <CuratedModRow
          key={mod.slug}
          mod={mod}
          onInstall={mod.source === 'modrinth' ? handleInstall : undefined}
          installing={installing.has(mod.mod_id)}
          installed={installed.has(mod.mod_id)}
        />
      ))}

      {needsPrismGuide && (
        <div
          style={{
            fontSize: 12, color: 'var(--color-text-secondary)',
            border: '1px solid var(--color-border-default)', borderRadius: 8,
            padding: '10px 12px', margin: '8px 0',
          }}
        >
          <strong style={{ color: 'var(--color-text-primary)' }}>FTB Quests installs in Prism</strong>
          {' — '}it's CurseForge-only, and ModCanvas's one-click install can't
          reach CurseForge (Prism carries its own access and also installs the
          mods FTB Quests needs to run):
          <ol style={{ margin: '6px 0 0', paddingLeft: 18 }}>
            <li>Open Prism (the button below), click your instance, then <strong>Mods → Download Mods</strong>.</li>
            <li>Search <strong>FTB Quests</strong> and click <strong>Install</strong>.</li>
            <li>
              When Prism asks about <strong>FTB Library</strong>, <strong>FTB Teams</strong>, and{' '}
              <strong>Architectury</strong> — install those too. They're required;
              without them the quest book won't load in-game.
            </li>
            <li>Back here, hit <strong>Continue</strong> — the check will see what Prism installed.</li>
          </ol>
        </div>
      )}

      {funMods.length > 0 && (
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-tertiary)', margin: '10px 0 6px' }}>
          Goes great with your pack
        </div>
      )}
      {funMods.map((mod) => (
        <CuratedModRow
          key={mod.slug}
          mod={mod}
          onInstall={mod.source === 'modrinth' ? handleInstall : undefined}
          installing={installing.has(mod.mod_id)}
          installed={installed.has(mod.mod_id)}
        />
      ))}

      {depIssues.length > 0 && (
        <div style={{ margin: '10px 0' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-warning, #d97706)', marginBottom: 6 }}>
            Needs these to run
          </div>
          {depIssues.map((issue) => (
            <div
              key={issue.install?.mod_id ?? issue.message}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px',
                border: '1px solid var(--color-border-default)', borderRadius: 8, marginBottom: 6,
              }}
            >
              <div style={{ flex: 1, fontSize: 13 }}>{issue.message}</div>
              {issue.install && (
                <button
                  className="btn-secondary btn-sm"
                  onClick={() => handleInstallDep(issue.install!)}
                  disabled={installingDep.has(issue.install.mod_id)}
                  aria-label={`Install ${issue.install.name}`}
                >
                  {installingDep.has(issue.install.mod_id) ? 'Installing…' : 'Install'}
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: 14 }}>
        <button
          className="btn-primary"
          onClick={handleOpenPrism}
          disabled={opening || mods === null}
        >
          {opening ? 'Opening Prism…' : 'Open Prism to install these'}
        </button>
        <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginTop: 6 }}>
          Prism handles version matching and dependencies — it installs everything
          FTB Quests needs automatically. When you're done, continue below.
        </div>
      </div>

      <div className="modal-actions" style={{ marginTop: 16 }}>
        <button className="btn-secondary" onClick={onContinue}>
          Skip
        </button>
        <button className="btn-primary" onClick={handleContinue}>
          Continue
        </button>
      </div>
    </div>
  )
}
