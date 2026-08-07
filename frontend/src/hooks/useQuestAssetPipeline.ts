import { useEffect, useMemo, useRef, useState } from 'react'
import { wsIpcGetStatus } from '../services/api'
import type { QuestGraphData, QuestNodeData } from '../services/quest-types'
import type { IngestResult, ItemRegistryEntry } from '../services/quest-types'
import {
  subscribeMaterialized,
  subscribeLoadingChange,
  subscribeNotFound,
  getMaterialized,
  isUsableTextureValue,
  requestMaterialize,
  buildTexturePathIndex,
  prefetchAllChapterTextures,
  registerBakedKeysFromIndex,
  subscribeBakedKeys,
  getBakedTextureCount,
  getBakedTextureKeys,
  unmarkBakedKeys,
} from '../services/texture-loader'
import { requestResolveTags } from '../services/smart-filter-tags'
import {
  initEngineRenderListener,
  setEngineRenderConnected,
  subscribeEngineRenders,
  queueEngineRenders,
  queueEngineRendersPriority,
  getEngineRenderCache,
  persistEngineRenders,
  normalizeItemId,
} from '../services/engine-render'
import {
  initRuntimeTextureListener,
  subscribeRuntimeTextures,
  getRuntimeTextureCache,
  saveRuntimeTextureCache,
  mergeRuntimeTextures,
  questRuntimeNamespaces,
  requestRuntimeTextures,
} from '../services/runtime-textures'
import { scanInstanceItems, scanInstanceTextures, scanInstanceAnimations, scanModJarTextures, getQuestThemeBackground } from '../services/recipes'
import { registerModItems } from '../services/smart-filter-mods'
import { resolveAssetUrl } from '../services/asset-resolver'
import { resolveIconKey } from '../components/quest/questIcons'
import { buildMaterializationPlan } from './quest-materialization'

interface UseQuestAssetPipelineOptions {
  instancePath: string
  ingestResult: IngestResult | null | undefined
  modsDir: string
  kubejsNamespace: string
  wsConnected?: boolean
  graph: QuestGraphData | null
  activeChapter: string | null
  selectedNode: QuestNodeData | null | undefined
  packLoaded?: boolean
  projectId: string
}

function mergeIndex(prev: Record<string, string>, updates: Record<string, string>): Record<string, string> {
  let changed = false
  const merged = { ...prev }
  for (const [k, v] of Object.entries(updates)) {
    if (prev[k] !== v) {
      merged[k] = v
      changed = true
    }
  }
  return changed ? merged : prev
}

/// Merge only entries that are NEW or unknown — never overwrite an existing
/// displayable data URL with a compact descriptor. The scan/ingest indexes
/// carry `jar:`/`kubejs:`/`bake:` descriptors; blindly spreading them over
/// already-rendered data URLs would flip rendered icons back to placeholders
/// (the texture blink), and re-queue them through the baked-keys effects.
function mergeIndexNoDowngrade(
  prev: Record<string, string>,
  updates: Record<string, string>,
): Record<string, string> {
  let changed = false
  const merged = { ...prev }
  for (const [k, v] of Object.entries(updates)) {
    const existing = prev[k]
    if (existing !== undefined) continue
    if (existing === v) continue
    merged[k] = v
    changed = true
  }
  return changed ? merged : prev
}

/// Upgrade-only merge for materialized data URLs: write when the key is
/// missing or still a compact descriptor, but never clobber an existing
/// displayable value (an engine render may have landed between plan build and
/// apply — overwriting it with a different base64 string would blink the icon).
function mergeIndexUpgradeOnly(
  prev: Record<string, string>,
  updates: Record<string, string>,
): Record<string, string> {
  let changed = false
  const merged = { ...prev }
  for (const [k, v] of Object.entries(updates)) {
    const existing = prev[k]
    if (isUsableTextureValue(existing)) continue
    if (existing === v) continue
    merged[k] = v
    changed = true
  }
  return changed ? merged : prev
}

function withItemTextures(items: ItemRegistryEntry[], updates: Record<string, string>): ItemRegistryEntry[] {
  let changed = false
  const next = items.map((i) => {
    if (i.texture_data_url) return i
    const url = updates[i.id] ?? null
    if (url === i.texture_data_url) return i
    changed = true
    return { ...i, texture_data_url: url }
  })
  // Reference-stable: return `prev` when nothing changed so consumers that
  // depend on `items` identity (the missing-registry effect, the canvas) do
  // not re-run on every engine batch result.
  return changed ? next : items
}

export function useQuestAssetPipeline({
  instancePath,
  ingestResult,
  modsDir,
  kubejsNamespace,
  wsConnected,
  graph,
  activeChapter,
  selectedNode,
  packLoaded,
  projectId,
}: UseQuestAssetPipelineOptions) {
  const [textureIndex, setTextureIndex] = useState<Record<string, string>>({})
  const [animations, setAnimations] = useState<Record<string, string>>({})
  const [ingestIndex, setIngestIndex] = useState<Record<string, string>>({})
  const [textureTick, setTextureTick] = useState(0)
  const [texturesLoading, setTexturesLoading] = useState(false)
  const [texturesRemaining, setTexturesRemaining] = useState(0)
  const [bakedCount, setBakedCount] = useState(() => getBakedTextureCount())
  const [questBackgroundUrl, setQuestBackgroundUrl] = useState<string | null>(null)
  const [items, setItems] = useState<ItemRegistryEntry[]>([])
  const prefetchedFor = useRef<string | null>(null)
  const runtimeRequestedRef = useRef<string | null>(null)
  // Debounced engine-render persist buffer (see the subscribeEngineRenders
  // handler): results accumulate here and hit the disk on the flush interval.
  const pendingRendersRef = useRef<Record<string, string>>({})
  useEffect(() => {
    if (!packLoaded || !graph || !graph.chapters.length) return
    if (!instancePath) return
    const key = `${projectId}|${instancePath}`
    if (prefetchedFor.current === key) return
    prefetchedFor.current = key
    const count = prefetchAllChapterTextures(graph, instancePath)
    // eslint-disable-next-line no-console
    console.log(`[ModCanvas] Pre-warming ${count} quest textures in the background…`)
  }, [packLoaded, graph, projectId, instancePath])
  useEffect(() => {
    if (ingestResult?.asset_registry?.by_id) {
      registerBakedKeysFromIndex(ingestResult.asset_registry.by_id)
      setIngestIndex(ingestResult.asset_registry.by_id)
      // No-downgrade: ingest carries compact descriptors; never clobber an
      // already-rendered data URL back to a placeholder.
      setTextureIndex(prev => mergeIndexNoDowngrade(prev, ingestResult.asset_registry.by_id))
    }
    if (ingestResult?.active_instance) {
      scanInstanceItems(ingestResult.active_instance, kubejsNamespace).then((registry) => {
        setItems(registry);
        registerModItems(registry);
      }).catch((e) => console.error('[QuestBookEditor] Failed to scan instance items:', e));
    }
  }, [ingestResult, kubejsNamespace])
  useEffect(() => subscribeBakedKeys(() => setBakedCount(getBakedTextureCount())), [])
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
  }, [instancePath, wsConnected])
  useEffect(() => {
    if (!wsConnected || !graph) return
    if (runtimeRequestedRef.current === projectId) return
    runtimeRequestedRef.current = projectId
    const namespaces = questRuntimeNamespaces(graph)
    requestRuntimeTextures(namespaces).catch((e) => console.error('[QuestBookEditor] requestRuntimeTextures failed:', e))
  }, [wsConnected, graph, projectId])
  useEffect(() => {
    let disposed = false
    initRuntimeTextureListener()
    if (instancePath) {
      getRuntimeTextureCache(instancePath)
        .then((cached) => {
          if (disposed || !cached || Object.keys(cached).length === 0) return
          setTextureIndex((prev) => mergeRuntimeTextures(prev, cached))
        })
        .catch((e) => console.error('[QuestBookEditor] getRuntimeTextureCache failed:', e))
    }
    const unsub = subscribeRuntimeTextures((textures) => {
      setTextureIndex((prev) => mergeRuntimeTextures(prev, textures))
      if (instancePath) {
        saveRuntimeTextureCache(instancePath, textures).catch((e) =>
          console.error('[QuestBookEditor] saveRuntimeTextureCache failed:', e),
        )
      }
    })
    return () => {
      disposed = true
      unsub()
    }
  }, [instancePath])
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
    // Runs whenever items/textureIndex change, but queueEngineRenders is
    // idempotent (queueSet/inflight/failed dedupe), so re-runs are cheap.
    const missingRegistry = items.filter((i) => !textureIndex[i.id]).map((i) => i.id)
    if (missingRegistry.length > 0) queueEngineRenders(missingRegistry)
  }, [wsConnected, items, textureIndex])
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
  useEffect(() => {
    let cancelled = false
    if (instancePath) {
      scanInstanceTextures(instancePath).then((idx) => {
        if (cancelled || !idx || Object.keys(idx).length === 0) return
        registerBakedKeysFromIndex(idx)
        setTextureIndex(prev => mergeIndexNoDowngrade(prev, idx))
      }).catch(() => {})
      scanInstanceAnimations(instancePath).then((map) => {
        if (cancelled || !map || Object.keys(map).length === 0) return
        setAnimations(prev => ({ ...prev, ...map }))
      }).catch(() => {})
    } else if (modsDir) {
      scanModJarTextures(modsDir).then((idx) => {
        if (cancelled || !idx || Object.keys(idx).length === 0) return
        setTextureIndex(prev => mergeIndexNoDowngrade(prev, idx))
      }).catch(() => {})
    }
    return () => { cancelled = true }
  }, [instancePath, modsDir])
  useEffect(() => {
    let timer: number | undefined
    let pending = false
    const schedule = () => {
      if (pending) return
      pending = true
      timer = window.setTimeout(() => {
        pending = false
        setTextureTick(t => t + 1)
      }, 120)
    }
    const unsubMat = subscribeMaterialized(schedule)
    const unsubLoading = subscribeLoadingChange((isLoading, remaining) => {
      setTexturesLoading(isLoading)
      setTexturesRemaining(remaining)
    })
    return () => {
      unsubMat()
      unsubLoading()
      if (timer !== undefined) window.clearTimeout(timer)
    }
  }, [])
  useEffect(() => {
    if (!instancePath || !activeChapter) {
      setQuestBackgroundUrl(null)
      return
    }
    let cancelled = false
    getQuestThemeBackground(instancePath, activeChapter)
      .then((bgKey) => {
        if (cancelled || !bgKey) return
        const key = resolveIconKey(bgKey)
        const url = resolveAssetUrl(bgKey, textureIndex) || getMaterialized(key)
        if (url) {
          setQuestBackgroundUrl(prev => (prev === url ? prev : url))
        } else {
          requestMaterialize([key], instancePath)
        }
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [activeChapter, textureIndex, textureTick, instancePath])

  const ingestPathIndex = useMemo(() => buildTexturePathIndex(Object.keys(ingestIndex)), [ingestIndex])
  const scanPathIndex = useMemo(() => buildTexturePathIndex(Object.keys(textureIndex)), [textureIndex])
  useEffect(() => {
    if (!graph) return
    if (!instancePath) return
    const plan = buildMaterializationPlan({ graph, activeChapter, selectedNode, scanPathIndex, ingestPathIndex, textureIndex, wsConnected })
    if (Object.keys(plan.inject).length > 0) {
      // Upgrade-only: injects are materialized data URLs for keys whose index
      // value is still a descriptor; never clobber an engine-rendered value.
      setTextureIndex(prev => mergeIndexUpgradeOnly(prev, plan.inject))
    }
    if (plan.toFetch.size > 0) {
      requestMaterialize([...plan.toFetch], instancePath)
    }
    if (plan.tags.length > 0) {
      requestResolveTags(plan.tags, instancePath)
    }
    if (plan.bakedInView.length > 0) {
      queueEngineRendersPriority(plan.bakedInView)
    }
  }, [graph, activeChapter, selectedNode, textureIndex, textureTick, ingestIndex, ingestPathIndex, scanPathIndex, instancePath, wsConnected])
  return {
    textureIndex,
    setTextureIndex,
    animations,
    texturesLoading,
    texturesRemaining,
    bakedCount,
    questBackgroundUrl,
    items,
  }
}
