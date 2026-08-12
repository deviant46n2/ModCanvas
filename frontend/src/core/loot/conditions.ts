// Typed condition views (P3-LOOT follow-up). Pure: turns a loot-table
// condition Value into a typed form (or marks it opaque), and edits typed
// forms back into Values. Conditions in the model stay `Vec<Value>` — this
// module is a VIEW over them, so the fidelity contract is untouched: unknown
// condition internals (custom fields, unknown sub-conditions) survive
// because only the typed keys are read/written.
//
// Scope: the common simple conditions get typed forms. Everything else stays
// opaque (shown read-only, removable) — typed editors for every condition
// Minecraft has is a bottomless surface, deliberately not built.

/** A condition we can render a typed form for. */
export interface TypedCondition {
  /** The canonical condition id, e.g. `minecraft:survives_explosion`. */
  id: string
  /** Human label for the form. */
  label: string
  /** Per-condition typed fields. */
  fields: ConditionField[]
}

export type ConditionField =
  | { kind: 'number'; key: string; label: string; min: number; max: number; step: number }
  | { kind: 'boolean'; key: string; label: string }

/** The typed editor set. Adding a condition type = one entry here + a test. */
export const TYPED_CONDITIONS: TypedCondition[] = [
  {
    id: 'minecraft:survives_explosion',
    label: 'Survives explosion',
    fields: [],
  },
  {
    id: 'minecraft:killed_by_player',
    label: 'Killed by player',
    fields: [],
  },
  {
    id: 'minecraft:random_chance',
    label: 'Random chance',
    fields: [{ kind: 'number', key: 'chance', label: 'Chance (0–1)', min: 0, max: 1, step: 0.01 }],
  },
  {
    id: 'minecraft:random_chance_with_looting',
    label: 'Random chance with looting',
    fields: [
      { kind: 'number', key: 'chance', label: 'Base chance (0–1)', min: 0, max: 1, step: 0.01 },
      { kind: 'number', key: 'looting_multiplier', label: 'Looting multiplier', min: 0, max: 1, step: 0.01 },
    ],
  },
  {
    id: 'minecraft:weather_check',
    label: 'Weather check',
    fields: [
      { kind: 'boolean', key: 'raining', label: 'Raining' },
      { kind: 'boolean', key: 'thundering', label: 'Thundering' },
    ],
  },
]

/** Resolve the typed form for a condition value, or null when opaque. */
export function typedConditionFor(value: unknown): TypedCondition | null {
  if (value === null || typeof value !== 'object') return null
  const id = (value as Record<string, unknown>).condition
  if (typeof id !== 'string') return null
  return TYPED_CONDITIONS.find((c) => c.id === id) ?? null
}

/** Read a typed field's current value out of a condition Value. Numbers read
 *  as the raw value (game tolerates int/float); booleans as bool. Absent
 *  keys read as their neutral default so the form always has a value. */
export function conditionFieldValue(cond: Record<string, unknown>, field: ConditionField): number | boolean {
  const v = cond[field.key]
  if (field.kind === 'number') return typeof v === 'number' ? v : field.min
  return typeof v === 'boolean' ? v : false
}

/** Apply a typed field edit back into a condition Value. Only the typed key
 *  is written; everything else in the object survives untouched. */
export function editConditionField(
  cond: Record<string, unknown>,
  field: ConditionField,
  value: number | boolean,
): Record<string, unknown> {
  return { ...cond, [field.key]: value }
}

/** Build a fresh condition Value for a typed condition's id (used by the
 *  Add Condition dropdown). */
export function newConditionValue(id: string): Record<string, unknown> {
  return { condition: id }
}
