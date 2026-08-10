// Wizard step 5: the green check + Launch (roadmap §9.3 step 6). The verdict
// is the same pure `analyzePackHealth` the Health tab renders, computed here
// from the already-materialized stores — the wizard never rescans, never
// blocks on I/O. GO means "ready to test", not "ready to ship".

import { useMemo, useState } from 'react'
import { usePackHealthStore } from '../../core/pack-health/pack-health-store'
import { useRecipeStore } from '../../core/recipe/recipe-store'
import { analyzePackHealth } from '../../core/pack-health'
import { testProject } from '../../services/project'
import type { Project } from '../../services/types'

interface HealthLaunchStepProps {
  project: Project
  packLoaded: boolean
  /** False when the pack was created without a Prism instance (start from
   *  scratch) — it cannot be launched from ModCanvas, so Launch must not be
   *  offered as if it could. */
  launchable: boolean
  onDone: () => void
}

export function HealthLaunchStep({ project, packLoaded, launchable, onDone }: HealthLaunchStepProps) {
  const questGraph = usePackHealthStore((s) => s.questGraph)
  const itemRegistry = usePackHealthStore((s) => s.itemRegistry)
  const hasCoverImage = usePackHealthStore((s) => s.hasCoverImage)
  const recipes = useRecipeStore((s) => s.recipes)
  const [launching, setLaunching] = useState(false)
  const [launchError, setLaunchError] = useState<string | null>(null)

  const report = useMemo(
    () =>
      analyzePackHealth({
        questGraph,
        itemRegistry,
        recipes,
        packMeta: {
          name: project.name,
          description: project.description,
          author: project.author,
          packVersion: project.pack_version,
        },
        hasCoverImage,
        packLoaded,
      }),
    [questGraph, itemRegistry, recipes, hasCoverImage, packLoaded, project],
  )

  async function handleLaunch() {
    setLaunching(true)
    setLaunchError(null)
    try {
      await testProject(project.id, 'Player', '2G', '4G')
    } catch (e: any) {
      const msg = typeof e === 'string' ? e : e?.message || String(e)
      setLaunchError(msg)
    } finally {
      setLaunching(false)
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <span
          style={{
            padding: '4px 12px', borderRadius: 999, fontSize: 13, fontWeight: 600,
            background: report.go ? 'var(--color-success)' : 'var(--color-danger)',
            color: '#fff',
          }}
        >
          {report.go ? 'Ready to test' : 'Blocking issues found'}
        </span>
        <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
          {report.go
            ? 'No blocking problems. Your pack is worth a launch.'
            : `${report.blockingCount} thing${report.blockingCount === 1 ? '' : 's'} to fix first — the Health tab shows what.`}
        </span>
      </div>
      <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 12 }}>
        {report.blockingCount} blocking · {report.recommendedCount} recommended ·{' '}
        {report.optionalCount} optional — details live in the Health tab.
      </div>

      {launchError && (
        <div className="launch-error" style={{ marginBottom: 12 }}>
          <pre className="copyable" style={{ whiteSpace: 'pre-wrap' }}>{launchError}</pre>
        </div>
      )}

      {!launchable && (
        <div className="launch-error" style={{ marginBottom: 12, padding: 10 }}>
          This pack was created without a Prism instance, so it can't be launched
          from ModCanvas. Create an instance in Prism Launcher, or recreate the
          pack with the "Use a Prism instance" path.
        </div>
      )}

      <div className="modal-actions" style={{ marginTop: 8 }}>
        <button className="btn-secondary" onClick={onDone} disabled={launching}>
          Done
        </button>
        {launchable && (
          <button className="btn-primary" onClick={handleLaunch} disabled={launching}>
            {launching ? 'Launching…' : 'Launch the pack'}
          </button>
        )}
      </div>
      {launchable && (
        <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginTop: 8 }}>
          Launching starts the game with the companion mod attached — 3D item icons
          capture while it runs.
        </div>
      )}
    </div>
  )
}
