import { useEffect, useState } from 'react'
import { scanPackLootTables } from '../services/loot'
import type { DiscoveredLootTable } from '../services/loot'

/** Scan the pack's loot tables on mount / project change. Mirrors
 *  usePackRecipes: fires once per project, honest scanning/error states.
 *  `instancePath` (when known) adds the vanilla jar's tables — s72 B1: a
 *  zero-mod pack gets vanilla loot to work with. */
export function useLootTables(projectPath: string, instancePath?: string) {
  const [scanning, setScanning] = useState(true)
  const [error, setError] = useState('')
  const [tables, setTables] = useState<DiscoveredLootTable[]>([])
  const [scanVersion, setScanVersion] = useState(0)

  useEffect(() => {
    let cancelled = false
    setScanning(true)
    setError('')
    scanPackLootTables(projectPath, instancePath)
      .then((r) => { if (!cancelled) setTables(r) })
      .catch((e) => { if (!cancelled) setError(String(e)) })
      .finally(() => { if (!cancelled) setScanning(false) })
    return () => { cancelled = true }
  }, [projectPath, instancePath, scanVersion])

  const refresh = () => setScanVersion((v) => v + 1)

  return { scanning, error, tables, refresh }
}
