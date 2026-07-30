import { useState, useCallback, useEffect, useRef } from 'react'
import {
  scanModJarTextures,
  importFtbQuestsFromDir,
  exportFtbQuestsToDir,
  saveQuestGraph,
  wsIpcSendEvent,
  wsIpcGetStatus,
  wsIpcRestart,
} from '../../services/api'
import type { QuestGraphData } from '../../services/api'
import { defaultQuestNodeData } from './quest-helpers'
import { IconPicker } from './icon-picker'
import { BookSettings } from './book-settings'

export interface ToolbarAPI {
  scheduleAutoSave: () => void
  openIconPicker: (target: { type: 'quest' | 'objective' | 'reward' | 'chapter' | 'book'; index?: number; nodeId?: string }) => void
}

type IconPickerTarget = Parameters<ToolbarAPI['openIconPicker']>[0]

interface ImportExportToolbarProps {
  graph: QuestGraphData
  setGraph: (g: QuestGraphData) => void
  projectId: string
  projectPath?: string
  textureIndex: Record<string, string>
  setTextureIndex: (idx: Record<string, string>) => void
  modsDir: string
  setModsDir: (dir: string) => void
  onReady: (api: ToolbarAPI) => void
}

export function ImportExportToolbar({
  graph, setGraph, projectId, projectPath,
  textureIndex, setTextureIndex, modsDir, setModsDir, onReady,
}: ImportExportToolbarProps) {
  const [saveMessage, setSaveMessage] = useState<{ text: string; ok: boolean } | null>(null)
  const [iconPickerState, setIconPickerState] = useState<{ open: boolean; target: IconPickerTarget | null }>({ open: false, target: null })
  const [showBookSettings, setShowBookSettings] = useState(false)
  const [wsStatus, setWsStatus] = useState<{ connected: boolean; client_count: number }>({ connected: false, client_count: 0 })
  const autoSaveRef = useRef<(() => Promise<void>) | null>(null)
  const saveGraphRef = useRef<(() => Promise<void>) | null>(null)
  const textureScanRef = useRef(0)
  const textureLoadedRef = useRef(false)
  const importedRef = useRef(false)

  const refreshWsStatus = useCallback(async () => {
    try {
      const status = await wsIpcGetStatus()
      setWsStatus({ connected: status.connected, client_count: status.client_count })
    } catch {}
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
    if (!wsStatus.connected) await handleReconnect()
    try {
      await wsIpcSendEvent('RELOAD_QUESTS')
      const texCount = Object.keys(textureIndex).length
      setSaveMessage(m => m?.ok ? { text: `Saved ✓ (${texCount} textures)`, ok: true } : m!)
    } catch (e) {
      setSaveMessage({ text: `Hot-reload failed: ${e}`, ok: false })
      console.error('Hot-reload failed:', e)
    }
  }, [graph, wsStatus.connected, handleReconnect, textureIndex])

  autoSaveRef.current = async () => {
    if (!graph) return
    const existingChapterNodeIds = new Set(graph.nodes.filter(n => n.node_type === 'chapter').map(n => n.id))
    const extraNodes = graph.chapters
      .filter(ch => !existingChapterNodeIds.has(ch.id))
      .map(ch => ({ ...defaultQuestNodeData(), id: ch.id, node_type: 'chapter', label: ch.title, chapter_id: null }))
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
      setSaveMessage({ text: `Saved + exported ✓ (${Object.keys(textureIndex).length} textures)`, ok: true })
    } catch (e) {
      setSaveMessage({ text: `Export failed: ${e}`, ok: false })
      console.error('Failed to export quest graph:', e)
    }
    setTimeout(() => setSaveMessage(null), 5000)
  }

  const scheduleAutoSave = useCallback(() => {
    setTimeout(() => autoSaveRef.current?.(), 300)
  }, [])

  const openIconPicker = useCallback((target: IconPickerTarget) => {
    setIconPickerState({ open: true, target })
  }, [])

  useEffect(() => {
    onReady({ scheduleAutoSave, openIconPicker })
  }, [onReady, scheduleAutoSave, openIconPicker])

  useEffect(() => { refreshWsStatus() }, [refreshWsStatus])

  useEffect(() => {
    if (!projectPath || !graph || graph.chapters.length > 0 || graph.nodes.length > 0) return
    if (importedRef.current) return
    importedRef.current = true
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
  }, [graph, projectPath, projectId, setGraph])

  const dir = modsDir || (projectPath ? `${projectPath}/mods` : '')
  useEffect(() => {
    if (dir) {
      if (!modsDir) setModsDir(dir)
      const scanId = ++textureScanRef.current
      scanModJarTextures(dir).then((idx) => {
        if (scanId !== textureScanRef.current) return
        if (Object.keys(idx).length === 0 && textureLoadedRef.current) return
        textureLoadedRef.current = Object.keys(idx).length > 0
        setTextureIndex(idx)
        console.log(`[ModCanvas] Loaded ${Object.keys(idx).length} textures from ${dir}`)
      }).catch((e) => console.error('Failed to scan textures:', e))
    }
  }, [dir, modsDir, setModsDir, setTextureIndex])

  const pickDir = useCallback(() => {
    return new Promise<string | null>((resolve) => {
      const input = document.createElement('input')
      input.type = 'file'
      input.setAttribute('webkitdirectory', '')
      input.style.display = 'none'
      let resolved = false
      const done = (result: string | null) => {
        if (resolved) return
        resolved = true
        document.body.removeChild(input)
        resolve(result)
      }
      input.addEventListener('change', () => {
        const file = input.files?.[0]
        if (file && 'path' in file) {
          done((file as any).path.replace(/\/[^/]+$/, ''))
        } else if (file && 'webkitRelativePath' in file) {
          const parts = (file as any).webkitRelativePath.split('/')
          done(parts.slice(0, -1).join('/'))
        } else {
          done(null)
        }
      })
      document.body.appendChild(input)
      input.click()
      setTimeout(() => done(null), 30000)
    })
  }, [])

  const browseModsDir = useCallback(async () => {
    try {
      const selected = await pickDir()
      if (!selected) return
      setModsDir(selected)
      const idx = await scanModJarTextures(selected)
      setTextureIndex(idx)
      alert(`Loaded ${Object.keys(idx).length} textures from ${selected}`)
    } catch (e) {
      console.error('Mods Dir error:', e)
      alert(`Failed to scan mods directory: ${e}`)
    }
  }, [pickDir, setModsDir, setTextureIndex])

  const handleImportFtb = useCallback(async () => {
    if (!projectPath) { alert('No project path available'); return }
    try {
      const result = await importFtbQuestsFromDir(projectPath)
      if (result.graph && result.chapter_count > 0) {
        setGraph(result.graph)
        await saveQuestGraph(projectId, result.graph)
        alert(`Imported ${result.quest_count} quests across ${result.chapter_count} chapters`)
      } else alert('No FTB Quests data found in this pack')
    } catch (e) { console.error('FTB Quests import failed:', e); alert(`Import failed: ${e}`) }
  }, [projectPath, projectId, setGraph])

  return (
    <>
      <header className="quest-editor-toolbar">
        <div className="quest-editor-toolbar-left">
          <span className="quest-editor-title">{graph.name || 'Quest Book'}</span>
          <button className="book-btn" onClick={browseModsDir} title="Scan mod textures">🎨 Textures</button>
          <button className="book-btn" onClick={handleImportFtb} title="Import FTB Quests from pack">📥 FTB Quests</button>
          <button className="book-btn" onClick={() => setShowBookSettings(true)}>⚙️ Settings</button>
        </div>
        <div className="quest-editor-toolbar-right" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ fontSize: 11, opacity: 0.6, marginRight: 4, whiteSpace: 'nowrap' }} title="Loaded textures">
            🖼{Object.keys(textureIndex).length}
          </span>
          <button className="book-btn primary" onClick={saveAndHotReload}>💾 Save</button>
          <button className={`book-btn ${wsStatus.connected ? 'primary' : ''}`} onClick={saveAndHotReload}>
            {wsStatus.connected ? '♻ Save & Hot-Reload' : `♻ Save (Offline${wsStatus.client_count > 0 ? ` ${wsStatus.client_count}cl` : ''})`}
          </button>
          <button className="book-btn" onClick={handleReconnect} title="Restart WebSocket & refresh status">🔌</button>
          <button className="book-btn" onClick={refreshWsStatus} title="Check connection status">🔄</button>
          {saveMessage && (
            <span style={{
              fontSize: 11, marginLeft: 8,
              color: saveMessage.ok ? 'var(--ftb-accent)' : '#ff6b6b',
              opacity: 0.9, whiteSpace: 'nowrap',
            }}>
              {saveMessage.text}
            </span>
          )}
        </div>
      </header>

      <IconPicker
        open={iconPickerState.open}
        target={iconPickerState.target}
        textureIndex={textureIndex}
        graph={graph}
        onGraphChange={setGraph}
        onClose={() => setIconPickerState({ open: false, target: null })}
        scheduleAutoSave={scheduleAutoSave}
      />

      <BookSettings
        open={showBookSettings}
        graph={graph}
        onGraphChange={setGraph}
        modsDir={modsDir}
        onModsDirChange={setModsDir}
        textureIndex={textureIndex}
        onTextureIndexChange={setTextureIndex}
        onClose={() => setShowBookSettings(false)}
        onSave={() => saveGraphRef.current?.()}
        pickDir={pickDir}
      />
    </>
  )
}
