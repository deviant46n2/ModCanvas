import { createContext, useContext, useMemo } from 'react'
import type { ReactNode } from 'react'

// Per-instance animation metadata: texture key → raw `.mcmeta` JSON. Loaded
// alongside the texture index via `scanInstanceAnimations`. Keyed with the
// exact same key forms as the texture index so icon/deco components can look
// up animation metadata with the same key they resolved their texture URL.
export const AnimationContext = createContext<Record<string, string>>({})

export function AnimationProvider({
  animations,
  children,
}: {
  animations: Record<string, string>
  children: ReactNode
}) {
  const value = useMemo(() => animations, [animations])
  return <AnimationContext.Provider value={value}>{children}</AnimationContext.Provider>
}

export function useAnimationMap(): Record<string, string> {
  return useContext(AnimationContext)
}

/** Resolve animation metadata for a texture key, mirroring the key fallbacks
 *  the asset resolver applies for textures (`item/`/`block/` prefixed forms,
 *  `.png`-suffixed keys, etc.). */
export function animationMetaForKey(
  animations: Record<string, string>,
  key: string | null | undefined,
): string | undefined {
  if (!key || !animations) return undefined
  const direct = animations[key]
  if (direct) return direct
  const noPng = key.replace(/\.png$/i, '')
  if (noPng !== key) {
    const noPngHit = animations[noPng]
    if (noPngHit) return noPngHit
  }
  if (!key.includes('/')) {
    const item = animations[`item/${key}`]
    if (item) return item
    const block = animations[`block/${key}`]
    if (block) return block
  }
  return undefined
}
