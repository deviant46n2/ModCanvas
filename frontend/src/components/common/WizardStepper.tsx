import { useEffect, useState } from 'react'
import {
  listMcInstances,
  wizardCandidates,
  createMcInstance,
  resolveLoaderVersion,
  type MinecraftInstance,
} from '../../services/instances'
import { listProjectTemplates } from '../../services/project'
import type { CreateProjectInput, Project, ProjectTemplate } from '../../services/types'
import { CuratedModsStep } from './CuratedModsStep'
import { GuidedQuestStep } from './GuidedQuestStep'
import { HealthLaunchStep } from './HealthLaunchStep'
import { WizardWhereStep, type WizardMode } from './WizardWhereStep'

export type { CreateProjectInput } from '../../services/types'

interface WizardStepperProps {
  show: boolean
  onClose: () => void
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

type Mode = WizardMode

const STEP_LABELS: Record<number, string> = {
  1: 'where your pack lives',
  2: 'what it is about',
  3: 'review and create',
  4: 'some mods to start',
  5: 'add your first quest',
  6: 'green check',
}

/**
 * The First-Pack wizard (roadmap P0-WIZARD, §9.3). Steps 1-2 have zero side
 * effects — nothing is written until Create — so closing the wizard at any
 * point strands nobody. After Create the pack loads underneath the wizard and
 * steps 4-5 (curated mods, green check + launch) run against the live pack.
 */
export function WizardStepper({
  show,
  onClose,
  onCreate,
  onRefresh,
  packLoaded,
  onDone,
  onGuidedQuest,
}: WizardStepperProps) {
  const [step, setStep] = useState(1)
  const [mode, setMode] = useState<Mode>('instance')
  const [instances, setInstances] = useState<MinecraftInstance[] | null>(null)
  const [templates, setTemplates] = useState<ProjectTemplate[] | null>(null)
  const [instanceId, setInstanceId] = useState<string | null>(null)
  const [templateId, setTemplateId] = useState('')
  const [scratch, setScratch] = useState({ name: '', mcVersion: '1.21.1', modLoader: 'Forge' })
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [project, setProject] = useState<Project | null>(null)

  useEffect(() => {
    if (!show) return
    setStep(1)
    setMode('instance')
    setInstanceId(null)
    setTemplateId('')
    setScratch({ name: '', mcVersion: '1.21.1', modLoader: 'Forge' })
    setError(null)
    setCreating(false)
    setProject(null)
    setInstances(null)
    setTemplates(null)
    listMcInstances().then(setInstances).catch((e) => setError(String(e)))
    listProjectTemplates().then(setTemplates).catch((e) => setError(String(e)))
  }, [show])

  const candidates = instances ? wizardCandidates(instances) : []
  const instance = candidates.find((i) => i.id === instanceId) ?? null
  const template = templates?.find((t) => t.id === templateId) ?? null

  function buildInput(): CreateProjectInput {
    if (mode === 'instance' && instance) {
      return {
        name: instance.name,
        mcVersion: instance.mc_version,
        modLoader: instance.loader,
        path: instance.game_dir,
        templateId: templateId === '' ? null : templateId,
      }
    }
    // 'new' mode has no path yet — the instance is created at the commit
    // point (step 3) and buildInput is only used for the review display.
    if (mode === 'new') {
      return {
        name: scratch.name,
        mcVersion: '1.21.1',
        modLoader: 'NeoForge',
        path: 'New Prism instance',
        templateId: templateId === '' ? null : templateId,
      }
    }
    return {
      name: scratch.name,
      mcVersion: scratch.mcVersion,
      modLoader: scratch.modLoader,
      path: `~/modpacks/${scratch.name.toLowerCase().replace(/\s+/g, '-')}`,
      templateId: templateId === '' ? null : templateId,
    }
  }

  const step1Complete =
    mode === 'instance'
      ? instanceId !== null
      : scratch.name.trim().length > 0

  async function handleCreate() {
    setCreating(true)
    setError(null)
    try {
      let created: Project
      if (mode === 'new') {
        // The wizard's one supported combo (NeoForge 1.21.1). Resolve the
        // latest loader version, create the Prism instance, then create the
        // project ON it — one commit, no created-but-empty states.
        const loaderVersion = await resolveLoaderVersion('1.21.1', 'NeoForge')
        if (!loaderVersion) {
          throw new Error(
            "Couldn't determine the latest NeoForge version — check your connection and retry.",
          )
        }
        const mcInstance = await createMcInstance(scratch.name, '1.21.1', 'NeoForge', loaderVersion)
        created = await onCreate({
          name: scratch.name,
          mcVersion: '1.21.1',
          modLoader: 'NeoForge',
          path: mcInstance.game_dir,
          templateId: templateId === '' ? null : templateId,
        })
      } else {
        created = await onCreate(buildInput())
      }
      setProject(created)
      setStep(4)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setCreating(false)
    }
  }

  if (!show) return null

  const card = (active: boolean) => ({
    padding: '12px',
    border: active ? '2px solid var(--color-accent)' : '1px solid var(--color-border-default)',
    borderRadius: '8px',
    cursor: 'pointer',
    background: 'var(--color-bg-surface-1)',
    marginBottom: '8px',
  } as const)

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ width: 560, maxWidth: '90vw' }} onClick={(e) => e.stopPropagation()}>
        <h2>New Pack</h2>
        <div style={{ fontSize: 13, color: 'var(--color-text-tertiary)', marginBottom: 12 }}>
          Step {step} of 6 — {STEP_LABELS[step]}
        </div>

        {error && (
          <div className="launch-error" style={{ marginBottom: 12 }}>
            <pre className="copyable" style={{ whiteSpace: 'pre-wrap' }}>{error}</pre>
          </div>
        )}

        {step === 1 && (
          <WizardWhereStep
            mode={mode}
            onModeChange={setMode}
            candidates={candidates}
            instancesLoading={instances === null}
            instanceId={instanceId}
            onInstanceSelect={setInstanceId}
            scratch={scratch}
            onScratchChange={setScratch}
          />
        )}

        {step === 2 && (
          <>
            <div style={{ color: 'var(--color-text-secondary)', fontSize: 14, marginBottom: 10 }}>
              Pick a starting point for <strong>{mode === 'instance' ? instance?.name : scratch.name}</strong>.
              Templates add a starter quest book — you can always edit or delete it later.
            </div>
            {templates === null && <div style={{ color: 'var(--color-text-tertiary)' }}>Loading templates…</div>}
            {templates?.map((t) => (
              <div key={t.id} style={card(templateId === t.id)} onClick={() => setTemplateId(t.id)}>
                <strong>{t.name}</strong>
                <div style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>{t.description}</div>
              </div>
            ))}
            <div style={card(templateId === '')} onClick={() => setTemplateId('')}>
              <strong>Start empty</strong>
              <div style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
                No starter content — add quests, recipes, and configs yourself.
              </div>
            </div>
          </>
        )}

        {step === 3 && (
          <div style={{ fontSize: 14 }}>
            <div style={{ marginBottom: 8 }}>
              <div style={{ color: 'var(--color-text-tertiary)' }}>Name</div>
              <strong>{buildInput().name}</strong>
            </div>
            <div style={{ marginBottom: 8 }}>
              <div style={{ color: 'var(--color-text-tertiary)' }}>Version / loader</div>
              <strong>
                MC {buildInput().mcVersion} · {buildInput().modLoader}
              </strong>
            </div>
            <div style={{ marginBottom: 8 }}>
              <div style={{ color: 'var(--color-text-tertiary)' }}>Where it lives</div>
              <strong style={{ wordBreak: 'break-all' }}>{buildInput().path}</strong>
            </div>
            <div>
              <div style={{ color: 'var(--color-text-tertiary)' }}>Starting point</div>
              <strong>{template ? template.name : 'Empty pack'}</strong>
            </div>
          </div>
        )}

        {step === 4 && project && (
          <CuratedModsStep
            project={project}
            onRefresh={onRefresh}
            onContinue={() => setStep(5)}
          />
        )}

        {step === 5 && project && (
          <GuidedQuestStep
            onAdd={onGuidedQuest}
            onSkip={() => setStep(6)}
          />
        )}

        {step === 6 && project && (
          <HealthLaunchStep
            project={project}
            packLoaded={packLoaded}
            launchable={mode !== 'scratch'}
            onDone={onDone}
          />
        )}

        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose} disabled={creating}>Cancel</button>
          {step > 1 && step < 4 && (
            <button className="btn-secondary" onClick={() => setStep(step - 1)} disabled={creating}>Back</button>
          )}
          {step === 1 && (
            <button className="btn-primary" onClick={() => setStep(2)} disabled={!step1Complete}>Next</button>
          )}
          {step === 2 && (
            <button className="btn-primary" onClick={() => setStep(3)}>Next</button>
          )}
          {step === 3 && (
            <button className="btn-primary" onClick={handleCreate} disabled={creating}>
              {creating ? 'Creating…' : 'Create & continue'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
