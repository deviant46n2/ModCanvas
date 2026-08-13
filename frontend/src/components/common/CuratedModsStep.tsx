// Wizard step 4: curated mod picks (roadmap §9.3 step 4). PRISM-LEAN (s53):
// the step CURATES — it tells the user which mods a first pack needs, filtered
// backend-side to what the pack's loader/version supports — and hands
// EXECUTION to Prism's own downloader, which resolves versions AND
// dependencies (something ModCanvas does not reimplement; the in-app install
// machinery was deprecated under the s53 ruling). Non-instance-backed packs
// (scratch projects) fall back to manual-download links.

import { useEffect, useState } from 'react'
import { listCuratedMods } from '../../services/mods'
import { openPrismForProject } from '../../services/project'
import type { CuratedMod } from '../../services/types'
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
      {coreMods.map((mod) => <CuratedModRow key={mod.slug} mod={mod} />)}

      {funMods.length > 0 && (
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-tertiary)', margin: '10px 0 6px' }}>
          Goes great with your pack
        </div>
      )}
      {funMods.map((mod) => <CuratedModRow key={mod.slug} mod={mod} />)}

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
