// Materialization-activity effects: a debounced texture tick that bumps on new
// materialized URLs, loading-state plumbing, and the theme-background resolver.
// Extracted from `useQuestAssetPipeline`.

import { useEffect, type Dispatch, type SetStateAction } from 'react'
import {
  subscribeMaterialized,
  subscribeLoadingChange,
  getMaterialized,
  requestMaterialize,
} from '../../services/texture-loader'
import { getQuestThemeBackground } from '../../services/recipes'
import { resolveAssetUrl } from '../../services/asset-resolver'
import { resolveIconKey } from '../../components/quest/questIcons'

export function useMaterializationActivity(opts: {
  setTextureTick: Dispatch<SetStateAction<number>>
  setTexturesLoading: Dispatch<SetStateAction<boolean>>
  setTexturesRemaining: Dispatch<SetStateAction<number>>
}) {
  const { setTextureTick, setTexturesLoading, setTexturesRemaining } = opts
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
  }, [setTextureTick, setTexturesLoading, setTexturesRemaining])
}

export function useThemeBackground(opts: {
  instancePath: string
  activeChapter: string | null
  textureIndex: Record<string, string>
  textureTick: number
  setQuestBackgroundUrl: Dispatch<SetStateAction<string | null>>
}) {
  const { instancePath, activeChapter, textureIndex, textureTick, setQuestBackgroundUrl } = opts
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
  }, [activeChapter, textureIndex, textureTick, instancePath, setQuestBackgroundUrl])
}
