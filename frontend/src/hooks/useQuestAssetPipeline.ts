import { useEffect, useMemo, useRef, useState } from 'react'
import { wsIpcGetStatus } from '../services/api'
import type { QuestGraphData, QuestNodeData } from '../services/quest-types'
import type { IngestResult, ItemRegistryEntry } from '../services/quest-types'
import {
  subscribeMaterialized,
  subscribeLoadingChange,
  subscribeNotFound,
  getMaterialized,
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

function withItemTextures(items: ItemRegistryEntry[], updates: Record<string, string>): ItemRegistryEntry[] {
  return items.map((i) => (i.texture_data_url ? i : { ...i, texture_data_url: updates[i.id] ?? null }))
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
      setTextureIndex(prev => ({ ...prev, ...ingestResult.asset_registry.by_id }))
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
        persistEngineRenders(instancePath, rendered).catch((e) => console.error('[QuestBookEditor] persistEngineRenders failed:', e))
      }
    })

    return () => {
      disposed = true
      if (pollTimer) clearInterval(pollTimer)
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
    const missingRegistry = items.filter((i) => !textureIndex[i.id]).map((i) => i.id)
    if (missingRegistry.length > 0) queueEngineRenders(missingRegistry)
    const unsub = subscribeNotFound((keys) => {
      const itemLike = keys.map(normalizeItemId).filter((k): k is string => !!k)
      if (itemLike.length > 0) queueEngineRenders(itemLike)
    })
    return unsub
  }, [wsConnected, instancePath, items, textureIndex])
  useEffect(() => {
    if (!wsConnected) return
    const baked = getBakedTextureKeys()
    if (baked.length > 0) queueEngineRenders(baked)
  }, [wsConnected, textureIndex])
  useEffect(() => {
    let cancelled = false
    if (instancePath) {
      scanInstanceTextures(instancePath).then((idx) => {
        if (cancelled || !idx || Object.keys(idx).length === 0) return
        registerBakedKeysFromIndex(idx)
        setTextureIndex(prev => ({ ...prev, ...idx }))
      }).catch(() => {})
      scanInstanceAnimations(instancePath).then((map) => {
        if (cancelled || !map || Object.keys(map).length === 0) return
        setAnimations(prev => ({ ...prev, ...map }))
      }).catch(() => {})
    } else if (modsDir) {
      scanModJarTextures(modsDir).then((idx) => {
        if (cancelled || !idx || Object.keys(idx).length === 0) return
        setTextureIndex(prev => ({ ...prev, ...idx }))
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
      setTextureIndex(prev => ({ ...prev, ...plan.inject }))
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
