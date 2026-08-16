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
import { getQuestThemeBackground, getGameGuiScale, type ThemeBackgroundSpec } from '../../services/recipes'
import { resolveAssetUrl } from '../../services/asset-resolver'
import { resolveIconKey } from '../../components/quest/questIcons'

/** A theme background resolved to a displayable URL plus the game's render
 *  semantics: `color` tint (`#AARRGGBB` alpha), `tileSize` px tile (absent =
 *  stretch to the pane — the game's drawGui rect fill). */
export interface ResolvedThemeBackground {
  url: string
  color?: string | null
  tileSize?: number | null
}

/** Fetch the instance's `guiScale` (options.txt) once per instance. */
export function useGuiScale(
  instancePath: string,
  setGuiScale: (v: number) => void,
) {
  useEffect(() => {
    if (!instancePath) return
    let cancelled = false
    getGameGuiScale(instancePath)
      .then((scale) => { if (!cancelled) setGuiScale(scale) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [instancePath, setGuiScale])
}

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
  setQuestBackground: Dispatch<SetStateAction<ResolvedThemeBackground | null>>
}) {
  const { instancePath, activeChapter, textureIndex, textureTick, setQuestBackground } = opts
  useEffect(() => {
    if (!instancePath || !activeChapter) {
      setQuestBackground(null)
      return
    }
    let cancelled = false
    getQuestThemeBackground(instancePath, activeChapter)
      .then((spec: ThemeBackgroundSpec | null) => {
        if (cancelled || !spec) return
        const key = resolveIconKey(spec.key)
        const url = resolveAssetUrl(spec.key, textureIndex) || getMaterialized(key)
        if (url) {
          setQuestBackground(prev =>
            prev && prev.url === url && prev.color === (spec.color ?? null) && prev.tileSize === (spec.tileSize ?? null)
              ? prev
              : { url, color: spec.color ?? null, tileSize: spec.tileSize ?? null },
          )
        } else {
          requestMaterialize([key], instancePath)
        }
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [activeChapter, textureIndex, textureTick, instancePath, setQuestBackground])
}
