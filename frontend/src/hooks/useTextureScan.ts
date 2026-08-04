import { useCallback } from 'react'
import { scanModJarTextures } from '../services/api'

export function useTextureScan() {
  const scan = useCallback(async (modsDir: string): Promise<Record<string, string>> => {
    return scanModJarTextures(modsDir)
  }, [])

  return { scanModJarTextures: scan }
}
