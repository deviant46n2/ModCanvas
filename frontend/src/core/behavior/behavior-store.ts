// Behavior store (zustand, NOT persisted). The Rust command
// (`save_behaviors` → `.modcanvas/behaviors.json`) is the persistence; this
// store is the live working copy the Behaviors tab edits and Pack Health
// reads, so both render the same in-memory truth. Mirrors the recipe store's
// shape (minus the private undo stack — the roadmap §14.4 anti-pattern).

import { create } from 'zustand'
import type { Action, Behavior, Trigger } from '../../services/behavior'

export type { Behavior }

export interface BehaviorState {
  behaviors: Behavior[]
  loaded: boolean
  setBehaviors: (behaviors: Behavior[]) => void
  setLoaded: (loaded: boolean) => void
  /** Convenience: build a fresh starter-kit behavior (authoring seed). */
  makeStarter: (name: string) => Behavior
}

export const useBehaviorStore = create<BehaviorState>()((set) => ({
  behaviors: [],
  loaded: false,
  setBehaviors: (behaviors) => set({ behaviors }),
  setLoaded: (loaded) => set({ loaded }),
  makeStarter: (name) => {
    const trigger: Trigger = { kind: 'player_joins_game' }
    const action: Action = { kind: 'give_item', item: 'minecraft:diamond', count: 1 }
    const behavior: Behavior = {
      id: `behavior:${Date.now().toString(36)}`,
      name,
      trigger,
      conditions: [],
      actions: [action],
    }
    return behavior
  },
}))
