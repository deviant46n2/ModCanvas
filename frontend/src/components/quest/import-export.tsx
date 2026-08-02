import { useState, useCallback, useEffect, useRef } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import {
  scanModJarTextures,
  reindexTextures,
  importFtbQuestsFromDir,
  exportFtbQuestsToDir,
  saveQuestGraph,
  wsIpcSendEvent,
  wsIpcGetStatus,
  wsIpcRestart,
  listPrismInstances,
} from '../../services/api'
import type { QuestGraphData, PrismInstance } from '../../services/api'
import { defaultQuestNodeData } from './quest-helpers'
import { stripMcFormatting } from '../../core/theme/font-formatter'
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
  setTextureIndex: Dispatch<SetStateAction<Record<string, string>>>
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
  const [showPrismPicker, setShowPrismPicker] = useState(false)
  const [prismInstances, setPrismInstances] = useState<PrismInstance[] | null>(null)
  const [prismLoading, setPrismLoading] = useState(false)
  const [wsStatus, setWsStatus] = useState<{ connected: boolean; client_count: number }>({ connected: false, client_count: 0 })
  const autoSaveRef = useRef<(() => Promise<void>) | null>(null)
  const saveGraphRef = useRef<(() => Promise<void>) | null>(null)
  const importedRef = useRef(false)
  const prismPickerRef = useRef<HTMLDivElement>(null)

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
    if (!showPrismPicker) return
    const handler = (e: MouseEvent) => {
      if (prismPickerRef.current && !prismPickerRef.current.contains(e.target as Node))
        setShowPrismPicker(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showPrismPicker])

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

  const pickDir = useCallback(async (label?: string) => {
    try {
      const [{ open }, { homeDir }] = await Promise.all([
        import('@tauri-apps/plugin-dialog'),
        import('@tauri-apps/api/path'),
      ])
      const defaultPath = `${await homeDir()}/.local/share/PrismLauncher/instances`
      const selected = await open({
        directory: true,
        multiple: false,
        title: label || 'Select directory',
        defaultPath,
      })
      return (selected as string | null) || null
    } catch {
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
    }
  }, [])

  const browseModsDir = useCallback(async () => {
    try {
      const selected = await pickDir()
      if (!selected) return
      setModsDir(selected)
      const idx = await scanModJarTextures(selected)
      setTextureIndex(prev => ({ ...prev, ...idx }))
      alert(`Loaded ${Object.keys(idx).length} textures from ${selected}`)
    } catch (e) {
      console.error('Mods Dir error:', e)
      alert(`Failed to scan mods directory: ${e}`)
    }
  }, [pickDir, setModsDir, setTextureIndex])

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
    setShowPrismPicker(false)
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

  const openPrismPicker = useCallback(async () => {
    if (prismInstances) { setShowPrismPicker(v => !v); return }
    setPrismLoading(true)
    try {
      const instances = await listPrismInstances()
      setPrismInstances(instances)
      setShowPrismPicker(true)
    } catch (e) { console.error('Failed to list Prism instances:', e); alert('Failed to scan Prism instances') }
    finally { setPrismLoading(false) }
  }, [prismInstances])

  const handleReIndex = useCallback(async () => {
    const dir = modsDir || (projectPath ? `${projectPath}/mods` : '')
    if (!dir) { alert('No mods directory set'); return }
    try {
      // Clear localStorage cache keys
      const keysToRemove = ['modcanvas_mods_dir', 'modcanvas_asset_cache_version']
      for (const key of keysToRemove) { localStorage.removeItem(key) }
      console.log('[ModCanvas] Cleared localStorage cache keys')

      // Re-index textures (clears Rust cache + re-scans)
      const idx = await reindexTextures(dir)
      setTextureIndex(idx)
      const texCount = Object.keys(idx).length
      console.log(`[ModCanvas] Re-indexed ${texCount} textures`)

      // Re-import quests from project path
      if (projectPath) {
        const result = await importFtbQuestsFromDir(projectPath)
        if (result.graph && result.chapter_count > 0) {
          setGraph(result.graph)
          await saveQuestGraph(projectId, result.graph)
          const s = result.stats
          const diag = [
            `Quests: ${result.quest_count}`,
            `Chapters: ${result.chapter_count}`,
            `Chapter images: ${s.chapter_images_total}`,
            `Titles from task item: ${s.title_from_task}`,
            `Icons from task item: ${s.icon_from_task}`,
            `Textures indexed: ${texCount}`,
          ].join(' | ')
          console.log(`[ModCanvas ReIndex] ${diag}`)
          alert(`Re-index complete.\n\n${diag}`)
        } else {
          alert(`Re-indexed ${texCount} textures but no FTB Quests data found at ${projectPath}`)
        }
      } else {
        alert(`Re-indexed ${texCount} textures (no project path for quest re-import)`)
      }
    } catch (e) { console.error('Re-index failed:', e); alert(`Re-index failed: ${e}`) }
  }, [modsDir, projectPath, setTextureIndex, projectId, setGraph])

  const handleBrowseOther = useCallback(async () => {
    setShowPrismPicker(false)
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
  }, [projectId, setGraph, pickDir])

  return (
    <>
      <header className="quest-editor-toolbar">
        <div className="quest-editor-toolbar-left">
          <span className="quest-editor-title">{graph.name || 'Quest Book'}</span>
          <button className="book-btn" onClick={browseModsDir} title="Scan mod textures">🎨 Textures</button>
          <button className="book-btn" onClick={handleReIndex} title="Force re-index textures & re-import quests">🔄 Re-Index</button>
          <button className="book-btn" onClick={handleImportFtb} title="Import FTB Quests from project path">📥 FTB Quests</button>
          <div ref={prismPickerRef} style={{ position: 'relative', display: 'inline-block' }}>
            <button className="book-btn" onClick={openPrismPicker} title="Import from a Prism Launcher instance">
              {prismLoading ? '⏳...' : '📂 Prism'}
            </button>
            {showPrismPicker && (
              <div style={{
                position: 'absolute', top: '100%', left: 0, zIndex: 100,
                background: 'var(--bg-surface)', border: '1px solid var(--border-muted)',
                borderRadius: 8, minWidth: 280, maxHeight: 320, overflowY: 'auto',
                boxShadow: '0 4px 20px rgba(0,0,0,0.3)', marginTop: 4,
              }}>
                {(!prismInstances || prismInstances.length === 0) ? (
                  <div style={{ padding: '10px 14px', opacity: 0.6, fontSize: 13 }}>
                    {prismInstances ? 'No Prism instances found' : 'Loading...'}
                  </div>
                ) : prismInstances.map((inst) => (
                  <button key={inst.path} onClick={() => handleImportFromPrism(inst)}
                    style={{
                      display: 'block', width: '100%', padding: '10px 14px', textAlign: 'left',
                      background: 'none', border: 'none', borderBottom: '1px solid var(--border-muted)',
                      cursor: 'pointer', fontSize: 13, color: 'var(--text-normal)',
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-hover)'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'none'}
                  >
                    <div style={{ fontWeight: 600 }}>{inst.name}</div>
                    <div style={{ fontSize: 11, opacity: 0.5 }}>{inst.path}</div>
                  </button>
                ))}
                <button onClick={handleBrowseOther}
                  style={{
                    display: 'block', width: '100%', padding: '10px 14px', textAlign: 'left',
                    background: 'none', border: 'none', cursor: 'pointer', fontSize: 13,
                    color: 'var(--ftb-accent)',
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-hover)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'none'}
                >
                  📁 Browse other directory...
                </button>
              </div>
            )}
          </div>
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
        instancePath={projectPath || ''}
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
