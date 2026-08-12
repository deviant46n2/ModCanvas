// Behavior system frontend contract (P2-BEHAVIOR, roadmap §11). Mirrors the
// Rust IR (`src-tauri/src/behavior/mod.rs`) and the three commands
// (`commands/behavior.rs`). This is the ONLY place the IR's shape is known
// on the frontend — components consume these types, never raw invoke args.

import { invoke } from '@tauri-apps/api/core'

export interface Behavior {
  id: string
  name: string
  trigger: Trigger
  conditions: Condition[]
  actions: Action[]
}

export type Trigger = { kind: 'player_joins_game' }

export type Condition = never

export type Action = { kind: 'give_item'; item: string; count: number }

export type CompileOutput =
  | { ok: { script: string; warnings: string[] } }
  | { err: { reason: string } }

/** Load every behavior for a project (missing file = empty list). */
export function listBehaviors(projectId: string): Promise<Behavior[]> {
  return invoke<Behavior[]>('list_behaviors', { projectId })
}

/** Result of a behavior save: the IR persisted, and the emission step either
 *  shipped every behavior or reports which ones did not compile (with
 *  reasons). Empty `emitFailures` = all behaviors reached the instance. */
export interface SaveBehaviorsOutcome {
  emit_failures: string[]
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

/** Build a fresh starter-kit behavior (the chunk-1 pair, as authoring seed). */
export function makeStarterBehavior(name: string): Behavior {
  return {
    id: `behavior:${Date.now().toString(36)}`,
    name,
    trigger: { kind: 'player_joins_game' },
    conditions: [],
    actions: [{ kind: 'give_item', item: 'minecraft:diamond', count: 1 }],
  }
}
