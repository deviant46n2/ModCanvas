import { useEffect, useRef } from 'react'
import type { Behavior, CompileOutput } from '../../services/behavior'
import { TriggerEditor } from './TriggerEditor'
import { ConditionEditor } from './ConditionEditor'
import { ActionEditor } from './ActionEditor'

interface BehaviorCardProps {
  behavior: Behavior
  compiled: CompileOutput | undefined
  onChange: (patch: (b: Behavior) => Behavior) => void
  onCompiled: (out: CompileOutput) => void
  onRemove: () => void
  compile: (b: Behavior) => Promise<CompileOutput>
  /** Request the shared item picker for an action index (give/remove). */
  onBrowseItem: (actionIndex: number) => void
}

/**
 * One behavior card: name, the Trigger → Conditions → Actions rule, and the
 * live compile preview. The rule renders as three labeled rows ("when / if /
 * then"); each row delegates to its kind-specific editor.
 */
export function BehaviorCard({
  behavior,
  compiled,
  onChange,
  onCompiled,
  onRemove,
  compile,
  onBrowseItem,
}: BehaviorCardProps) {
  // Compile on every edit, debounced — the preview follows the draft.
  const compileRef = useRef(compile)
  compileRef.current = compile
  useEffect(() => {
    const t = setTimeout(() => {
      void compileRef.current(behavior).then(onCompiled)
    }, 250)
    return () => clearTimeout(t)
  }, [behavior, onCompiled])

  return (
    <div className="behavior-card">
      <div className="behavior-card-head">
        <input
          className="behavior-name"
          value={behavior.name}
          aria-label="Behavior name"
          onChange={(e) => onChange((b) => ({ ...b, name: e.target.value }))}
        />
        <label className="behavior-backend" title="kubejs: full vocabulary. datapack: vanilla advancements — the faithful subset (unsupported constructs show as compile errors).">
          backend{' '}
          <select
            value={behavior.backend}
            aria-label="Backend"
            onChange={(e) =>
              onChange((b) => ({
                ...b,
                backend: e.target.value as 'kubejs' | 'datapack',
              }))
            }
          >
            <option value="kubejs">KubeJS</option>
            <option value="datapack">datapack</option>
          </select>
        </label>
        <button
          type="button"
          className="behavior-remove"
          aria-label={`Remove ${behavior.name}`}
          onClick={onRemove}
        >
          ✕
        </button>
      </div>

      <TriggerEditor
        trigger={behavior.trigger}
        onChange={(trigger) => onChange((b) => ({ ...b, trigger }))}
      />

      <div className="behavior-rule behavior-if">
        <span className="behavior-rule-label">if</span>
        <div className="behavior-row-editors">
          <ConditionEditor
            conditions={behavior.conditions}
            onChange={(conditions) => onChange((b) => ({ ...b, conditions }))}
          />
        </div>
      </div>

      <div className="behavior-rule behavior-then">
        <span className="behavior-rule-label">then</span>
        <div className="behavior-row-editors">
          <ActionEditor
            actions={behavior.actions}
            onChange={(actions) => onChange((b) => ({ ...b, actions }))}
            onBrowseItem={onBrowseItem}
          />
        </div>
      </div>

      {compiled && (
        <pre className="behavior-preview">
          {'ok' in compiled
            ? `${compiled.ok.backend === 'datapack' ? '// datapack artifact\n' : ''}${
                compiled.ok.warnings.length > 0
                  ? `${compiled.ok.script}\n\n// warnings:\n// ${compiled.ok.warnings.join('\n// ')}`
                  : compiled.ok.script
              }`
            : `Error (${compiled.err.backend}): ${compiled.err.reason}`}
        </pre>
      )}
    </div>
  )
}
