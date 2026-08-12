import { useCallback, useState } from 'react'
import {
  readLootTable,
  saveLootTable,
  type DiscoveredLootTable,
} from '../services/loot'
import {
  parseLootTable,
  serializeLootTable,
  type LootTableModel,
} from '../core/loot/model'

export type LootEditorStatus =
  | { state: 'idle' }
  | { state: 'loading' }
  | { state: 'ready' }
  | { state: 'saving' }
  | { state: 'saved'; at: number }
  | { state: 'error'; message: string }

/**
 * Loot-table editor state (P3-LOOT). Loads the canonical model for the
 * selected editable table, tracks edits, and saves VERBATIM through the
 * Rust save command (which re-validates structurally before writing).
 * Honest states only: loading / ready / saving / saved / error — never a
 * fake success. Jar tables (`editable === false`) are never loaded here;
 * the tab keeps them read-only.
 */
export function useLootEditor(projectPath: string) {
  const [status, setStatus] = useState<LootEditorStatus>({ state: 'idle' })
  const [table, setTable] = useState<LootTableModel | null>(null)
  const [source, setSource] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)

  const open = useCallback(
    (t: DiscoveredLootTable) => {
      if (!t.editable) return
      setStatus({ state: 'loading' })
      setDirty(false)
      setSource(t.source)
      readLootTable(projectPath, t.source)
        .then((json) => {
          const parsed = parseLootTable(json)
          if (!parsed) {
            setStatus({ state: 'error', message: 'Loaded table is not a modelable loot table.' })
            return
          }
          setTable(parsed)
          setStatus({ state: 'ready' })
        })
        .catch((e) => setStatus({ state: 'error', message: String(e) }))
    },
    [projectPath],
  )

  const close = useCallback(() => {
    setTable(null)
    setSource(null)
    setDirty(false)
    setStatus({ state: 'idle' })
  }, [])

  const save = useCallback(async () => {
    if (!table || !source) return
    setStatus({ state: 'saving' })
    try {
      const content = JSON.stringify(serializeLootTable(table), null, 2)
      await saveLootTable(projectPath, source, content)
      setDirty(false)
      setStatus({ state: 'saved', at: Date.now() })
    } catch (e) {
      setStatus({ state: 'error', message: String(e) })
    }
  }, [table, source, projectPath])

  const mutate = useCallback((updater: (t: LootTableModel) => LootTableModel) => {
    setTable((prev) => {
      if (!prev) return prev
      const next = updater(structuredClone(prev))
      setDirty(true)
      return next
    })
  }, [])

  return { status, table, dirty, open, close, save, mutate }
}
