import { useEffect, useState } from 'react'
import {
  listMcInstances,
  wizardCandidates,
  type MinecraftInstance,
} from '../../services/instances'
import { listProjectTemplates } from '../../services/project'
import type { CreateProjectInput, ProjectTemplate } from '../../services/types'
import { ScratchForm } from './scratch-form'

export type { CreateProjectInput } from '../../services/types'

interface WizardStepperProps {
  show: boolean
  onClose: () => void
  onCreate: (input: CreateProjectInput) => Promise<void>
}

type Mode = 'instance' | 'scratch'

/**
 * The First-Pack wizard (roadmap P0-WIZARD, §9.3 steps 1-3): pick where the
 * pack lives, pick what it's about, create. Steps 1-2 have zero side effects
 * — nothing is written until Create — so closing the wizard at any step
 * strands nobody. The classic 3-field form lives inside as "start from
 * scratch"; the beginner path is "use a Prism instance", which derives the
 * version/loader/path from the instance so no technical question is asked.
 */
export function WizardStepper({ show, onClose, onCreate }: WizardStepperProps) {
  const [step, setStep] = useState(1)
  const [mode, setMode] = useState<Mode>('instance')
  const [instances, setInstances] = useState<MinecraftInstance[] | null>(null)
  const [templates, setTemplates] = useState<ProjectTemplate[] | null>(null)
  const [instanceId, setInstanceId] = useState<string | null>(null)
  const [templateId, setTemplateId] = useState('')
  const [scratch, setScratch] = useState({ name: '', mcVersion: '1.21.1', modLoader: 'Forge' })
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!show) return
    setStep(1)
    setMode('instance')
    setInstanceId(null)
    setTemplateId('')
    setScratch({ name: '', mcVersion: '1.21.1', modLoader: 'Forge' })
    setError(null)
    setCreating(false)
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
      await onCreate(buildInput())
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
          Step {step} of 3{step === 2 ? ' — what is your pack about?' : ''}
          {step === 3 ? ' — review and create' : ''}
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
              Templates add a starter quest chapter — you can always edit or delete it later.
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

        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose} disabled={creating}>Cancel</button>
          {step > 1 && (
            <button className="btn-secondary" onClick={() => setStep(step - 1)} disabled={creating}>Back</button>
          )}
          {step < 3 ? (
            <button className="btn-primary" onClick={() => setStep(step + 1)} disabled={!step1Complete}>
              Next
            </button>
          ) : (
            <button className="btn-primary" onClick={handleCreate} disabled={creating}>
              {creating ? 'Creating…' : 'Create Pack'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
