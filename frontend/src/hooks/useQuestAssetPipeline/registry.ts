// Companion item-registry sync (s59): when the bridge connects, ask the
// companion for its authoritative item list (BuiltInRegistries.ITEM — the game
// registry, which has exactly the real items) and persist it to the per-instance
// cache. Replaces the lang-key-scanned registry, which lies: effect-variant
// floods (`potion.effect.*`), banner pattern keys (`banner.base.black`), and FTB
// GUI keys were ~1087 of 2411 entries on the monster pack (s58 diagnosis).
//
// The dump carries only id + name; `texture_data_url` is backfilled from the
// texture index so the s26 engine-queue protection survives: an item with an
// offline jar descriptor must never be engine-queued, even in the async window
// before the index lands (engine.ts missing-registry effect).

import { useEffect, type Dispatch, type SetStateAction } from 'react'
import type { ItemRegistryEntry } from '../../services/quest-types'
import { onCompanionEvent, requestItemRegistry } from '../../services/companion-socket'
import { saveItemRegistry } from '../../services/recipes'
import { usePackHealthStore } from '../../core/pack-health/pack-health-store'
import { registerModItems } from '../../services/smart-filter-mods'
import { sortRegistryByName } from '../../services/item-registry'
import {
  companionRegistryWithTextures,
  parseCompanionRegistry,
} from '../../services/item-registry-companion'

export function useCompanionRegistrySync(opts: {
  wsConnected?: boolean
  instancePath: string
  textureIndex: Record<string, string>
  setItems: Dispatch<SetStateAction<ItemRegistryEntry[]>>
}) {
  const { wsConnected, instancePath, textureIndex, setItems } = opts

  // Ask for the authoritative dump when the bridge connects. Re-fires on
  // reconnect — a fresh dump is correct there (the registry may have changed
  // with new mods after a game restart).
  useEffect(() => {
    if (wsConnected) requestItemRegistry()
  }, [wsConnected])

  // Handle the dump: parse, backfill offline sources, update the store + the
  // pipeline items, persist to disk so offline sessions keep the real list.
  useEffect(() => {
    return onCompanionEvent((frame) => {
      if (frame.event !== 'ITEM_REGISTRY_RESULT') return
      const p = (frame.payload ?? {}) as { items?: Array<{ id: string; name: string }> }
      const entries = parseCompanionRegistry(p.items ?? [])
      const filled = companionRegistryWithTextures(entries, textureIndex)
      // s60: sort once where items enter the pipeline, so EVERY consumer (item
      // browser, recipes palette) gets name order — the companion dump arrives
      // in game registration order, which reads as random. Matches the icon
      // picker's own render sort.
      const sorted = sortRegistryByName(filled)
      usePackHealthStore.getState().setItemRegistry(sorted)
      setItems(sorted)
      registerModItems(sorted)
      saveItemRegistry(instancePath, sorted).catch((e) =>
        console.error('[CompanionRegistry] persist failed:', e))
    })
  }, [instancePath, textureIndex, setItems])

  // Re-backfill texture sources as the texture index fills (async race: the
  // dump may land before the index scan resolves, leaving every entry with
  // texture_data_url null — the s58 live-verified symptom). Reference-stable —
  // returns `prev` when nothing changed, so this never churns re-renders.
  // Updates BOTH the store registry (what the pickers read) and the pipeline
  // items (what the engine queue reads), and re-persists when anything gained
  // a texture source so offline sessions keep the backfilled cache.
  useEffect(() => {
    const storeItems = usePackHealthStore.getState().itemRegistry
    if (storeItems && storeItems.length > 0) {
      const filled = companionRegistryWithTextures(storeItems, textureIndex)
      if (filled !== storeItems) {
        usePackHealthStore.getState().setItemRegistry(filled)
        registerModItems(filled)
        if (instancePath) {
          saveItemRegistry(instancePath, filled).catch((e) =>
            console.error('[CompanionRegistry] re-persist failed:', e))
        }
      }
    }
    setItems((prev) => companionRegistryWithTextures(prev, textureIndex))
  }, [textureIndex, setItems, instancePath])
}
