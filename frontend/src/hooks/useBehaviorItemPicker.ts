import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ItemRegistryEntry, ItemTagInfo } from '../services/api'
import { usePackHealthStore } from '../core/pack-health/pack-health-store'
import { useInstanceTextures } from './useInstanceTextures'
import { scanItemRegistry } from '../components/recipe/recipe-editor-utils'
import { buildRegistryUrlMap, makeTextureUrlGetter } from '../components/recipe/recipe-editor-utils'
import { getAdapter } from '../adapters/factory'

/**
 * The Behaviors tab's item-picker data: the shared item registry (Pack
 * Health's — scanned once, shared across editors), the local tag catalog,
 * and a texture-url getter over the instance's texture index. Same services
 * as the recipe editor; nothing duplicated.
 *
 * The registry lives in the pack-health store so the Behaviors tab and Pack
 * Health read the SAME scanned truth; when the store is empty (tab opened
 * before the recipe editor ever scanned), this hook runs the scan once.
 */
export function useBehaviorItemPicker(projectPath: string) {
  const itemRegistry = usePackHealthStore((s) => s.itemRegistry)
  const setItemRegistry = usePackHealthStore((s) => s.setItemRegistry)
  const [tags, setTags] = useState<ItemTagInfo[]>([])
  const { textureIndex } = useInstanceTextures(projectPath)

  useEffect(() => {
    let disposed = false
    const kubejsNamespace = getAdapter('1.21.1', 'neoforge').getKubejsDefaultNamespace()
    scanItemRegistry(projectPath, kubejsNamespace)
      .then(({ registry, tags }) => {
        if (disposed) return
        setTags(tags)
        if (usePackHealthStore.getState().itemRegistry === null) {
          setItemRegistry(registry)
        }
      })
      .catch((e) => console.error('[Behaviors] Failed to load item registry:', e))
    return () => {
      disposed = true
    }
  }, [projectPath, setItemRegistry])

  const registryUrlById = useMemo(() => buildRegistryUrlMap(itemRegistry ?? []), [itemRegistry])
  const getTextureUrl = useMemo(
    () => makeTextureUrlGetter(textureIndex, projectPath),
    [textureIndex, projectPath],
  )
  const getRegistryTextureUrl = useCallback(
    (itemId: string): string | null => registryUrlById.get(itemId) ?? getTextureUrl(itemId),
    [registryUrlById, getTextureUrl],
  )

  return {
    items: itemRegistry ?? ([] as ItemRegistryEntry[]),
    tags,
    getTextureUrl: getRegistryTextureUrl,
  }
}
