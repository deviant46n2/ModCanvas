// Wizard step 3 (conditional): the FTB Quests Prism install guide (s55).
// FTB Quests is CurseForge-only — ModCanvas's one-click installer can't reach
// CurseForge (keyless Modrinth API), so the mod MUST be installed in Prism,
// which carries its own access AND resolves the three required deps
// (FTB Library / FTB Teams / Architectury) that ModCanvas cannot see.
// This is a full step, not a dismissible warning box: the user learns the
// one thing the app genuinely cannot do for them. No Skip — the green check
// downstream is the gate.

import { useEffect, useState } from 'react'
import { listCuratedMods } from '../../services/mods'
import { openPrismForProject } from '../../services/project'
import type { CuratedMod } from '../../services/types'
import type { Project } from '../../services/types'

interface PrismGuideStepProps {
  project: Project
  /** Re-run the load pipeline before advancing, so the green check sees the
   * mods Prism just installed (s55: without this the check reads the pre-
   * install scan and reports FTB Quests missing even after a real install). */
  onRefresh: () => Promise<void>
  /** Advance to the green check. */
  onContinue: () => void
}

export function PrismGuideStep({ project, onRefresh, onContinue }: PrismGuideStepProps) {
  const [opening, setOpening] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // The CurseForge pick this guide is about (FTB Quests). The step owns the
  // fetch so the wizard doesn't duplicate it; null = defensive fallback
  // (renders the default FTB Quests copy without a manual page link).
  const [cfPick, setCfPick] = useState<CuratedMod | null>(null)

  useEffect(() => {
    let alive = true
    listCuratedMods(project.id)
      .then((list) => {
        if (alive) setCfPick(list.find((m) => m.source === 'curseforge') ?? null)
      })
      .catch(() => {
        /* degrade to the default FTB Quests copy */
      })
    return () => {
      alive = false
    }
  }, [project.id])

  async function handleContinue() {
    try {
      await onRefresh()
    } catch {
      /* a failed refresh degrades to a shorter green check, not a dead end */
    }
    onContinue()
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

  return (
    <div>
      <div style={{ color: 'var(--color-text-secondary)', fontSize: 14, marginBottom: 10 }}>
        <strong style={{ color: 'var(--color-text-primary)' }}>
          {cfPick ? cfPick.name : 'FTB Quests'} installs in Prism
        </strong>
        {' — '}it's CurseForge-only, and ModCanvas's one-click install can't
        reach CurseForge. Prism carries its own access and also installs the
        mods FTB Quests needs to run. This is the one mod you install
        yourself — here's exactly how:
      </div>

      <ol style={{ margin: '10px 0', paddingLeft: 20, fontSize: 14, lineHeight: 1.7 }}>
        <li>
          Click <strong>Open Prism</strong> below — it opens your pack's
          instance, ready to go.
        </li>
        <li>
          Select your pack's instance, then click <strong>Edit</strong> — that
          opens the side panel.
        </li>
        <li>
          In the panel, click <strong>Mods</strong>, then{' '}
          <strong>Download Mods</strong>.
        </li>
        <li>
          In the download window, switch the source to{' '}
          <strong>CurseForge</strong> — FTB Quests isn't on Modrinth.
        </li>
        <li>
          Search <strong>FTB Quests</strong> and click <strong>Install</strong>.
        </li>
        <li>
          When Prism asks about <strong>FTB Library</strong>,{' '}
          <strong>FTB Teams</strong>, and <strong>Architectury</strong> —
          install those too. They're required; without them the quest book
          won't load in-game.
        </li>
        <li>
          Back here, hit <strong>Continue</strong> — the green check will see
          what Prism installed.
        </li>
      </ol>

      {error && (
        <div className="launch-error" style={{ marginBottom: 10, padding: 10 }}>
          <div style={{ fontSize: 13, marginBottom: 6 }}>{error}</div>
          {cfPick?.page_url && (
            <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
              Install it manually from its project page:
              <div style={{ marginTop: 4 }}>
                <a href={cfPick.page_url} target="_blank" rel="noreferrer" style={{ color: 'var(--color-accent)' }}>
                  {cfPick.name}
                </a>{' '}
                — download the jar and drop it into the pack's mods folder.
              </div>
            </div>
          )}
        </div>
      )}

      <div style={{ marginTop: 14 }}>
        <button className="btn-primary" onClick={handleOpenPrism} disabled={opening}>
          {opening ? 'Opening Prism…' : 'Open Prism'}
        </button>
        <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginTop: 6 }}>
          Prism handles version matching and dependencies — it installs
          everything FTB Quests needs automatically.
        </div>
      </div>

      <div className="modal-actions" style={{ marginTop: 16 }}>
        <button className="btn-primary" onClick={handleContinue}>
          Continue
        </button>
      </div>
    </div>
  )
}
