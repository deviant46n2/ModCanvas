// Engine-render sync effects: connection status polling, render subscription +
// debounced disk persist, and the three engine-queueing effects (registry
// items with no texture entry, materialization not-found keys, bake: keys).
// Extracted from `useQuestAssetPipeline`.

import { useEffect, useRef, type Dispatch, type SetStateAction } from 'react'
import { wsIpcGetStatus } from '../../services/api'
import type { ItemRegistryEntry } from '../../services/quest-types'
import {
  subscribeBakedKeys,
  subscribeNotFound,
  getBakedTextureCount,
  getBakedTextureKeys,
  unmarkBakedKeys,
} from '../../services/texture-loader'
import {
  initEngineRenderListener,
  setEngineRenderConnected,
  subscribeEngineRenders,
  queueEngineRenders,
  getEngineRenderCache,
  persistEngineRenders,
  normalizeItemId,
} from '../../services/engine-render'
import { mergeIndex, withItemTextures } from '../../services/texture-merge'

export function useBakedCountSync(opts: { setBakedCount: Dispatch<SetStateAction<number>> }) {
  const { setBakedCount } = opts
  useEffect(() => subscribeBakedKeys(() => setBakedCount(getBakedTextureCount())), [setBakedCount])
}

export function useEngineRenderSync(opts: {
  instancePath: string
  wsConnected?: boolean
  setTextureIndex: Dispatch<SetStateAction<Record<string, string>>>
  setItems: Dispatch<SetStateAction<ItemRegistryEntry[]>>
}) {
  const { instancePath, wsConnected, setTextureIndex, setItems } = opts
  // Debounced engine-render persist buffer (see the subscribeEngineRenders
  // handler): results accumulate here and hit the disk on the flush interval.
  const pendingRendersRef = useRef<Record<string, string>>({})
  useEffect(() => {
    let disposed = false
    initEngineRenderListener()
    setEngineRenderConnected(!!wsConnected)

    let pollTimer: ReturnType<typeof setInterval> | undefined
    const syncStatus = () => {
      wsIpcGetStatus().then((st) => {
        if (!disposed) setEngineRenderConnected(st.connected)
      }).catch(() => {})
    }
    pollTimer = setInterval(syncStatus, 5000)
    syncStatus()

    if (instancePath) {
      getEngineRenderCache(instancePath)
        .then((cached) => {
          if (disposed || !cached || Object.keys(cached).length === 0) return
          unmarkBakedKeys(Object.keys(cached))
          setTextureIndex((prev) => mergeIndex(prev, cached))
          setItems((prev) => withItemTextures(prev, cached))
        })
        .catch(() => {})
    }

    const unsubRenders = subscribeEngineRenders((rendered) => {
      unmarkBakedKeys(Object.keys(rendered))
      setTextureIndex((prev) => mergeIndex(prev, rendered))
      setItems((prev) => withItemTextures(prev, rendered))
      if (instancePath) {
        // Debounced disk persist: save_engine_renders_cmd rewrites the WHOLE
        // cache file per call, so persisting per 256-icon batch would make the
        // write grow with the drain (O(cache) per batch) and eventually gate
        // the rate. Live injection above is immediate; only the disk copy lags
        // by up to the flush interval. Flushed on the interval and on cleanup.
        if (!pendingRendersRef.current) pendingRendersRef.current = {}
        Object.assign(pendingRendersRef.current, rendered)
      }
    })
    const flushInterval = window.setInterval(() => {
      const pending = pendingRendersRef.current
      if (!pending || Object.keys(pending).length === 0) return
      pendingRendersRef.current = {}
      persistEngineRenders(instancePath, pending).catch((e) => {
        console.error('[QuestBookEditor] persistEngineRenders failed:', e)
        // Re-buffer so the next interval retries rather than losing the icons.
        Object.assign(pendingRendersRef.current, pending)
      })
    }, 4000)

    return () => {
      disposed = true
      if (pollTimer) clearInterval(pollTimer)
      window.clearInterval(flushInterval)
      const pending = pendingRendersRef.current
      if (pending && Object.keys(pending).length > 0) {
        pendingRendersRef.current = {}
        persistEngineRenders(instancePath, pending).catch(() => {})
      }
      unsubRenders()
    }
  }, [instancePath, wsConnected, setTextureIndex, setItems])
}

export function useEngineQueue(opts: {
  wsConnected?: boolean
  items: ItemRegistryEntry[]
  textureIndex: Record<string, string>
}) {
  const { wsConnected, items, textureIndex } = opts
  useEffect(() => {
    if (!wsConnected) return
    // Wait for the texture index to land before treating registry items as
    // textureless — at boot the index is empty, and a naive run here would
    // dump the entire registry into the engine queue.
    if (Object.keys(textureIndex).length === 0) return
    // Registry items with NO texture entry at all — the true "?" slots. Any
    // index entry means the item is known: jar:/kubejs: descriptors
    // materialize offline, bake: descriptors are queued by the baked-keys
    // effect below, data URLs are already rendered. Only fully-unknown items
    // need the engine. (Re-scoped from the items array's texture_data_url,
    // which the flat materializer never populates — that made every item
    // look textureless and dumped the whole registry into the engine queue.)
    //
    // s26 fix: an item with a registry `texture_data_url` (a compact `jar:`
    // descriptor — the scan's enumeration-only proof that the item has an
    // offline texture source) must NEVER be engine-queued, even when its
    // `textureIndex` entry hasn't landed yet. The index fills asynchronously
    // (ingest/scan race the items cache read), and during that window items
    // look "missing" here — queuing them sent flat textures to the engine,
    // whose in-game renders came back ~50% darker than the jar bytes and
    // clobbered the good URLs via mergeIndex. The registry descriptor proves
    // the item is resolvable offline; the engine is only for items with no
    // descriptor AND no index entry (or bake: keys, handled by the baked-keys
    // effect). Runs whenever items/textureIndex change, but queueEngineRenders
    // is idempotent (queueSet/inflight/failed dedupe), so re-runs are cheap.
    const missingRegistry = items
      .filter((i) => !i.texture_data_url && !textureIndex[i.id])
      .map((i) => i.id)
    if (missingRegistry.length > 0) queueEngineRenders(missingRegistry)
  }, [wsConnected, items, textureIndex])
}

export function useNotFoundEngineQueue(opts: { wsConnected?: boolean }) {
  const { wsConnected } = opts
  useEffect(() => {
    if (!wsConnected) return
    // Materialization not-found keys (offline materializer gave up) are the
    // engine's job. Subscribed ONCE — this is a subscription, not a queue
    // computation, so it must not re-establish itself on every index change.
    const unsub = subscribeNotFound((keys) => {
      const itemLike = keys.map(normalizeItemId).filter((k): k is string => !!k)
      if (itemLike.length > 0) queueEngineRenders(itemLike)
    })
    return unsub
  }, [wsConnected])
}

export function useBakedQueue(opts: { wsConnected?: boolean; instancePath: string }) {
  const { wsConnected, instancePath } = opts
  // Track which baked keys we've already offered to the engine, keyed per
  // instance. Retries are the engine-render failed-set's job (MAX_ATTEMPTS),
  // so each baked key is queued exactly once per registration — never
  // re-queued by textureIndex churn during the drain.
  const queuedBakedRef = useRef<{ instance: string | null; keys: Set<string> }>({
    instance: null,
    keys: new Set(),
  })
  useEffect(() => {
    if (!wsConnected) return
    if (queuedBakedRef.current.instance !== instancePath) {
      queuedBakedRef.current = { instance: instancePath, keys: new Set() }
    }
    const offerBaked = () => {
      const pending = getBakedTextureKeys().filter((k) => !queuedBakedRef.current.keys.has(k))
      if (pending.length === 0) return
      for (const k of pending) queuedBakedRef.current.keys.add(k)
      queueEngineRenders(pending)
    }
    offerBaked()
    // Fires on both mark (scan/ingest register bake: keys) and unmark (engine
    // render replaces them); the queuedBakedRef guard keeps this idempotent.
    return subscribeBakedKeys(offerBaked)
  }, [wsConnected, instancePath])
}
