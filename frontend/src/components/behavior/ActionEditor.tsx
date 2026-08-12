import {
  blankAction,
  ACTION_OPTIONS,
  num,
  type Action,
} from '../../services/behavior'

interface ActionEditorProps {
  actions: Action[]
  onChange: (actions: Action[]) => void
}

/**
 * The "then" row: an ordered stack of action cards plus an add select.
 * Actions run in declaration order (the compiler preserves it; the golden
 * tests lock it). `run_command` is the labeled escape hatch — anything
 * outside the vocabulary, visibly marked "(raw)" in the select.
 */
export function ActionEditor({ actions, onChange }: ActionEditorProps) {
  const addAction = (kind: Action['kind']) => {
    onChange([...actions, blankAction(kind)])
  }
  const updateAction = (i: number, a: Action) => {
    onChange(actions.map((old, j) => (j === i ? a : old)))
  }
  const removeAction = (i: number) => {
    onChange(actions.filter((_, j) => j !== i))
  }

  return (
    <div className="behavior-stack">
      {actions.map((a, i) => (
        <div className="behavior-stack-row" key={i}>
          <select
            value={a.kind}
            aria-label="Action"
            onChange={(e) => updateAction(i, blankAction(e.target.value as Action['kind']))}
          >
            {ACTION_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <ActionFields action={a} onChange={(next) => updateAction(i, next)} />
          <button
            type="button"
            className="behavior-remove"
            aria-label="Remove action"
            onClick={() => removeAction(i)}
          >
            ✕
          </button>
        </div>
      ))}
      <select
        className="behavior-add"
        value=""
        aria-label="Add action"
        onChange={(e) => {
          if (e.target.value) addAction(e.target.value as Action['kind'])
        }}
      >
        <option value="">+ action…</option>
        {ACTION_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  )
}

function ActionFields({
  action,
  onChange,
}: {
  action: Action
  onChange: (a: Action) => void
}) {
  switch (action.kind) {
    case 'give_item':
      return (
        <>
          <input
            value={action.item}
            aria-label="Item id"
            placeholder="minecraft:diamond"
            onChange={(e) => onChange({ ...action, item: e.target.value })}
          />
          <input
            type="number"
            min={1}
            value={action.count}
            aria-label="Count"
            onChange={(e) =>
              onChange({ ...action, count: Math.max(1, num(e.target.value, 1)) })
            }
          />
        </>
      )
    case 'remove_item':
      return (
        <input
          value={action.item}
          aria-label="Item id"
          placeholder="minecraft:stone"
          onChange={(e) => onChange({ ...action, item: e.target.value })}
        />
      )
    case 'run_command':
      return (
        <input
          value={action.command}
          aria-label="Command"
          placeholder="say hello (no leading /)"
          onChange={(e) => onChange({ ...action, command: e.target.value })}
        />
      )
    case 'message':
      return (
        <input
          value={action.text}
          aria-label="Message text"
          placeholder="Hello!"
          onChange={(e) => onChange({ ...action, text: e.target.value })}
        />
      )
    case 'heal':
      return (
        <label className="behavior-inline">
          <input
            type="number"
            min={1}
            value={action.amount}
            aria-label="Heal half-hearts"
            onChange={(e) =>
              onChange({ ...action, amount: Math.max(1, num(e.target.value, 1)) })
            }
          />{' '}
          half-hearts
        </label>
      )
    case 'teleport':
      return (
        <>
          {(['x', 'y', 'z'] as const).map((axis) => (
            <label className="behavior-inline" key={axis}>
              {axis}
              <input
                type="number"
                value={action[axis]}
                aria-label={`Teleport ${axis}`}
                onChange={(e) =>
                  onChange({ ...action, [axis]: num(e.target.value, 0) })
                }
              />
            </label>
          ))}
        </>
      )
    case 'spawn_entity':
      return (
        <input
          value={action.entity}
          aria-label="Entity id"
          placeholder="minecraft:creeper"
          onChange={(e) => onChange({ ...action, entity: e.target.value })}
        />
      )
    case 'set_stage':
      return (
        <input
          value={action.stage}
          aria-label="Stage name"
          placeholder="starter_done"
          onChange={(e) => onChange({ ...action, stage: e.target.value })}
        />
      )
  }
}
