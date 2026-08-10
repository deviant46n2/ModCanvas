// Runtime-texture sync effects: request namespace texture dumps once per
// project, subscribe to live runtime textures, and persist them to the cache.
// Extracted from `useQuestAssetPipeline`.

import { useEffect, useRef, type Dispatch, type SetStateAction } from 'react'
import type { QuestGraphData } from '../../services/quest-types'
import {
  initRuntimeTextureListener,
  subscribeRuntimeTextures,
  getRuntimeTextureCache,
  saveRuntimeTextureCache,
  mergeRuntimeTextures,
  questRuntimeNamespaces,
  requestRuntimeTextures,
} from '../../services/runtime-textures'

export function useRuntimeTextureRequest(opts: {
  wsConnected?: boolean
  graph: QuestGraphData | null
  projectId: string
}) {
  const { wsConnected, graph, projectId } = opts
  const runtimeRequestedRef = useRef<string | null>(null)
  useEffect(() => {
    if (!wsConnected || !graph) return
    if (runtimeRequestedRef.current === projectId) return
    runtimeRequestedRef.current = projectId
    const namespaces = questRuntimeNamespaces(graph)
    requestRuntimeTextures(namespaces).catch((e) => console.error('[QuestBookEditor] requestRuntimeTextures failed:', e))
  }, [wsConnected, graph, projectId])
}

export function useRuntimeTextureSync(opts: {
  instancePath: string
  setTextureIndex: Dispatch<SetStateAction<Record<string, string>>>
}) {
  const { instancePath, setTextureIndex } = opts
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
  }, [instancePath, setTextureIndex])
}
