// Quest-book persistence & FTB Quests import actions for the editor toolbar.
// Presentation-free hook: owns state and side effects, exposes callbacks.
import { useState, useCallback, useRef, useEffect } from 'react'
import {
  importFtbQuestsFromDir,
  exportFtbQuestsToDir,
  saveQuestGraph,
  getQuestGraph,
  wsIpcGetStatus,
  wsIpcRestart,
  listPrismInstances,
} from '../services/api'
import type { QuestGraphData, PrismInstance } from '../services/api'
import { defaultQuestNodeData } from '../components/quest/quest-helpers'
import { stripMcFormatting } from '../core/theme/font-formatter'
import { pickDir } from '../components/quest/pick-dir'
import { QUEST_HOTSWAP_ENABLED } from '../core/sync/config'
import { reloadQuestsInGame } from '../services/hotswap'
import { companionState, onCompanionStatus } from '../services/companion-socket'

export interface QuestToolbarActions {
  saveMessage: { text: string; ok: boolean } | null
  saveNow: () => Promise<void>
  saveAndHotReload: () => Promise<void>
  scheduleAutoSave: () => void
  wsStatus: { connected: boolean; clientCount: number }
  handleImportFtb: () => Promise<void>
  handleImportFromPrism: (instance: PrismInstance) => Promise<void>
  handleBrowseOther: () => Promise<void>
  loadPrismList: () => Promise<void>
  prismInstances: PrismInstance[] | null
  prismLoading: boolean
}

interface UseQuestToolbarActionsOpts {
  graph: QuestGraphData
  setGraph: (g: QuestGraphData) => void
  projectId: string
  projectPath?: string
  textureIndex: Record<string, string>
  modsDir: string
}

export function useQuestToolbarActions({
  graph, setGraph, projectId, projectPath,
  textureIndex, modsDir,
}: UseQuestToolbarActionsOpts): QuestToolbarActions {
  const [saveMessage, setSaveMessage] = useState<{ text: string; ok: boolean } | null>(null)
  const [prismInstances, setPrismInstances] = useState<PrismInstance[] | null>(null)
  const [prismLoading, setPrismLoading] = useState(false)
  const [wsStatus, setWsStatus] = useState<{ connected: boolean; clientCount: number }>({ connected: false, clientCount: 0 })
  const autoSaveRef = useRef<(() => Promise<void>) | null>(null)
  const saveGraphRef = useRef<(() => Promise<void>) | null>(null)
  const importedRef = useRef(false)

  const refreshWsStatus = useCallback(async () => {
    try {
      const status = await wsIpcGetStatus()
      setWsStatus({ connected: status.connected, clientCount: status.clientCount })
    } catch {}
  }, [])

  // Keep wsStatus live from the hub's status pushes, not a mount-time
  // snapshot. The app may mount before the game boots a companion (s43):
  // a stale `connected: false` then drives saveAndHotReload into a
  // destructive hub restart.
  useEffect(() => {
    const unsub = onCompanionStatus((status) => {
      setWsStatus({ connected: status.connected, clientCount: status.clientCount })
    })
    return unsub
  }, [])

  const handleReconnect = useCallback(async () => {
    try {
      await wsIpcRestart()
      await new Promise(r => setTimeout(r, 500))
      await refreshWsStatus()
    } catch (e) {
      console.error('Reconnect failed:', e)
    }
  }, [refreshWsStatus])

  const saveAndHotReload = useCallback(async () => {
    if (!graph) return
    setSaveMessage({ text: 'Saving...', ok: true })
    await saveGraphRef.current?.()
    // Quest hotswap is evidence-gated (s42): when disabled the save/export
    // above is all we push and the reload flow stays dormant.
    if (!QUEST_HOTSWAP_ENABLED) {
      const texCount = Object.keys(textureIndex).length
      setSaveMessage({ text: `Saved (${texCount} textures)`, ok: true })
      return
    }
    // Restart the hub only when the hub itself is unreachable (frontend's
    // own socket is down). Never restart on the companion flag: wsIpcRestart
    // stops the hub and clears ALL clients (ws_ipc.rs), which would drop a
    // healthy companion and guarantee "game not connected" on the next save
    // (s43 — the mount-snapshot bug). If the hub is up but no companion is
    // attached, broadcast anyway: reloadQuestsInGame honestly reports
    // no-companion.
    if (!companionState.serverUp) await handleReconnect()
    try {
      const outcome = await reloadQuestsInGame(projectId)
      const texCount = Object.keys(textureIndex).length
      const base = `Saved (${texCount} textures)`
      switch (outcome.status) {
        case 'passed':
          // Evidence: FTB's "Loading quests from" line landed after the send.
          setSaveMessage({ text: `${base} · reload verified in-game ✓`, ok: true })
          break
        case 'no-companion':
          setSaveMessage({ text: `${base} · game not connected — saved to disk only`, ok: true })
          break
        case 'rotated':
          setSaveMessage({ text: `${base} · reload unverified (game log rotated) — saved to disk`, ok: true })
          break
        case 'failed':
          // No evidence line landed after the pin. Since s43 the companion
          // dispatches through the server's own command source (op 4), so the
          // old "enable commands + edit mode" hint no longer applies — the
          // failure is: no reload happened in the running game.
          setSaveMessage({
            text: `${base} · reload FAILED — no reload evidence in the game log (is the game running the current companion jar?)`,
            ok: false,
          })
          break
      }
    } catch (e) {
      setSaveMessage({ text: `Hot-reload failed: ${e}`, ok: false })
      console.error('Hot-reload failed:', e)
    }
  }, [graph, handleReconnect, textureIndex, projectId])

  autoSaveRef.current = async () => {
    if (!graph) return
    const existingChapterNodeIds = new Set(graph.nodes.filter(n => n.node_type === 'chapter').map(n => n.id))
    const extraNodes = graph.chapters
      .filter(ch => !existingChapterNodeIds.has(ch.id))
      .map(ch => ({ ...defaultQuestNodeData(), id: ch.id, node_type: 'chapter', label: stripMcFormatting(ch.title), chapter_id: null }))
    const updatedGraph: QuestGraphData = {
      ...graph,
      chapters: graph.chapters.map(ch => ({ ...ch, icon: ch.icon, background_image: ch.background_image, order_index: ch.order_index })),
      chapter_groups: graph.chapter_groups,
      nodes: [...graph.nodes, ...extraNodes],
      edges: graph.edges,
      book_progression_mode: graph.book_progression_mode,
      book_icon: graph.book_icon,
      book_background_image: graph.book_background_image,
      quest_color: graph.quest_color,
      default_quest_size: graph.default_quest_size,
      default_quest_shape: graph.default_quest_shape,
    }
    const emptyIconNodes = updatedGraph.nodes.filter(n => !n.icon)
    if (emptyIconNodes.length > 0) {
      console.warn('[autoSave] Nodes with empty icon:', emptyIconNodes.map(n => ({ id: n.id, icon: n.icon, label: n.label })))
    }
    try {
      await saveQuestGraph(projectId, updatedGraph)
      if (extraNodes.length > 0) setGraph(updatedGraph)
    } catch (e) {
      console.error('Failed to save quest graph:', e)
    }
  }

  saveGraphRef.current = async () => {
    await autoSaveRef.current?.()
    if (!projectPath) return
    try {
      await exportFtbQuestsToDir(projectId, projectPath)
      setSaveMessage({ text: `Saved + exported (${Object.keys(textureIndex).length} textures)`, ok: true })
    } catch (e) {
      setSaveMessage({ text: `Export failed: ${e}`, ok: false })
      console.error('Failed to export quest graph:', e)
    }
    setTimeout(() => setSaveMessage(null), 5000)
  }

  const scheduleAutoSave = useCallback(() => {
    setTimeout(() => autoSaveRef.current?.(), 300)
  }, [])

  const saveNow = useCallback(async () => {
    await saveGraphRef.current?.()
  }, [])

  useEffect(() => { refreshWsStatus() }, [refreshWsStatus])

  // First-open import for wizard-created packs: the scaffolded quest files
  // need one import to materialize the graph. GATED on the CACHE being empty
  // (s42 fix): this effect used to fire whenever the in-memory graph was
  // momentarily null (it races the cache load on every open) and re-imported
  // the on-disk files, OVERWRITING a saved cache with the file state — that
  // is how a pack lost its dependency edges (an import of mid-edit files
  // replaced the cached graph, the editor reloaded it, and the next save
  // exported the edgeless state). A non-empty cache is authoritative.
  useEffect(() => {
    if (!projectPath || importedRef.current) return
    importedRef.current = true
    getQuestGraph(projectId).then((cached) => {
      if (cached && (cached.chapters.length > 0 || cached.nodes.length > 0)) {
        return // the cache has a saved graph — never clobber it
      }
      importFtbQuestsFromDir(projectPath).then((result) => {
        if (result.graph && result.chapter_count > 0) {
          setGraph(result.graph)
          saveQuestGraph(projectId, result.graph).catch((e) =>
            console.error('Failed to save imported quest graph:', e)
          )
        }
      }).catch((e) => {
        console.error('FTB Quests import failed:', e)
        importedRef.current = false
      })
    }).catch((e) => {
      console.error('Failed to read cached quest graph:', e)
      importedRef.current = false
    })
  }, [projectPath, projectId, setGraph])


  const handleImportFtb = useCallback(async () => {
    const dir = projectPath || modsDir?.replace(/\/mods$/, '') || ''
    if (!dir) { alert('No project or mods directory available'); return }
    try {
      const result = await importFtbQuestsFromDir(dir)
      if (result.graph && result.chapter_count > 0) {
        setGraph(result.graph)
        await saveQuestGraph(projectId, result.graph)
        alert(`Imported ${result.quest_count} quests across ${result.chapter_count} chapters`)
      } else if (result.issues?.length) {
        const msgs = result.issues.map((i: any) => `[${i.severity}] ${i.message}`).join('\n')
        alert(`No FTB Quests data found.\n${msgs}`)
      } else {
        alert('No FTB Quests data found in this directory')
      }
    } catch (e) { console.error('FTB Quests import failed:', e); alert(`Import failed: ${e}`) }
  }, [projectPath, modsDir, projectId, setGraph])

  const handleImportFromPrism = useCallback(async (instance: PrismInstance) => {
    try {
      const result = await importFtbQuestsFromDir(instance.path)
      if (result.graph && result.chapter_count > 0) {
        setGraph(result.graph)
        await saveQuestGraph(projectId, result.graph)
        alert(`Imported ${result.quest_count} quests across ${result.chapter_count} chapters from ${instance.name}`)
      } else if (result.issues?.length) {
        const msgs = result.issues.map((i: any) => `[${i.severity}] ${i.message}`).join('\n')
        alert(`No FTB Quests data in ${instance.name}.\n${msgs}`)
      } else {
        alert(`No FTB Quests data found in ${instance.name}`)
      }
    } catch (e) { console.error('FTB Quests import failed:', e); alert(`Import failed: ${e}`) }
  }, [projectId, setGraph])

  const loadPrismList = useCallback(async () => {
    if (prismInstances) return
    setPrismLoading(true)
    try {
      const instances = await listPrismInstances()
      setPrismInstances(instances)
    } catch (e) { console.error('Failed to list Prism instances:', e); alert('Failed to scan Prism instances') }
    finally { setPrismLoading(false) }
  }, [prismInstances])

  const handleBrowseOther = useCallback(async () => {
    try {
      const selected = await pickDir()
      if (!selected) return
      const result = await importFtbQuestsFromDir(selected)
      if (result.graph && result.chapter_count > 0) {
        setGraph(result.graph)
        await saveQuestGraph(projectId, result.graph)
        alert(`Imported ${result.quest_count} quests across ${result.chapter_count} chapters`)
      } else if (result.issues?.length) {
        const msgs = result.issues.map((i: any) => `[${i.severity}] ${i.message}`).join('\n')
        alert(`No FTB Quests data found.\n${msgs}`)
      } else {
        alert('No FTB Quests data found in selected directory')
      }
    } catch (e) { console.error('FTB Quests import failed:', e); alert(`Import failed: ${e}`) }
  }, [projectId, setGraph])

  return {
    saveMessage, saveNow, saveAndHotReload, scheduleAutoSave,
    wsStatus,
    handleImportFtb, handleImportFromPrism, handleBrowseOther,
    loadPrismList, prismInstances, prismLoading,
  }
}
