// Quest asset pipeline hook: owns the texture index + items state and wires the
// per-concern sync effects (ingest/scan, engine renders, runtime textures,
// materialization plan). Effect bodies live in `./useQuestAssetPipeline/*`.

import { useState } from 'react'
import type { QuestGraphData, QuestNodeData } from '../services/quest-types'
import type { IngestResult, ItemRegistryEntry } from '../services/quest-types'
import { getBakedTextureCount } from '../services/texture-loader'
import { usePrefetchTextures } from './useQuestAssetPipeline/prefetch'
import { useIngestSync, useScanSync } from './useQuestAssetPipeline/ingest'
import {
  useBakedCountSync,
  useEngineRenderSync,
  useEngineQueue,
  useNotFoundEngineQueue,
  useBakedQueue,
} from './useQuestAssetPipeline/engine'
import {
  useRuntimeTextureRequest,
  useRuntimeTextureSync,
} from './useQuestAssetPipeline/runtime'
import {
  useMaterializationActivity,
  useThemeBackground,
} from './useQuestAssetPipeline/activity'
import { useMaterializationPlan } from './useQuestAssetPipeline/plan'

interface UseQuestAssetPipelineOptions {
  instancePath: string
  ingestResult: IngestResult | null | undefined
  kubejsNamespace: string
  wsConnected?: boolean
  graph: QuestGraphData | null
  activeChapter: string | null
  selectedNode: QuestNodeData | null | undefined
  packLoaded?: boolean
  projectId: string
}

export function useQuestAssetPipeline(options: UseQuestAssetPipelineOptions) {
  const { instancePath, ingestResult, kubejsNamespace, wsConnected, graph, activeChapter, selectedNode, packLoaded, projectId } = options
  const [textureIndex, setTextureIndex] = useState<Record<string, string>>({})
  const [animations, setAnimations] = useState<Record<string, string>>({})
  const [ingestIndex, setIngestIndex] = useState<Record<string, string>>({})
  const [textureTick, setTextureTick] = useState(0)
  const [texturesLoading, setTexturesLoading] = useState(false)
  const [texturesRemaining, setTexturesRemaining] = useState(0)
  const [bakedCount, setBakedCount] = useState(() => getBakedTextureCount())
  const [questBackgroundUrl, setQuestBackgroundUrl] = useState<string | null>(null)
  const [items, setItems] = useState<ItemRegistryEntry[]>([])

  usePrefetchTextures({ packLoaded, graph, projectId, instancePath })
  useIngestSync({ ingestResult, kubejsNamespace, setIngestIndex, setTextureIndex, setItems })
  useBakedCountSync({ setBakedCount })
  useEngineRenderSync({ instancePath, wsConnected, setTextureIndex, setItems })
  useRuntimeTextureRequest({ wsConnected, graph, projectId })
  useRuntimeTextureSync({ instancePath, setTextureIndex })
  useEngineQueue({ wsConnected, items, textureIndex })
  useNotFoundEngineQueue({ wsConnected })
  useBakedQueue({ wsConnected, instancePath })
  useScanSync({ instancePath, setTextureIndex, setAnimations })
  useMaterializationActivity({ setTextureTick, setTexturesLoading, setTexturesRemaining })
  useThemeBackground({ instancePath, activeChapter, textureIndex, textureTick, setQuestBackgroundUrl })
  useMaterializationPlan({ graph, activeChapter, selectedNode, textureIndex, textureTick, ingestIndex, instancePath, wsConnected, setTextureIndex })

  return {
    textureIndex,
    animations,
    texturesLoading,
    texturesRemaining,
    bakedCount,
    questBackgroundUrl,
    items,
  }
}
