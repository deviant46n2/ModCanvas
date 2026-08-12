// Behavior system frontend contract (P2-BEHAVIOR, roadmap §11). Mirrors the
// Rust IR (`src-tauri/src/behavior/mod.rs` — shapes and serde tags are the
// contract, verified by round-trip) and the commands (`commands/behavior.rs`).
// This is the ONLY place the IR's shape is known on the frontend — components
// consume these types, never raw invoke args.
//
// Vocabulary status (s46): 10 triggers, 6 conditions, 8 actions — the §11.1
// MVP lists. Every kind maps to a KubeJS API verified against the shipped
// jar; `run_command` is the labeled escape hatch for everything outside.

import { invoke } from '@tauri-apps/api/core'

export interface Behavior {
  id: string
  name: string
  /** Which compiler emits this behavior — kubejs (full vocabulary) or
   *  datapack (faithful vanilla subset). Defaults to kubejs. */
  backend: 'kubejs' | 'datapack'
  trigger: Trigger
  conditions: Condition[]
  actions: Action[]
}

export type Trigger =
  | { kind: 'player_joins_game' }
  | { kind: 'player_leaves_game' }
  | { kind: 'player_takes_damage' }
  | { kind: 'player_kills_entity'; entity?: string }
  | { kind: 'item_crafted'; item?: string }
  | { kind: 'item_picked_up'; item?: string }
  | { kind: 'block_placed'; block?: string }
  | { kind: 'block_broken'; block?: string }
  | { kind: 'advancement_completed'; advancement: string }
  | { kind: 'timed_every'; ticks: number }

export type Condition =
  | { kind: 'item_held'; item: string }
  | { kind: 'item_in_inventory'; item: string; min_count: number }
  | { kind: 'entity_type'; entity: string }
  | { kind: 'dimension'; dimension: string }
  | { kind: 'random_chance'; chance: number }
  | { kind: 'health_below'; health: number }

export type Action =
  | { kind: 'give_item'; item: string; count: number }
  | { kind: 'remove_item'; item: string }
  | { kind: 'run_command'; command: string }
  | { kind: 'message'; text: string }
  | { kind: 'heal'; amount: number }
  | { kind: 'teleport'; x: number; y: number; z: number; yaw: number; pitch: number }
  | { kind: 'spawn_entity'; entity: string }
  | { kind: 'set_stage'; stage: string }

export type CompileOutput =
  | { ok: { backend: 'kubejs' | 'datapack'; script: string; warnings: string[] } }
  | { err: { backend: 'kubejs' | 'datapack'; reason: string } }

/** Load every behavior for a project (missing file = empty list). */
export function listBehaviors(projectId: string): Promise<Behavior[]> {
  return invoke<Behavior[]>('list_behaviors', { projectId })
}

/** Result of a behavior save: the IR persisted, and the emission step either
 *  shipped every behavior or reports which ones did not compile (with
 *  reasons). Empty `emitFailures` = all behaviors reached the instance.
 *  `warnings` = behaviors that shipped WITH deterministic notes (e.g. the
 *  datapack coarseness warning) — those are NOT failures; the UI must not
 *  claim they "did not reach the instance". */
export interface SaveBehaviorsOutcome {
  emit_failures: string[]
  warnings: string[]
}

/** Replace the entire behavior list for a project (full-list semantics) and
 *  write the compiled script into the instance's KubeJS scripts dir. */
export function saveBehaviors(
  projectId: string,
  behaviors: Behavior[],
): Promise<SaveBehaviorsOutcome> {
  return invoke<SaveBehaviorsOutcome>('save_behaviors', { projectId, behaviors })
}

/** Compile one behavior for preview — never writes. */
export function compileBehavior(behavior: Behavior): Promise<CompileOutput> {
  return invoke<CompileOutput>('compile_behavior', { behavior })
}

/** Build a fresh starter-kit behavior (authoring seed). */
export function makeStarterBehavior(name: string): Behavior {
  return {
    id: `behavior:${Date.now().toString(36)}`,
    name,
    backend: 'kubejs',
    trigger: { kind: 'player_joins_game' },
    conditions: [],
    actions: [{ kind: 'give_item', item: 'minecraft:diamond', count: 1 }],
  }
}

/** The authorable vocabulary, driven by the IR. The editor renders these;
 *  growing the vocabulary is a Rust-side change (new variant + compile path),
 *  and this list is its frontend contract. */
export const TRIGGER_OPTIONS: { value: Trigger['kind']; label: string }[] = [
  { value: 'player_joins_game', label: 'player joins the game' },
  { value: 'player_leaves_game', label: 'player leaves the game' },
  { value: 'player_takes_damage', label: 'player takes damage' },
  { value: 'player_kills_entity', label: 'player kills an entity' },
  { value: 'item_crafted', label: 'item crafted' },
  { value: 'item_picked_up', label: 'item picked up' },
  { value: 'block_placed', label: 'block placed' },
  { value: 'block_broken', label: 'block broken' },
  { value: 'advancement_completed', label: 'advancement completed' },
  { value: 'timed_every', label: 'every N ticks' },
]

export const CONDITION_OPTIONS: { value: Condition['kind']; label: string }[] = [
  { value: 'item_held', label: 'holding item' },
  { value: 'item_in_inventory', label: 'item in inventory' },
  { value: 'entity_type', label: 'entity type is' },
  { value: 'dimension', label: 'in dimension' },
  { value: 'random_chance', label: 'random chance' },
  { value: 'health_below', label: 'health below' },
]

export const ACTION_OPTIONS: { value: Action['kind']; label: string }[] = [
  { value: 'give_item', label: 'give item' },
  { value: 'remove_item', label: 'remove item' },
  { value: 'run_command', label: 'run command (raw)' },
  { value: 'message', label: 'send message' },
  { value: 'heal', label: 'heal' },
  { value: 'teleport', label: 'teleport' },
  { value: 'spawn_entity', label: 'spawn entity' },
  { value: 'set_stage', label: 'add stage' },
]

/** Default payload for a freshly-picked kind — the editor renders a default
 *  form instead of an empty/`undefined` shape. */
export function blankTrigger(kind: Trigger['kind']): Trigger {
  switch (kind) {
    case 'player_kills_entity': return { kind, entity: 'minecraft:zombie' }
    case 'item_crafted': return { kind, item: 'minecraft:stick' }
    case 'item_picked_up': return { kind, item: 'minecraft:diamond' }
    case 'block_placed': return { kind, block: 'minecraft:oak_log' }
    case 'block_broken': return { kind, block: 'minecraft:stone' }
    case 'advancement_completed': return { kind, advancement: 'minecraft:story/root' }
    case 'timed_every': return { kind, ticks: 600 }
    default: return { kind } as Trigger
  }
}

export function blankCondition(kind: Condition['kind']): Condition {
  switch (kind) {
    case 'item_held': return { kind, item: 'minecraft:diamond' }
    case 'item_in_inventory': return { kind, item: 'minecraft:bread', min_count: 1 }
    case 'entity_type': return { kind, entity: 'minecraft:zombie' }
    case 'dimension': return { kind, dimension: 'minecraft:the_nether' }
    case 'random_chance': return { kind, chance: 0.5 }
    case 'health_below': return { kind, health: 10 }
  }
}

export function blankAction(kind: Action['kind']): Action {
  switch (kind) {
    case 'give_item': return { kind, item: 'minecraft:diamond', count: 1 }
    case 'remove_item': return { kind, item: 'minecraft:stone' }
    case 'run_command': return { kind, command: 'say hello' }
    case 'message': return { kind, text: 'Hello!' }
    case 'heal': return { kind, amount: 4 }
    case 'teleport': return { kind, x: 0, y: 64, z: 0, yaw: 0, pitch: 0 }
    case 'spawn_entity': return { kind, entity: 'minecraft:creeper' }
    case 'set_stage': return { kind, stage: 'starter_done' }
  }
}

/** Normalize a number input — empty/NaN falls back to `fallback`. */
export function num(value: string, fallback: number): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}
