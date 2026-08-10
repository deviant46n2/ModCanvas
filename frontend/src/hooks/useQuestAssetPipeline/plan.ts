// Materialization-plan effect: computes what the current view needs
// (inject/tags/bakedInView/toFetch) and dispatches each to its sink. Extracted
// from `useQuestAssetPipeline`.

import { useEffect, useMemo, type Dispatch, type SetStateAction } from 'react'
import type { QuestGraphData, QuestNodeData } from '../../services/quest-types'
import {
  requestMaterialize,
  buildTexturePathIndex,
} from '../../services/texture-loader'
import { requestResolveTags } from '../../services/smart-filter-tags'
import { queueEngineRendersPriority } from '../../services/engine-render'
import { buildMaterializationPlan } from '../quest-materialization'
import { mergeIndexUpgradeOnly } from '../../services/texture-merge'

export function useMaterializationPlan(opts: {
  graph: QuestGraphData | null
  activeChapter: string | null
  selectedNode: QuestNodeData | null | undefined
  textureIndex: Record<string, string>
  textureTick: number
  ingestIndex: Record<string, string>
  instancePath: string
  wsConnected?: boolean
  setTextureIndex: Dispatch<SetStateAction<Record<string, string>>>
}) {
  const { graph, activeChapter, selectedNode, textureIndex, textureTick, ingestIndex, instancePath, wsConnected, setTextureIndex } = opts
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
  }, [graph, activeChapter, selectedNode, textureIndex, textureTick, ingestIndex, ingestPathIndex, scanPathIndex, instancePath, wsConnected, setTextureIndex])
}
