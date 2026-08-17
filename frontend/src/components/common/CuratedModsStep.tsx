// Wizard step 4: curated mod picks (roadmap §9.3 step 4). PRISM-LEAN (s53/s54):
// the step CURATES — it tells the user which mods a first pack needs, filtered
// backend-side to what the pack's loader/version supports. Execution splits on
// registry: Modrinth picks install in-app with one click (keyless); CurseForge
// picks (FTB Quests) install through Prism's own downloader, which resolves
// versions AND dependencies ModCanvas cannot see — the step guides that flow
// explicitly, naming the three required FTB deps. Non-instance-backed packs
// (scratch projects) fall back to manual-download links.
//
// s70 (P1-HYGIENE): the install orchestration moved to useCuratedModsInstall
// (unit-testable); this component is wiring + render.

import { useCuratedModsInstall } from '../../hooks/useCuratedModsInstall'
import type { Project } from '../../services/types'
import { CuratedModRow } from './CuratedModRow'

interface CuratedModsStepProps {
  project: Project
  /** Re-run the load pipeline when the wizard continues, so the green check
   *  sees whatever Prism installed. */
  onRefresh: () => Promise<void>
  /** Advance. `true` = a CurseForge pick is in the list, so the wizard must
   *  route to the Prism install guide step before the green check. */
  onContinue: (needsPrismGuide: boolean) => void
  /** Scanned mods/ jar names (ingest result). Feeds the gate auto-install
   *  (s56): a required mod with a `modrinthSlug` that the scan doesn't show
   *  gets installed automatically — the gate list is the source of truth. */
  installedMods: string[] | null
}

export function CuratedModsStep({ project, onRefresh, onContinue, installedMods }: CuratedModsStepProps) {
  const {
    mods, error, installing, installed, depIssues, installingDep,
    autoInstalling, autoProgress, handleInstall, handleInstallDep, handleContinue,
  } = useCuratedModsInstall(project)

  const coreMods = mods?.filter((m) => m.core && m.source !== 'curseforge') ?? []
  const funMods = mods?.filter((m) => !m.core && m.source !== 'curseforge') ?? []
  // The ticked Modrinth picks continue auto-installs (s55). CurseForge picks
  // are excluded (the guide step owns them); unticked picks are opt-ins.
  const autoInstallTargets =
    mods?.filter((m) => m.source === 'modrinth' && m.ticked && !installed.has(m.mod_id)) ?? []
  // FTB Quests is the only CurseForge pick (CF-only) — it installs through
  // Prism, and the wizard routes to a dedicated guide step for it (s55: the
  // old inline box + "Open Prism to install these" button misled users into
  // thinking Prism installs everything; the Modrinth picks install in-app).
  // CF picks are NOT rendered as rows here (s55): a non-actionable row in an
  // action list is a broken affordance — the guide step owns that mod. The
  // flag below still routes the wizard there.
  const needsPrismGuide = mods?.some((m) => m.source === 'curseforge') ?? false

  const onSave = async () => {
    await handleContinue(autoInstallTargets, installedMods)
    try {
      await onRefresh()
    } catch {
      /* a failed refresh degrades to a shorter green check, not a dead end */
    }
    onContinue(needsPrismGuide)
  }

  return (
    <div>
      <div style={{ color: 'var(--color-text-secondary)', fontSize: 14, marginBottom: 10 }}>
        Your first pack works best with a few mods. ModCanvas's editors write to
        the first two — without them your quest book and recipes stay invisible
        in-game. The rest go great with any pack. Everything below is
        pre-filtered to your version and loader.
        {needsPrismGuide && (
          <span>
            {' '}
            <strong>FTB Quests</strong> — the quest book mod — comes in the
            next step: you'll install it in Prism, and we'll show you exactly
            how.
          </span>
        )}
      </div>

      {error && (
        <div className="launch-error" style={{ marginBottom: 10, padding: 10 }}>
          <div style={{ fontSize: 13 }}>{error}</div>
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

      <div className="modal-actions" style={{ marginTop: 16 }}>
        <button
          className="btn-secondary"
          onClick={() => onContinue(needsPrismGuide)}
          disabled={autoInstalling}
        >
          Skip
        </button>
        <button className="btn-primary" onClick={onSave} disabled={autoInstalling}>
          {autoInstalling ? 'Installing…' : 'Continue'}
        </button>
      </div>
      {autoInstalling && autoProgress && (
        <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 8 }}>
          Installing {autoProgress.name}… ({Math.min(autoProgress.done + 1, autoProgress.total)} of{' '}
          {autoProgress.total})
        </div>
      )}
      {!autoInstalling && (
        <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginTop: 8 }}>
          Continue installs the mods above (the next step covers FTB Quests),
          then checks your pack.
        </div>
      )}
    </div>
  )
}