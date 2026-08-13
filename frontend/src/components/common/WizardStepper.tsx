import { useEffect, useState } from 'react'
import {
  createMcInstance,
  resolveLoaderVersion,
} from '../../services/instances'
import type { CreateProjectInput, Project } from '../../services/types'
import { CuratedModsStep } from './CuratedModsStep'
import { GuidedQuestStep } from './GuidedQuestStep'
import { HealthLaunchStep } from './HealthLaunchStep'

export type { CreateProjectInput } from '../../services/types'

interface WizardStepperProps {
  show: boolean
  onClose: () => void
  /** The template the StartChooser picked; null for a blank pack. The wizard
   *  no longer offers a template or where step — those decisions live in the
   *  chooser. Every wizard start auto-creates a Prism instance. */
  presetTemplateId: string | null
  /** Run the post-create steps (curated mods, guided quest, green check).
   *  Blank starts skip them and land straight in the IDE. */
  postCreate: boolean
  /** Create + open the pack (the App runs the load pipeline). Resolves with
   *  the created project so the wizard can continue to its post-create steps;
   *  throws on failure so the wizard stays open and shows why. */
  onCreate: (input: CreateProjectInput) => Promise<Project>
  /** Re-run the load pipeline (after curated installs, so the green check
   *  sees the new mods). */
  onRefresh: () => Promise<void>
  packLoaded: boolean
  /** Close the wizard (Done / after Launch). The pack stays open. */
  onDone: () => void
  /** Guided first quest (P0-MINIWIZ): close the wizard, switch to the quests
   *  tab, and open the guided-quest modal inside the editor. */
  onGuidedQuest: () => void
}

const STEP_LABELS: Record<number, string> = {
  1: 'name your pack',
  2: 'some mods to start',
  3: 'add your first quest',
  4: 'green check',
}

/**
 * The First-Pack wizard (roadmap P0-WIZARD, §9.3, s49 reshape). The
 * StartChooser owns the template + where decisions, so the wizard is a thin
 * commit point: one name input (the pack lands on a fresh auto-created Prism
 * instance, MC 1.21.1 · NeoForge — the first supported combo), then the
 * post-create steps (curated mods, guided quest, green check + launch) run
 * against the live pack — unless `postCreate` is false (a blank start), which
 * lands straight in the IDE.
 */
export function WizardStepper({
  show,
  presetTemplateId,
  postCreate,
  onClose,
  onCreate,
  onRefresh,
  packLoaded,
  onDone,
  onGuidedQuest,
}: WizardStepperProps) {
  const [step, setStep] = useState(1)
  const [name, setName] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [project, setProject] = useState<Project | null>(null)

  // The wizard stays mounted (returns null when hidden), so every open MUST
  // reset to a fresh session — otherwise the next pick reopens at the stale
  // step with the stale project (s49: "immediately step 3", "project not
  // found" on the curated step from a previous session's project id).
  useEffect(() => {
    if (!show) return
    setStep(1)
    setName('')
    setCreating(false)
    setError(null)
    setProject(null)
  }, [show])

  async function handleCreate() {
    if (!name.trim()) return
    setCreating(true)
    setError(null)
    try {
      // The wizard's one supported combo (NeoForge 1.21.1). Resolve the
      // latest loader version, create the Prism instance, then create the
      // project ON it — one commit, no created-but-empty states.
      const loaderVersion = await resolveLoaderVersion('1.21.1', 'NeoForge')
      if (!loaderVersion) {
        throw new Error(
          "Couldn't determine the latest NeoForge version — check your connection and retry.",
        )
      }
      const mcInstance = await createMcInstance(name.trim(), '1.21.1', 'NeoForge', loaderVersion)
      const created = await onCreate({
        name: name.trim(),
        mcVersion: '1.21.1',
        modLoader: 'NeoForge',
        path: mcInstance.game_dir,
        templateId: presetTemplateId,
      })
      setProject(created)
      // Blank starts skip the post-create steps and land straight in the IDE.
      if (!postCreate) {
        onDone()
      } else {
        setStep(2)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setCreating(false)
    }
  }

  if (!show) return null

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ width: 560, maxWidth: '90vw' }} onClick={(e) => e.stopPropagation()}>
        <h2>New Pack</h2>
        <div style={{ fontSize: 13, color: 'var(--color-text-tertiary)', marginBottom: 12 }}>
          Step {step} of {postCreate ? 4 : 1} — {STEP_LABELS[step]}
        </div>

        {error && (
          <div className="launch-error" style={{ marginBottom: 12 }}>
            <pre className="copyable" style={{ whiteSpace: 'pre-wrap' }}>{error}</pre>
          </div>
        )}

        {step === 1 && (
          <>
            <div className="form-group">
              <label>Pack name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My First Pack"
                autoFocus
              />
            </div>
            <div style={{ fontSize: 13, color: 'var(--color-text-tertiary)', marginBottom: 12 }}>
              MC 1.21.1 · NeoForge — ModCanvas creates a fresh Prism instance
              for this pack. The game downloads on first launch.
            </div>
          </>
        )}

        {step === 2 && project && (
          <CuratedModsStep
            project={project}
            onRefresh={onRefresh}
            onContinue={() => setStep(3)}
          />
        )}

        {step === 3 && project && (
          <GuidedQuestStep
            onAdd={onGuidedQuest}
            onSkip={() => setStep(4)}
          />
        )}

        {step === 4 && project && (
          <HealthLaunchStep
            project={project}
            packLoaded={packLoaded}
            launchable
            onDone={onDone}
          />
        )}

        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose} disabled={creating}>Cancel</button>
          {step === 1 && (
            <button className="btn-primary" onClick={handleCreate} disabled={creating || !name.trim()}>
              {creating ? 'Creating…' : 'Create & continue'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
