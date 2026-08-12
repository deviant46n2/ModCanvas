import { useEffect, useRef, useState } from 'react'
import { useBehaviors } from '../../hooks/useBehaviors'
import {
  makeStarterBehavior,
  type Behavior,
  type CompileOutput,
} from '../../services/behavior'

/**
 * Behavior tab MVP (P2-BEHAVIOR, roadmap §11). The constrained
 * Trigger → Conditions → Actions model made visible: a list of behaviors and
 * a per-card editor for the current vocabulary. Deliberately NOT a generic
 * visual programming language — no loops, no variables, no arbitrary
 * condition wiring. The vocabulary grows server-side (new IR variants land
 * with their compile paths); this surface renders what the IR declares.
 *
 * UI-layer only (3-layer rule): all data flows through useBehaviors → the
 * three Rust commands. The live compile preview is the completion criterion
 * made visible — an authored behavior emits real KubeJS, warnings and errors
 * from the actual compiler shown as you edit.
 */
export function BehaviorTab({ projectId }: { projectId: string }) {
  const { loading, error, behaviors, dirty, setBehaviors, save, compile } =
    useBehaviors(projectId)
  const [saveMsg, setSaveMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [compiled, setCompiled] = useState<Map<string, CompileOutput>>(new Map())

  const addBehavior = () => {
    const b = makeStarterBehavior(`Behavior ${behaviors.length + 1}`)
    setBehaviors([...behaviors, b])
    setSaveMsg(null)
  }

  const removeBehavior = (id: string) => {
    setBehaviors(behaviors.filter((b) => b.id !== id))
    setSaveMsg(null)
  }

  const updateBehavior = (id: string, patch: (b: Behavior) => Behavior) => {
    setBehaviors(behaviors.map((b) => (b.id === id ? patch(b) : b)))
    setSaveMsg(null)
  }

  const onSave = async () => {
    const result = await save()
    if (!result.ok) {
      setSaveMsg({ ok: false, text: `Save failed: ${result.error}` })
    } else if (result.emitFailures.length > 0) {
      setSaveMsg({
        ok: false,
        text: `Saved, but ${result.emitFailures.length} behavior(s) did not reach the instance: ${result.emitFailures.join('; ')}`,
      })
    } else {
      setSaveMsg({ ok: true, text: 'Saved — behaviors written to the instance' })
    }
  }

  return (
    <div className="behavior-tab" data-testid="behavior-tab">
      <div className="behavior-header">
        <h2>Behaviors</h2>
        <div className="behavior-actions">
          {dirty && <span className="behavior-dirty">Unsaved changes</span>}
          <button type="button" onClick={addBehavior}>Add behavior</button>
          <button type="button" onClick={onSave} disabled={!dirty}>Save</button>
        </div>
      </div>

      {loading ? (
        <p className="behavior-status">Loading behaviors…</p>
      ) : error ? (
        <p className="behavior-status behavior-error">{error}</p>
      ) : behaviors.length === 0 ? (
        <div className="behavior-empty">
          <p>No behaviors yet. Behaviors are “when X, if Y, do Z” rules compiled to
            real KubeJS scripts.</p>
          <button type="button" onClick={addBehavior}>Add your first behavior</button>
        </div>
      ) : (
        <div className="behavior-list">
          {behaviors.map((b) => (
            <BehaviorCard
              key={b.id}
              behavior={b}
              compiled={compiled.get(b.id)}
              onChange={(patch) => updateBehavior(b.id, patch)}
              onCompiled={(out) =>
                setCompiled((m) => new Map(m).set(b.id, out))
              }
              onRemove={() => removeBehavior(b.id)}
              compile={compile}
            />
          ))}
        </div>
      )}

      {saveMsg && (
        <p className={`behavior-save-msg ${saveMsg.ok ? '' : 'behavior-error'}`}>
          {saveMsg.text}
        </p>
      )}
    </div>
  )
}

interface BehaviorCardProps {
  behavior: Behavior
  compiled: CompileOutput | undefined
  onChange: (patch: (b: Behavior) => Behavior) => void
  onCompiled: (out: CompileOutput) => void
  onRemove: () => void
  compile: (b: Behavior) => Promise<CompileOutput>
}

function BehaviorCard({
  behavior,
  compiled,
  onChange,
  onCompiled,
  onRemove,
  compile,
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

  const give = behavior.actions[0]?.kind === 'give_item'
    ? behavior.actions[0]
    : null

  return (
    <div className="behavior-card">
      <div className="behavior-card-head">
        <input
          className="behavior-name"
          value={behavior.name}
          aria-label="Behavior name"
          onChange={(e) => onChange((b) => ({ ...b, name: e.target.value }))}
        />
        <button
          type="button"
          className="behavior-remove"
          aria-label={`Remove ${behavior.name}`}
          onClick={onRemove}
        >
          ✕
        </button>
      </div>

      <div className="behavior-rule">
        <span className="behavior-rule-label">when</span>
        <select
          value={behavior.trigger.kind}
          aria-label="Trigger"
          onChange={(e) =>
            onChange((b) => ({
              ...b,
              trigger: { kind: e.target.value as 'player_joins_game' },
            }))
          }
        >
          <option value="player_joins_game">player joins the game</option>
        </select>

        <span className="behavior-rule-label">then</span>
        <select
          value={give?.kind ?? 'none'}
          aria-label="Action"
          onChange={(e) => {
            if (e.target.value === 'give_item') {
              onChange((b) => ({
                ...b,
                actions: [
                  { kind: 'give_item', item: 'minecraft:diamond', count: 1 },
                ],
              }))
            } else {
              onChange((b) => ({ ...b, actions: [] }))
            }
          }}
        >
          <option value="none">(no action)</option>
          <option value="give_item">give item</option>
        </select>

        {give && (
          <span className="behavior-give">
            <input
              value={give.item}
              aria-label="Item id"
              placeholder="minecraft:diamond"
              onChange={(e) =>
                onChange((b) => ({
                  ...b,
                  actions: [
                    { ...(b.actions[0] ?? give), item: e.target.value },
                  ],
                }))
              }
            />
            <input
              type="number"
              min={1}
              value={give.count}
              aria-label="Count"
              onChange={(e) =>
                onChange((b) => ({
                  ...b,
                  actions: [
                    {
                      ...(b.actions[0] ?? give),
                      count: Math.max(1, Number(e.target.value) || 1),
                    },
                  ],
                }))
              }
            />
          </span>
        )}
      </div>

      {compiled && (
        <pre className="behavior-preview">
          {'ok' in compiled
            ? compiled.ok.script
            : `Error: ${compiled.err.reason}`}
        </pre>
      )}
    </div>
  )
}
