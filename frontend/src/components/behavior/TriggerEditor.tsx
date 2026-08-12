import {
  blankTrigger,
  TRIGGER_OPTIONS,
  num,
  type Trigger,
} from '../../services/behavior'

interface TriggerEditorProps {
  trigger: Trigger
  onChange: (trigger: Trigger) => void
}

/** The "when" row: trigger kind select + kind-specific target fields. */
export function TriggerEditor({ trigger, onChange }: TriggerEditorProps) {
  return (
    <div className="behavior-rule">
      <span className="behavior-rule-label">when</span>
      <select
        value={trigger.kind}
        aria-label="Trigger"
        onChange={(e) => onChange(blankTrigger(e.target.value as Trigger['kind']))}
      >
        {TRIGGER_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>

      <TriggerFields trigger={trigger} onChange={onChange} />
    </div>
  )
}

/** Per-kind target fields. `None`-able filters render with an "(any)" option. */
function TriggerFields({ trigger, onChange }: TriggerEditorProps) {
  switch (trigger.kind) {
    case 'player_kills_entity':
      return (
        <input
          value={trigger.entity ?? ''}
          aria-label="Entity id"
          placeholder="minecraft:zombie (any)"
          onChange={(e) =>
            onChange({
              ...trigger,
              entity: e.target.value.trim() || undefined,
            })
          }
        />
      )
    case 'item_crafted':
    case 'item_picked_up':
      return (
        <input
          value={trigger.item ?? ''}
          aria-label="Item id"
          placeholder="minecraft:stick (any)"
          onChange={(e) =>
            onChange({ ...trigger, item: e.target.value.trim() || undefined })
          }
        />
      )
    case 'block_placed':
    case 'block_broken':
      return (
        <input
          value={trigger.block ?? ''}
          aria-label="Block id"
          placeholder="minecraft:stone (any)"
          onChange={(e) =>
            onChange({ ...trigger, block: e.target.value.trim() || undefined })
          }
        />
      )
    case 'advancement_completed':
      return (
        <input
          value={trigger.advancement}
          aria-label="Advancement id"
          placeholder="minecraft:story/root"
          onChange={(e) => onChange({ ...trigger, advancement: e.target.value })}
        />
      )
    case 'timed_every':
      return (
        <label className="behavior-inline">
          every{' '}
          <input
            type="number"
            min={1}
            value={trigger.ticks}
            aria-label="Ticks"
            onChange={(e) => onChange({ ...trigger, ticks: Math.max(1, num(e.target.value, 1)) })}
          />{' '}
          ticks (20 = 1s)
        </label>
      )
    default:
      return null
  }
}
