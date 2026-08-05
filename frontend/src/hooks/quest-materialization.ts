import type { QuestGraphData, QuestNodeData } from '../services/quest-types'
import type { TexturePathIndex } from '../services/texture-loader'
import {
  collectNeededTargets,
  findTextureKeysForTarget,
  isUsableTextureValue,
  getMaterialized,
  isBakedTexture,
} from '../services/texture-loader'
import { normalizeItemId } from '../services/engine-render'
import { resolveIconKey } from '../components/quest/questIcons'

export interface MaterializationPlan {
  inject: Record<string, string>
  toFetch: Set<string>
  tags: string[]
  bakedInView: string[]
}

export function buildMaterializationPlan(options: {
  graph: QuestGraphData
  activeChapter: string | null
  selectedNode: QuestNodeData | null | undefined
  scanPathIndex: TexturePathIndex
  ingestPathIndex: TexturePathIndex
  textureIndex: Record<string, string>
  wsConnected?: boolean
}): MaterializationPlan {
  const targets = collectNeededTargets(options.graph, options.activeChapter, options.selectedNode)
  const inject: Record<string, string> = {}
  const toFetch = new Set<string>()
  for (const target of targets) {
    const canonical = resolveIconKey(target)
    if (!canonical) continue
    const keys = new Set(findTextureKeysForTarget(options.scanPathIndex, canonical))
    for (const k of findTextureKeysForTarget(options.ingestPathIndex, canonical)) keys.add(k)
    for (const key of keys) {
      if (isUsableTextureValue(options.textureIndex[key])) continue
      const url = getMaterialized(key)
      if (url) inject[key] = url
      else toFetch.add(key)
    }
  }
  const tags = targets.filter(t => t.startsWith('#')).map(t => t.slice(1))
  const bakedInView = options.wsConnected
    ? [...new Set([...targets].map(resolveIconKey))]
        .filter((k) => isBakedTexture(k))
        .map(normalizeItemId)
        .filter((id): id is string => !!id)
    : []
  return { inject, toFetch, tags, bakedInView }
}
