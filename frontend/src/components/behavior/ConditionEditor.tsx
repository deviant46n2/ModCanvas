import {
  blankCondition,
  CONDITION_OPTIONS,
  num,
  type Condition,
} from '../../services/behavior'

interface ConditionEditorProps {
  conditions: Condition[]
  onChange: (conditions: Condition[]) => void
}

/**
 * The "if" row: a stack of condition cards (all must pass) plus an add
 * select. Conditions render with a kind select + kind-specific fields.
 */
export function ConditionEditor({ conditions, onChange }: ConditionEditorProps) {
  const addCondition = (kind: Condition['kind']) => {
    onChange([...conditions, blankCondition(kind)])
  }
  const updateCondition = (i: number, c: Condition) => {
    onChange(conditions.map((old, j) => (j === i ? c : old)))
  }
  const removeCondition = (i: number) => {
    onChange(conditions.filter((_, j) => j !== i))
  }

  return (
    <div className="behavior-stack">
      {conditions.map((c, i) => (
        <div className="behavior-stack-row" key={i}>
          <select
            value={c.kind}
            aria-label="Condition"
            onChange={(e) => updateCondition(i, blankCondition(e.target.value as Condition['kind']))}
          >
            {CONDITION_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <ConditionFields
            condition={c}
            onChange={(next) => updateCondition(i, next)}
          />
          <button
            type="button"
            className="behavior-remove"
            aria-label="Remove condition"
            onClick={() => removeCondition(i)}
          >
            ✕
          </button>
        </div>
      ))}
      <select
        className="behavior-add"
        value=""
        aria-label="Add condition"
        onChange={(e) => {
          if (e.target.value) addCondition(e.target.value as Condition['kind'])
        }}
      >
        <option value="">+ condition…</option>
        {CONDITION_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  )
}

function ConditionFields({
  condition,
  onChange,
}: {
  condition: Condition
  onChange: (c: Condition) => void
}) {
  switch (condition.kind) {
    case 'item_held':
    case 'item_in_inventory':
      return (
        <>
          <input
            value={condition.item}
            aria-label="Item id"
            placeholder="minecraft:diamond"
            onChange={(e) => onChange({ ...condition, item: e.target.value })}
          />
          {condition.kind === 'item_in_inventory' && (
            <label className="behavior-inline">
              ≥{' '}
              <input
                type="number"
                min={1}
                value={condition.min_count}
                aria-label="Min count"
                onChange={(e) =>
                  onChange({
                    ...condition,
                    min_count: Math.max(1, num(e.target.value, 1)),
                  })
                }
              />
            </label>
          )}
        </>
      )
    case 'entity_type':
      return (
        <input
          value={condition.entity}
          aria-label="Entity id"
          placeholder="minecraft:zombie"
          onChange={(e) => onChange({ ...condition, entity: e.target.value })}
        />
      )
    case 'dimension':
      return (
        <input
          value={condition.dimension}
          aria-label="Dimension id"
          placeholder="minecraft:the_nether"
          onChange={(e) => onChange({ ...condition, dimension: e.target.value })}
        />
      )
    case 'random_chance':
      return (
        <label className="behavior-inline">
          {Math.round(condition.chance * 100)}%{' '}
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(condition.chance * 100)}
            aria-label="Chance percent"
            onChange={(e) =>
              onChange({ ...condition, chance: Number(e.target.value) / 100 })
            }
          />
        </label>
      )
    case 'health_below':
      return (
        <label className="behavior-inline">
          &lt;{' '}
          <input
            type="number"
            min={1}
            value={condition.health}
            aria-label="Health half-hearts"
            onChange={(e) =>
              onChange({
                ...condition,
                health: Math.max(1, num(e.target.value, 1)),
              })
            }
          />{' '}
          half-hearts
        </label>
      )
  }
}
