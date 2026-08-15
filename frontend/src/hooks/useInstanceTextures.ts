import { useEffect, useState } from 'react'
import { scanInstanceTextures, scanInstanceAnimations, scanEngineUpgrade } from '../services/api'
import { registerBakedKeysFromIndex, registerUpgradeableKeys } from '../services/texture-loader'

export function useInstanceTextures(projectPath: string) {
  const [textureIndex, setTextureIndex] = useState<Record<string, string>>({})
  const [animations, setAnimations] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!projectPath) return
    let cancelled = false
    setLoading(true)
    scanInstanceTextures(projectPath)
      .then((idx) => {
        if (cancelled || !idx || Object.keys(idx).length === 0) return
        registerBakedKeysFromIndex(idx)
        setTextureIndex((prev) => ({ ...prev, ...idx }))
      })
      .catch((e) => console.error('Failed to load texture index:', e))
      .finally(() => { if (!cancelled) setLoading(false) })

    // Engine-upgradeable ids ride the same disk cache as the texture index,
    // so this second scan is cheap. Registered for the engine-render queue so
    // flat-but-3D items get real icons when the companion connects (s58).
    scanEngineUpgrade(projectPath)
      .then((keys) => {
        if (!cancelled && keys && keys.length > 0) registerUpgradeableKeys(keys)
      })
      .catch(() => { /* enhancement — flat fallback remains */ })

    // Animation metadata rides the same disk cache as the texture index, so a
    // second scan is cheap; it lets the crafting grid's icons animate.
    scanInstanceAnimations(projectPath)
      .then((anim) => {
        if (!cancelled && anim && Object.keys(anim).length > 0) setAnimations(anim)
      })
      .catch(() => { /* animations are an enhancement */ })

    return () => { cancelled = true }
  }, [projectPath])

  return { textureIndex, setTextureIndex, animations, loading }
}
