// Ingest + instance-scan sync effects: fold the ingest index and the instance
// texture/animation scans into `textureIndex`/`animations`. Extracted from
// `useQuestAssetPipeline`.

import { useEffect, type Dispatch, type SetStateAction } from 'react'
import type { IngestResult, ItemRegistryEntry } from '../../services/quest-types'
import { registerBakedKeysFromIndex } from '../../services/texture-loader'
import { registerModItems } from '../../services/smart-filter-mods'
import { scanInstanceItems, scanInstanceTextures, scanInstanceAnimations } from '../../services/recipes'
import { mergeIndexNoDowngrade } from '../../services/texture-merge'

export function useIngestSync(opts: {
  ingestResult: IngestResult | null | undefined
  kubejsNamespace: string
  setIngestIndex: (v: Record<string, string>) => void
  setTextureIndex: Dispatch<SetStateAction<Record<string, string>>>
  setItems: Dispatch<SetStateAction<ItemRegistryEntry[]>>
}) {
  const { ingestResult, kubejsNamespace, setIngestIndex, setTextureIndex, setItems } = opts
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
  }, [ingestResult, kubejsNamespace, setIngestIndex, setItems, setTextureIndex])
}

export function useScanSync(opts: {
  instancePath: string
  setTextureIndex: Dispatch<SetStateAction<Record<string, string>>>
  setAnimations: Dispatch<SetStateAction<Record<string, string>>>
}) {
  const { instancePath, setTextureIndex, setAnimations } = opts
  useEffect(() => {
    let cancelled = false
    if (!instancePath) return
    scanInstanceTextures(instancePath).then((idx) => {
      if (cancelled || !idx || Object.keys(idx).length === 0) return
      registerBakedKeysFromIndex(idx)
      setTextureIndex(prev => mergeIndexNoDowngrade(prev, idx))
    }).catch(() => {})
    scanInstanceAnimations(instancePath).then((map) => {
      if (cancelled || !map || Object.keys(map).length === 0) return
      setAnimations(prev => ({ ...prev, ...map }))
    }).catch(() => {})
    return () => { cancelled = true }
  }, [instancePath, setTextureIndex, setAnimations])
}
