// Background texture prefetch effect: after the pack loads, queue materialization
// for every chapter/group so the Quests screen is instant when navigated to.
// Extracted from `useQuestAssetPipeline`.

import { useEffect, useRef } from 'react'
import type { QuestGraphData } from '../../services/quest-types'
import { prefetchAllChapterTextures } from '../../services/texture-loader'

export function usePrefetchTextures(opts: {
  packLoaded?: boolean
  graph: QuestGraphData | null
  projectId: string
  instancePath: string
}) {
  const { packLoaded, graph, projectId, instancePath } = opts
  const prefetchedFor = useRef<string | null>(null)
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
}
