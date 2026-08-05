// Pack Health input state. The quest editor pushes its already-materialized
// graph + item registry here on load and on every commit; the PackHealthProvider
// combines this with the recipe store and recomputes the report. Keeping the
// input in a tiny store (same pattern as the recipe store) means the health tab
// reads current state without triggering any editor re-render or re-scan.

import { create } from 'zustand'
import type { ItemRegistryEntry, QuestGraphData } from '../../services/quest-types'

interface PackHealthState {
  questGraph: QuestGraphData | null
  itemRegistry: ItemRegistryEntry[] | null
  hasCoverImage: boolean
  setQuestState: (graph: QuestGraphData | null, items: ItemRegistryEntry[] | null) => void
  setItemRegistry: (items: ItemRegistryEntry[] | null) => void
  setHasCoverImage: (has: boolean) => void
}

export const usePackHealthStore = create<PackHealthState>((set) => ({
  questGraph: null,
  itemRegistry: null,
  hasCoverImage: false,
  setQuestState: (questGraph, itemRegistry) => set({ questGraph, itemRegistry }),
  setItemRegistry: (itemRegistry) => set({ itemRegistry }),
  setHasCoverImage: (hasCoverImage) => set({ hasCoverImage }),
}))
