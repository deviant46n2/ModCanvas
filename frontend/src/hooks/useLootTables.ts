import { useEffect, useState } from 'react'
import { scanPackLootTables } from '../services/loot'
import type { DiscoveredLootTable } from '../services/loot'

/** Scan the pack's loot tables on mount / project change. Mirrors
 *  usePackRecipes: fires once per project, honest scanning/error states. */
export function useLootTables(projectPath: string) {
  const [scanning, setScanning] = useState(true)
  const [error, setError] = useState('')
  const [tables, setTables] = useState<DiscoveredLootTable[]>([])

  useEffect(() => {
    let cancelled = false
    setScanning(true)
    setError('')
    scanPackLootTables(projectPath)
      .then((r) => { if (!cancelled) setTables(r) })
      .catch((e) => { if (!cancelled) setError(String(e)) })
      .finally(() => { if (!cancelled) setScanning(false) })
    return () => { cancelled = true }
  }, [projectPath])

  return { scanning, error, tables }
}
