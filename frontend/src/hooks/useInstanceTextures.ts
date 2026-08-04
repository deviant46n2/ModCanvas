import { useEffect, useState } from 'react'
import { scanInstanceTextures } from '../services/api'
import { registerBakedKeysFromIndex } from '../services/texture-loader'

export function useInstanceTextures(projectPath: string) {
  const [textureIndex, setTextureIndex] = useState<Record<string, string>>({})
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
    return () => { cancelled = true }
  }, [projectPath])

  return { textureIndex, setTextureIndex, loading }
}
