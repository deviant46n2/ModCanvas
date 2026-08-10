import { useEffect, useState } from 'react'
import {
  listMcInstances,
  wizardCandidates,
  type MinecraftInstance,
} from '../../services/instances'
import { listProjectTemplates } from '../../services/project'
import type { CreateProjectInput, Project, ProjectTemplate } from '../../services/types'
import { ScratchForm } from './scratch-form'
import { CuratedModsStep } from './CuratedModsStep'
import { HealthLaunchStep } from './HealthLaunchStep'

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
}

type Mode = 'instance' | 'scratch'

const STEP_LABELS: Record<number, string> = {
  1: 'where your pack lives',
  2: 'what it is about',
  3: 'review and create',
  4: 'some mods to start',
  5: 'green check',
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
    return {
      name: scratch.name,
      mcVersion: scratch.mcVersion,
      modLoader: scratch.modLoader,
      path: `~/modpacks/${scratch.name.toLowerCase().replace(/\s+/g, '-')}`,
      templateId: templateId === '' ? null : templateId,
    }
  }

  const step1Complete =
    mode === 'instance' ? instanceId !== null : scratch.name.trim().length > 0

  async function handleCreate() {
    setCreating(true)
    setError(null)
    try {
      const created = await onCreate(buildInput())
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
    border: active ? '2px solid var(--color-accent)' : '1px solid var(--color-border)',
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
          Step {step} of 5 — {STEP_LABELS[step]}
        </div>

        {error && (
          <div className="launch-error" style={{ marginBottom: 12 }}>
            <pre className="copyable" style={{ whiteSpace: 'pre-wrap' }}>{error}</pre>
          </div>
        )}

        {step === 1 && (
          <>
            <div style={card(mode === 'instance')} onClick={() => setMode('instance')}>
              <strong>Use a Prism instance</strong>
              <div style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
                Start from an existing launcher instance — it can be launched straight from ModCanvas.
              </div>
            </div>
            <div style={card(mode === 'scratch')} onClick={() => setMode('scratch')}>
              <strong>Start from scratch</strong>
              <div style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
                Create an empty pack folder with just a version and loader.
              </div>
              <div style={{ fontSize: 12, color: 'var(--color-warning)', marginTop: 4 }}>
                No launcher instance — this pack can't be launched from ModCanvas. Use it
                with external tools (e.g. export it and run it through Prism).
              </div>
            </div>

            {mode === 'instance' && (
              <div style={{ maxHeight: 260, overflowY: 'auto', marginTop: 8 }}>
                {instances === null && <div style={{ color: 'var(--color-text-tertiary)' }}>Loading instances…</div>}
                {candidates.map((inst) => (
                  <div key={inst.id} style={card(instanceId === inst.id)} onClick={() => setInstanceId(inst.id)}>
                    <strong>{inst.name}</strong>
                    <div style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
                      MC {inst.mc_version} · {inst.loader}
                      {inst.loader_version ? ` ${inst.loader_version}` : ''}
                    </div>
                  </div>
                ))}
                {candidates.length === 0 && instances !== null && (
                  <div style={{ color: 'var(--color-warning)' }}>
                    No usable instances found. Create one in Prism Launcher, or start from scratch.
                  </div>
                )}
              </div>
            )}

            {mode === 'scratch' && (
              <ScratchForm
                projectName={scratch.name}
                onProjectNameChange={(name) => setScratch((s) => ({ ...s, name }))}
                mcVersion={scratch.mcVersion}
                onMcVersionChange={(mcVersion) => setScratch((s) => ({ ...s, mcVersion }))}
                modLoader={scratch.modLoader}
                onModLoaderChange={(modLoader) => setScratch((s) => ({ ...s, modLoader }))}
              />
            )}
          </>
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
          <HealthLaunchStep
            project={project}
            packLoaded={packLoaded}
            launchable={mode === 'instance'}
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
