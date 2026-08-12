import { useState } from 'react'
import type { LootPoolModel } from '../../core/loot/model'
import type { ConditionField } from '../../core/loot/conditions'
import {
  TYPED_CONDITIONS,
  conditionFieldValue,
  editConditionField,
  newConditionValue,
  typedConditionFor,
} from '../../core/loot/conditions'

/**
 * A pool's condition list (P3-LOOT follow-up): typed forms for the common
 * conditions, opaque read-only rows for the rest, and an Add Condition
 * dropdown (typed templates + raw-JSON entry). Conditions stay `Vec<Value>` —
 * typed edits write only the typed key, so unknown internals survive
 * (fidelity contract untouched).
 */
export function LootConditionList({
  pool,
  onPool,
}: {
  pool: LootPoolModel
  onPool: (patch: Partial<LootPoolModel>) => void
}) {
  const [adding, setAdding] = useState(false)
  const [rawDraft, setRawDraft] = useState('')

  const setCond = (idx: number, value: Record<string, unknown>) => {
    onPool({ conditions: pool.conditions.map((c, i) => (i === idx ? value : c)) })
  }

  const addCond = (id: string) => {
    onPool({ conditions: [...pool.conditions, newConditionValue(id)] })
    setAdding(false)
    setRawDraft('')
  }

  const addRaw = () => {
    try {
      const parsed = JSON.parse(rawDraft)
      if (parsed === null || typeof parsed !== 'object') throw new Error('must be an object')
      onPool({ conditions: [...pool.conditions, parsed] })
      setAdding(false)
      setRawDraft('')
    } catch {
      setRawDraft('') // invalid JSON: keep the drawer open, drop the draft
    }
  }

  const removeCond = (idx: number) => {
    onPool({ conditions: pool.conditions.filter((_, i) => i !== idx) })
  }

  return (
    <div className="loot-conditions">
      <div className="loot-conditions-title">
        <span>Conditions ({pool.conditions.length})</span>
        <button className="loot-btn loot-btn-ghost loot-btn-small" onClick={() => setAdding((a) => !a)}>
          {adding ? 'Cancel' : '+ Add'}
        </button>
      </div>
      {adding && (
        <div className="loot-cond-add" data-testid="loot-cond-add">
          <div className="loot-cond-add-templates">
            {TYPED_CONDITIONS.map((c) => (
              <button key={c.id} className="loot-cond-add-item" onClick={() => addCond(c.id)}>
                {c.label}
              </button>
            ))}
          </div>
          <label className="loot-field">
            Raw JSON
            <textarea
              className="loot-cond-raw"
              rows={2}
              value={rawDraft}
              placeholder='{"condition": "minecraft:any_of", ...}'
              onChange={(e) => setRawDraft(e.target.value)}
            />
          </label>
          <button className="loot-btn loot-btn-small" onClick={addRaw}>Add raw condition</button>
        </div>
      )}
      {pool.conditions.map((c, i) => {
        const asObj = c && typeof c === 'object' ? (c as Record<string, unknown>) : null
        const typed = asObj ? typedConditionFor(asObj) : null
        return (
          <div className="loot-condition" key={i} data-testid="loot-condition">
            {typed ? (
              <TypedConditionRow
                cond={asObj!}
                typed={typed}
                onChange={(next) => setCond(i, next)}
              />
            ) : (
              <span className="loot-condition-opaque">
                <code>{asObj?.condition ? String(asObj.condition) : '(non-object)'}</code>
                <span className="loot-cond-opaque-note">opaque</span>
              </span>
            )}
            <button className="loot-btn loot-btn-ghost loot-btn-small" onClick={() => removeCond(i)} aria-label="Remove condition">
              ✕
            </button>
          </div>
        )
      })}
    </div>
  )
}

function TypedConditionRow({
  cond,
  typed,
  onChange,
}: {
  cond: Record<string, unknown>
  typed: { id: string; label: string; fields: ConditionField[] }
  onChange: (next: Record<string, unknown>) => void
}) {
  return (
    <span className="loot-cond-typed">
      <span className="loot-cond-label">{typed.label}</span>
      {typed.fields.map((f) => (
        <label className="loot-field loot-field-inline" key={f.key}>
          {f.label}
          {f.kind === 'number' ? (
            <input
              type="number"
              min={f.min}
              max={f.max}
              step={f.step}
              value={conditionFieldValue(cond, f) as number}
              onChange={(e) => onChange(editConditionField(cond, f, Number(e.target.value)))}
            />
          ) : (
            <input
              type="checkbox"
              checked={conditionFieldValue(cond, f) as boolean}
              onChange={(e) => onChange(editConditionField(cond, f, e.target.checked))}
            />
          )}
        </label>
      ))}
    </span>
  )
}
