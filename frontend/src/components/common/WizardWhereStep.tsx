// Wizard step 1: where the pack lives — three modes. Extracted from
// WizardStepper (the 300-line rule). Everything here is a pure question:
// nothing is written until the wizard's commit point (step 3).

import type { MinecraftInstance } from '../../services/instances'
import { ScratchForm } from './scratch-form'

export type WizardMode = 'instance' | 'scratch' | 'new'

interface WizardWhereStepProps {
  mode: WizardMode
  onModeChange: (m: WizardMode) => void
  /** Usable instances (filtered by the shell — one filter, one source). */
  candidates: MinecraftInstance[]
  /** True while the instance list is still loading (first fetch). */
  instancesLoading: boolean
  instanceId: string | null
  onInstanceSelect: (id: string) => void
  scratch: { name: string; mcVersion: string; modLoader: string }
  onScratchChange: (s: { name: string; mcVersion: string; modLoader: string }) => void
}

export function WizardWhereStep({
  mode,
  onModeChange,
  candidates,
  instancesLoading,
  instanceId,
  onInstanceSelect,
  scratch,
  onScratchChange,
}: WizardWhereStepProps) {

  const card = (active: boolean) => ({
    padding: '12px',
    border: active ? '2px solid var(--color-accent)' : '1px solid var(--color-border)',
    borderRadius: '8px',
    cursor: 'pointer',
    background: 'var(--color-bg-surface-1)',
    marginBottom: '8px',
  } as const)

  return (
    <>
      <div style={card(mode === 'instance')} onClick={() => onModeChange('instance')}>
        <strong>Use a Prism instance</strong>
        <div style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
          Start from an existing launcher instance — it can be launched straight from ModCanvas.
        </div>
      </div>
      <div style={card(mode === 'new')} onClick={() => onModeChange('new')}>
        <strong>Create a new instance</strong>
        <div style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
          ModCanvas builds a fresh Prism instance for this pack — the game
          downloads on first launch.
        </div>
        <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginTop: 4 }}>
          MC 1.21.1 · NeoForge — the first supported combo, more coming.
        </div>
      </div>
      <div style={card(mode === 'scratch')} onClick={() => onModeChange('scratch')}>
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
          {instancesLoading && <div style={{ color: 'var(--color-text-tertiary)' }}>Loading instances…</div>}
          {candidates.map((inst) => (
            <div key={inst.id} style={card(instanceId === inst.id)} onClick={() => onInstanceSelect(inst.id)}>
              <strong>{inst.name}</strong>
              <div style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
                MC {inst.mc_version} · {inst.loader}
                {inst.loader_version ? ` ${inst.loader_version}` : ''}
              </div>
            </div>
          ))}
          {candidates.length === 0 && !instancesLoading && (
            <div style={{ color: 'var(--color-warning)' }}>
              No usable instances found. Create one in Prism Launcher, or start from scratch.
            </div>
          )}
        </div>
      )}

      {mode === 'scratch' && (
        <ScratchForm
          projectName={scratch.name}
          onProjectNameChange={(name) => onScratchChange({ ...scratch, name })}
          mcVersion={scratch.mcVersion}
          onMcVersionChange={(mcVersion) => onScratchChange({ ...scratch, mcVersion })}
          modLoader={scratch.modLoader}
          onModLoaderChange={(modLoader) => onScratchChange({ ...scratch, modLoader })}
        />
      )}

      {mode === 'new' && (
        <>
          <div className="form-group">
            <label>Instance name</label>
            <input
              type="text"
              value={scratch.name}
              onChange={(e) => onScratchChange({ ...scratch, name: e.target.value })}
              placeholder="My First Pack"
            />
          </div>
          <div style={{ fontSize: 13, color: 'var(--color-text-tertiary)' }}>
            MC 1.21.1 · NeoForge — locked to the first supported combo.
          </div>
        </>
      )}
    </>
  )
}
