// Loot-table editor model (P3-LOOT, roadmap §13) — the frontend mirror of
// `src-tauri/src/loot/model.rs`. The Rust model is the contract; these types
// must stay in lockstep with it (doc-sync: model changes land in both).
//
// The thinking room: pure types + pure derivation, no IPC, no UI. Every
// `extra` map is the preserve-unknown mechanism — fields the editor does not
// model ride through untouched and are re-emitted on save.

/** Top-level loot table. Mirrors `LootTable` in loot/model.rs. */
export interface LootTableModel {
  type?: string
  pools: LootPoolModel[]
  random_sequence?: string
  extra: Record<string, unknown>
}

/** One weighted pool. Mirrors `LootPool`. */
export interface LootPoolModel {
  rolls: LootRollsModel
  bonus_rolls?: number
  entries: LootEntryModel[]
  conditions: unknown[]
  extra: Record<string, unknown>
}

/** A single loot entry. Mirrors `LootEntry`. */
export interface LootEntryModel {
  type: string
  name?: string
  weight?: number
  quality?: number
  children?: LootEntryModel[]
  functions: unknown[]
  extra: Record<string, unknown>
}

/** `rolls` — a plain number, a uniform range, or an opaque exotic provider. */
export type LootRollsModel =
  | { kind: 'count'; value: number }
  | { kind: 'uniform'; min: number; max: number; extra: Record<string, unknown> }
  | { kind: 'other'; raw: unknown }

/** Parse a loot-table JSON object into the model. Returns null when the
 *  shape is not modelable (missing/non-array `pools`). */
export function parseLootTable(json: Record<string, unknown>): LootTableModel | null {
  if (!Array.isArray(json.pools)) return null
  return {
    type: typeof json.type === 'string' ? json.type : undefined,
    pools: (json.pools as unknown[]).map((p) => parsePool(p as Record<string, unknown>)),
    random_sequence:
      typeof json.random_sequence === 'string' ? json.random_sequence : undefined,
    extra: pickExtra(json, ['type', 'pools', 'random_sequence']),
  }
}

function parsePool(p: Record<string, unknown>): LootPoolModel {
  return {
    rolls: parseRolls(p.rolls),
    bonus_rolls: typeof p.bonus_rolls === 'number' ? p.bonus_rolls : undefined,
    entries: (p.entries as unknown[] | undefined ?? []).map((e) =>
      parseEntry(e as Record<string, unknown>),
    ),
    conditions: Array.isArray(p.conditions) ? p.conditions : [],
    extra: pickExtra(p, ['rolls', 'bonus_rolls', 'entries', 'conditions']),
  }
}

function parseEntry(e: Record<string, unknown>): LootEntryModel {
  return {
    type: typeof e.type === 'string' ? e.type : 'minecraft:empty',
    name: typeof e.name === 'string' ? e.name : undefined,
    weight: typeof e.weight === 'number' ? e.weight : undefined,
    quality: typeof e.quality === 'number' ? e.quality : undefined,
    children: Array.isArray(e.children)
      ? (e.children as unknown[]).map((c) => parseEntry(c as Record<string, unknown>))
      : undefined,
    functions: Array.isArray(e.functions) ? e.functions : [],
    extra: pickExtra(e, ['type', 'name', 'weight', 'quality', 'children', 'functions']),
  }
}

function parseRolls(r: unknown): LootRollsModel {
  if (typeof r === 'number') return { kind: 'count', value: r }
  if (r && typeof r === 'object') {
    const o = r as Record<string, unknown>
    if (typeof o.min === 'number' && typeof o.max === 'number') {
      return { kind: 'uniform', min: o.min, max: o.max, extra: pickExtra(o, ['min', 'max']) }
    }
  }
  return { kind: 'other', raw: r }
}

/** All keys not modeled at this level — the preserve-unknown carrier. */
function pickExtra(o: Record<string, unknown>, modeled: string[]): Record<string, unknown> {
  const extra: Record<string, unknown> = {}
  for (const k of Object.keys(o)) {
    if (!modeled.includes(k)) extra[k] = o[k]
  }
  return extra
}

/** Serialize the model back to a loot-table JSON object. Modeled fields are
 *  merged over the preserved `extra` maps — unknown fields survive, edited
 *  fields win. Round-trips parse → serialize → parse stably. */
export function serializeLootTable(t: LootTableModel): Record<string, unknown> {
  return {
    ...t.extra,
    ...(t.type !== undefined ? { type: t.type } : {}),
    pools: t.pools.map(serializePool),
    ...(t.random_sequence !== undefined ? { random_sequence: t.random_sequence } : {}),
  }
}

function serializePool(p: LootPoolModel): Record<string, unknown> {
  return {
    ...p.extra,
    rolls: serializeRolls(p.rolls),
    ...(p.bonus_rolls !== undefined ? { bonus_rolls: p.bonus_rolls } : {}),
    entries: p.entries.map(serializeEntry),
    ...(p.conditions.length > 0 ? { conditions: p.conditions } : {}),
  }
}

function serializeEntry(e: LootEntryModel): Record<string, unknown> {
  return {
    ...e.extra,
    type: e.type,
    ...(e.name !== undefined ? { name: e.name } : {}),
    ...(e.weight !== undefined ? { weight: e.weight } : {}),
    ...(e.quality !== undefined ? { quality: e.quality } : {}),
    ...(e.children !== undefined && e.children.length > 0 ? { children: e.children.map(serializeEntry) } : {}),
    ...(e.functions.length > 0 ? { functions: e.functions } : {}),
  }
}

function serializeRolls(r: LootRollsModel): unknown {
  switch (r.kind) {
    case 'count':
      return r.value
    case 'uniform':
      return { ...r.extra, min: r.min, max: r.max }
    case 'other':
      return r.raw
  }
}
