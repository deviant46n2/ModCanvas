import { useEffect, useState } from 'react'
import { useBehaviors } from '../../hooks/useBehaviors'
import { useBehaviorStore } from '../../core/behavior/behavior-store'
import { useBehaviorItemPicker } from '../../hooks/useBehaviorItemPicker'
import { RecipeItemPicker } from '../recipe/RecipeItemPicker'
import type { RecipePickValue } from '../recipe/ItemBrowser'
import {
  makeStarterBehavior,
  type Behavior,
  type CompileOutput,
} from '../../services/behavior'
import { BehaviorCard } from './BehaviorCard'

/**
 * Behavior tab (P2-BEHAVIOR, roadmap §11). The constrained
 * Trigger → Conditions → Actions model made visible: a list of behaviors and
 * a per-card editor for the full §11.1 vocabulary (s46: 10 triggers, 6
 * conditions, 8 actions). Deliberately NOT a generic visual programming
 * language — the vocabulary grows server-side (new IR variants land with
 * their compile paths); this surface renders what the IR declares.
 *
 * UI-layer only (3-layer rule): all data flows through useBehaviors → the
 * three Rust commands. The live compile preview is the completion criterion
 * made visible — an authored behavior emits real KubeJS, warnings and errors
 * from the actual compiler shown as you edit. Item references (give/remove)
 * can be picked from the shared ItemBrowser — the picker is UI-layer only
 * too: it resolves against the pack-health registry + texture index, and the
 * picked id lands in the same IR the compiler reads.
 */
export function BehaviorTab({ projectId, projectPath }: { projectId: string; projectPath: string }) {
  const { loading, error, behaviors, dirty, setBehaviors, save, compile } =
    useBehaviors(projectId)
  const mirrorToStore = useBehaviorStore((s) => s.setBehaviors)
  const [saveMsg, setSaveMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [compiled, setCompiled] = useState<Map<string, CompileOutput>>(new Map())
  // ItemBrowser pick target: which behavior + action index to write into.
  const [pickTarget, setPickTarget] = useState<{ behaviorId: string; actionIndex: number } | null>(null)
  const { items, tags, getTextureUrl } = useBehaviorItemPicker(projectPath)

  // Mirror the working list into the shared store so Pack Health reads the
  // same in-memory truth. Health recomputes on every edit.
  useEffect(() => {
    if (!loading) mirrorToStore(behaviors)
  }, [behaviors, loading, mirrorToStore])

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

  const onPickItem = (value: RecipePickValue) => {
    if (pickTarget && !value.tag) {
      updateBehavior(pickTarget.behaviorId, (b) => ({
        ...b,
        actions: b.actions.map((a, i) =>
          i === pickTarget.actionIndex && 'item' in a ? { ...a, item: value.item } : a,
        ),
      }))
    }
    setPickTarget(null)
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
              onBrowseItem={(actionIndex) =>
                setPickTarget({ behaviorId: b.id, actionIndex })
              }
            />
          ))}
        </div>
      )}

      {saveMsg && (
        <p className={`behavior-save-msg ${saveMsg.ok ? '' : 'behavior-error'}`}>
          {saveMsg.text}
        </p>
      )}

      {pickTarget && (
        <RecipeItemPicker
          items={items}
          tags={tags}
          getTextureUrl={getTextureUrl}
          allowTags={false}
          onSelect={onPickItem}
          onClose={() => setPickTarget(null)}
        />
      )}
    </div>
  )
}
