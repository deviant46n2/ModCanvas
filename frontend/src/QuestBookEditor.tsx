import { useCallback, useState, useMemo, useEffect, useRef } from 'react'
import {
  getQuestGraph,
  saveQuestGraph,
  scanModJarTextures,
  wsIpcSendEvent,
  wsIpcGetStatus,
  wsIpcRestart,
  importFtbQuestsFromDir,
  exportFtbQuestsToDir,
} from './services/api'
import type {
  QuestGraphData,
  QuestChapter,
  QuestObjectiveData,
  QuestRewardData,
  QuestNodeData,
} from './services/api'
import { QuestCanvas } from './components/quest/QuestCanvas'
import { ChapterTree } from './components/quest/ChapterTree'
import { QuestDetailModal } from './components/quest/QuestDetailModal'
import './components/quest/editor-theme.css'

const SHAPES = [
  { value: 'default', label: 'Default' },
  { value: 'circle', label: 'Circle' },
  { value: 'square', label: 'Square' },
  { value: 'rounded_square', label: 'Rounded Square' },
  { value: 'diamond', label: 'Diamond' },
  { value: 'pentagon', label: 'Pentagon' },
  { value: 'hexagon', label: 'Hexagon' },
  { value: 'octagon', label: 'Octagon' },
  { value: 'heart', label: 'Heart' },
  { value: 'gear', label: 'Gear' },
]

const PROGRESSION_MODES = [
  { value: 'default', label: 'Inherit from Chapter' },
  { value: 'linear', label: 'Linear (must complete in order)' },
  { value: 'flexible', label: 'Flexible (any order)' },
]

function generateFtbHexId(): string {
  const array = new Uint8Array(8)
  crypto.getRandomValues(array)
  return Array.from(array, byte => byte.toString(16).padStart(2, '0').toUpperCase()).join('')
}

function defaultObjective(): QuestObjectiveData {
  return {
    id: generateFtbHexId(),
    label: '',
    objective_type: 'item_acquisition',
    target: '',
    target_count: 1,
    required: true,
    item_tag: '', nbt_data: '', consume_items: false,
    match_nbt: false, ignore_nbt: false, exact_match: false,
    fluid_id: '', fluid_amount: 0, energy_amount: 0, energy_unit: 'FE',
    xp_levels: 0, xp_points: 0, command: '', dimension: '',
    x: 0, y: 0, z: 0, radius: 0,
    entity_id: '', advancement_id: '', custom_json: '', description: '',
    stat_name: '', stat_value: 0, biome_id: '', structure_id: '',
    observation_range: 4,
  }
}

function defaultReward(): QuestRewardData {
  return {
    id: generateFtbHexId(),
    label: '',
    reward_type: 'item',
    items: [],
    description: '',
    item_id: '', item_tag: '', item_count: 1, nbt_data: '',
    xp_amount: 0, xp_levels: 0, command: '', loot_table: '',
    game_stage: '', weight: 1.0, reward_chests: [], team_reward: false,
    toast_message: '', table_id: '', choices: [], advancement_id: '',
  }
}

import { resolveIconKey, getIconUrl } from './components/quest/questIcons'

interface QuestBookEditorProps {
  projectId: string
  projectPath?: string
  wsConnected?: boolean
}

export default function QuestBookEditor({ projectId, projectPath, wsConnected: _wsConnected }: QuestBookEditorProps) {
  const [graph, setGraph] = useState<QuestGraphData | null>(null)
  const [showBookSettings, setShowBookSettings] = useState(false)
  const [modsDir, setModsDir] = useState(() => localStorage.getItem('modcanvas_mods_dir') || '')
  const [modsDirInput, setModsDirInput] = useState(() => localStorage.getItem('modcanvas_mods_dir') || '')
  const [textureIndex, setTextureIndex] = useState<Record<string, string>>({})
  const [showIconPicker, setShowIconPicker] = useState(false)
  const [iconPickerSearch, setIconPickerSearch] = useState('')
  const [iconPickerTarget, setIconPickerTarget] = useState<{ type: 'quest' | 'objective' | 'reward' | 'chapter' | 'book', nodeId?: string } | null>(null)

  const [activeChapter, setActiveChapter] = useState<string | null>(null)
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({})
  const [saveMessage, setSaveMessage] = useState<{ text: string; ok: boolean } | null>(null)
  const importedRef = useRef(false)

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)

  const [wsStatus, setWsStatus] = useState<{ connected: boolean; client_count: number }>({ connected: false, client_count: 0 })

  const autoSaveRef = useRef<(() => Promise<void>) | null>(null)
  const saveGraphRef = useRef<(() => Promise<void>) | null>(null)

  const refreshWsStatus = useCallback(async () => {
    try {
      const status = await wsIpcGetStatus()
      setWsStatus({ connected: status.connected, client_count: status.client_count })
    } catch { /* ignore */ }
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
    if (!wsStatus.connected) {
      await handleReconnect()
    }
    try {
      await wsIpcSendEvent('RELOAD_QUESTS')
      const texCount = Object.keys(textureIndex).length;
      setSaveMessage(m => m?.ok ? { text: `Saved ✓ (${texCount} textures)`, ok: true } : m!)
    } catch (e) {
      setSaveMessage({ text: `Hot-reload failed: ${e}`, ok: false })
      console.error('Hot-reload failed:', e)
    }
  }, [graph, wsStatus.connected, handleReconnect, textureIndex])

  const setModsDirPersisted = useCallback((dir: string) => {
    setModsDir(dir)
    setModsDirInput(dir)
    if (dir) localStorage.setItem('modcanvas_mods_dir', dir)
    else localStorage.removeItem('modcanvas_mods_dir')
  }, [])

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
      setModsDirPersisted(selected)
      const idx = await scanModJarTextures(selected)
      setTextureIndex(idx)
      alert(`Loaded ${Object.keys(idx).length} textures from ${selected}`)
    } catch (e) {
      console.error('Mods Dir error:', e)
      alert(`Failed to scan mods directory: ${e}`)
    }
  }, [setModsDirPersisted, pickDir])

  const textureScanRef = useRef(0);
  const textureLoadedRef = useRef(false);
  useEffect(() => {
    const dir = modsDir || (projectPath ? `${projectPath}/mods` : '')
    if (dir) {
      if (!modsDir) setModsDirPersisted(dir)
      const scanId = ++textureScanRef.current;
      scanModJarTextures(dir).then((idx) => {
        if (scanId !== textureScanRef.current) return;
        if (Object.keys(idx).length === 0 && textureLoadedRef.current) return;
        textureLoadedRef.current = Object.keys(idx).length > 0;
        setTextureIndex(idx)
        console.log(`[ModCanvas] Loaded ${Object.keys(idx).length} textures from ${dir}`)
      }).catch((e) => console.error('Failed to scan textures:', e))
    }
  }, [modsDir, projectPath])

  useEffect(() => {
    importedRef.current = false
    refreshWsStatus()
    getQuestGraph(projectId).then((data) => {
      if (data) {
        console.log('[QuestBookEditor] chapters:', data.chapters.map((c: any) => ({ id: c.id, title: c.title, icon: c.icon })))
        setGraph(data)
        if (data.chapters.length > 0 && !activeChapter) {
          setActiveChapter(data.chapters[0].id)
        }
      }
    }).catch((e) => console.error('Failed to load quest graph:', e))
  }, [projectId, refreshWsStatus])

  // Fallback: auto-import FTB Quests if graph is empty and project path is available
  useEffect(() => {
    if (!projectPath || !graph || graph.chapters.length > 0 || graph.nodes.length > 0) return
    if (importedRef.current) return
    importedRef.current = true
    console.log('[QuestBookEditor] No quest data found, trying FTB Quests import from', projectPath)
    importFtbQuestsFromDir(projectPath).then((result) => {
      if (result.graph && result.chapter_count > 0) {
        console.log(`[QuestBookEditor] Imported ${result.quest_count} quests, ${result.chapter_count} chapters`)
        setGraph(result.graph)
        if (result.graph.chapters.length > 0) {
          setActiveChapter(result.graph.chapters[0].id)
        }
        saveQuestGraph(projectId, result.graph).catch((e) =>
          console.error('Failed to save imported quest graph:', e)
        )
      }
    }).catch((e) => {
      console.error('FTB Quests import failed:', e)
      importedRef.current = false
    })
  }, [graph, projectPath, projectId])

  autoSaveRef.current = async () => {
    if (!graph) return
    console.log('[autoSave] start, graph.nodes:', graph.nodes.length, 'graph.edges:', graph.edges.length)

    const existingChapterNodeIds = new Set(graph.nodes.filter(n => n.node_type === 'chapter').map(n => n.id))
    const extraNodes = graph.chapters
      .filter(ch => !existingChapterNodeIds.has(ch.id))
      .map(ch => ({
        id: ch.id,
        node_type: 'chapter',
        label: ch.title,
        description: '',
        position: { x: 0, y: 0 },
        data: {},
        objectives: [],
        rewards: [],
        required_items: [],
        chapter_id: null,
        icon: '',
        size: { width: 24, height: 24 },
        color: '',
        visibility: 'normal',
        optional: false,
        silently_complete: false,
        can_be_repeatable: false,
        repeat_min_delay: 0,
        repeat_max_delay: 0,
        repeat_time: 0,
        hide_quest_until_deps_complete: false,
        hide_quest_until_quest_complete: false,
        hide_quest_until_all_complete: false,
        disable_reward: false,
        pause_reward: false,
        lock_icon: '',
        subtitle: '',
        quest_background: '',
        shape: 'default',
        icon_scaling: 1.0,
        tags: [],
        progression_mode: 'default',
        sequential_tasks: false,
        disable_completion_toast: false,
        ignore_reward_blocking: false,
        disable_jei_recipe: false,
        min_window_width: 0,
        hide_details_until_startable: false,
        hide_text_until_completed: false,
        invisible_until_completed: false,
        invisible_until_x_tasks: 0,
        hide_dependency_lines: false,
        hide_dependent_lines: false,
        min_required_dependencies: 0,
        dependency_requirement: 'all_completed',
      }))

    const updatedGraph: QuestGraphData = {
      ...graph,
      chapters: graph.chapters.map(ch => ({
        ...ch,
        icon: ch.icon,
        background_image: ch.background_image,
        order_index: ch.order_index,
      })),
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
    const emptyIconNodes = updatedGraph.nodes.filter(n => !n.icon);
    if (emptyIconNodes.length > 0) {
      console.warn('[autoSave] Nodes with empty icon:', emptyIconNodes.map(n => ({ id: n.id, icon: n.icon, label: n.label })));
    }
    try {
      await saveQuestGraph(projectId, updatedGraph)
      if (extraNodes.length > 0) {
        setGraph(updatedGraph);
      }
    } catch (e) {
      console.error('Failed to save quest graph:', e)
    }
  }

  saveGraphRef.current = async () => {
    console.log('[saveGraph] start, textureIndex keys:', Object.keys(textureIndex).length)
    await autoSaveRef.current?.()
    if (!projectPath) return
    try {
      console.log('[saveGraph] exporting to:', projectPath, 'textureIndex:', Object.keys(textureIndex).length)
      await exportFtbQuestsToDir(projectId, projectPath)
      setSaveMessage({ text: `Saved + exported ✓ (${Object.keys(textureIndex).length} textures)`, ok: true })
    } catch (e) {
      setSaveMessage({ text: `Export failed: ${e}`, ok: false })
      console.error('Failed to export quest graph:', e)
    }
    setTimeout(() => setSaveMessage(null), 5000)
  }

  const onUpdateNode = useCallback((nodeId: string, data: Partial<QuestNodeData>) => {
    if (!graph) return
    const updatedNodes = graph.nodes.map(n =>
      n.id === nodeId ? { ...n, ...data } : n
    )
    const updatedGraph = { ...graph, nodes: updatedNodes }
    setGraph(updatedGraph)
    setTimeout(() => autoSaveRef.current?.(), 300)
  }, [graph])

  const onAddChapter = useCallback(() => {
    if (!graph) return
    const newId = generateFtbHexId()
    const newChapter: QuestChapter = {
      id: newId,
      title: 'New Chapter',
      description: '',
      icon: '',
      background_image: '',
      order_index: graph.chapters.length,
      hide_until_first_quest_complete: false,
      default_quest_size: { width: 24, height: 24 },
      quest_color: '',
      group_id: null,
      default_quest_shape: 'default',
      default_enabled: true,
      progression_mode: 'default',
    }
    const chapterNode: QuestNodeData = {
      id: newId,
      node_type: 'chapter',
      label: 'New Chapter',
      description: '',
      position: { x: 0, y: 0 },
      data: {},
      objectives: [],
      rewards: [],
      required_items: [],
      chapter_id: null,
      icon: '',
      size: { width: 24, height: 24 },
      color: '',
      visibility: 'normal',
      optional: false,
      silently_complete: false,
      can_be_repeatable: false,
      repeat_min_delay: 0,
      repeat_max_delay: 0,
      repeat_time: 0,
      hide_quest_until_deps_complete: false,
      hide_quest_until_quest_complete: false,
      hide_quest_until_all_complete: false,
      disable_reward: false,
      pause_reward: false,
      lock_icon: '',
      subtitle: '',
      quest_background: '',
      shape: 'default',
      icon_scaling: 1.0,
      tags: [],
      progression_mode: 'default',
      sequential_tasks: false,
      disable_completion_toast: false,
      ignore_reward_blocking: false,
      disable_jei_recipe: false,
      min_window_width: 0,
      hide_details_until_startable: false,
      hide_text_until_completed: false,
      invisible_until_completed: false,
      invisible_until_x_tasks: 0,
      hide_dependency_lines: false,
      hide_dependent_lines: false,
      min_required_dependencies: 0,
      dependency_requirement: 'all_completed',
    }
    const updatedGraph = {
      ...graph,
      chapters: [...graph.chapters, newChapter],
      nodes: [...graph.nodes, chapterNode],
    }
    setGraph(updatedGraph)
    setActiveChapter(newChapter.id)
    setTimeout(() => autoSaveRef.current?.(), 300)
  }, [graph])

  const onAddQuest = useCallback(() => {
    if (!graph || !activeChapter) return
    const newNode: QuestNodeData = {
      id: generateFtbHexId(),
      node_type: 'quest',
      label: 'New Quest',
      description: '',
      position: { x: 0, y: 0 },
      data: {},
      objectives: [],
      rewards: [],
      required_items: [],
      chapter_id: activeChapter,
      icon: '',
      size: { width: 24, height: 24 },
      color: '',
      visibility: 'normal',
      optional: false,
      silently_complete: false,
      can_be_repeatable: false,
      repeat_min_delay: 0,
      repeat_max_delay: 0,
      repeat_time: 0,
      hide_quest_until_deps_complete: false,
      hide_quest_until_quest_complete: false,
      hide_quest_until_all_complete: false,
      disable_reward: false,
      pause_reward: false,
      lock_icon: '',
      subtitle: '',
      quest_background: '',
      shape: 'default',
      icon_scaling: 1.0,
      tags: [],
      progression_mode: 'default',
      sequential_tasks: false,
      disable_completion_toast: false,
      ignore_reward_blocking: false,
      disable_jei_recipe: false,
      min_window_width: 0,
      hide_details_until_startable: false,
      hide_text_until_completed: false,
      invisible_until_completed: false,
      invisible_until_x_tasks: 0,
      hide_dependency_lines: false,
      hide_dependent_lines: false,
      min_required_dependencies: 0,
      dependency_requirement: 'all_completed',
    }
    const updatedGraph = { ...graph, nodes: [...graph.nodes, newNode] }
    setGraph(updatedGraph)
    setTimeout(() => autoSaveRef.current?.(), 300)
  }, [graph])

  const onDeleteNode = useCallback((nodeId: string) => {
    if (!graph) return
    const updatedGraph = { ...graph, nodes: graph.nodes.filter(n => n.id !== nodeId) }
    setGraph(updatedGraph)
    if (selectedNodeId === nodeId) {
      setSelectedNodeId(null)
    }
    setTimeout(() => autoSaveRef.current?.(), 300)
  }, [graph])

  const onAddObjective = useCallback((nodeId: string) => {
    if (!graph) return
    const updatedNodes = graph.nodes.map(n =>
      n.id === nodeId
        ? { ...n, objectives: [...(n.objectives || []), defaultObjective()] }
        : n
    )
    setGraph({ ...graph, nodes: updatedNodes })
    setTimeout(() => autoSaveRef.current?.(), 300)
  }, [graph])

  const onAddReward = useCallback((nodeId: string) => {
    if (!graph) return
    const updatedNodes = graph.nodes.map(n =>
      n.id === nodeId
        ? { ...n, rewards: [...(n.rewards || []), defaultReward()] }
        : n
    )
    setGraph({ ...graph, nodes: updatedNodes })
    setTimeout(() => autoSaveRef.current?.(), 300)
  }, [graph])

  const onRemoveObjective = useCallback((nodeId: string, objectiveId: string) => {
    if (!graph) return
    const updatedNodes = graph.nodes.map(n =>
      n.id === nodeId
        ? { ...n, objectives: (n.objectives || []).filter(o => o.id !== objectiveId) }
        : n
    )
    setGraph({ ...graph, nodes: updatedNodes })
    setTimeout(() => autoSaveRef.current?.(), 300)
  }, [graph])

  const onRemoveReward = useCallback((nodeId: string, rewardId: string) => {
    if (!graph) return
    const updatedNodes = graph.nodes.map(n =>
      n.id === nodeId
        ? { ...n, rewards: (n.rewards || []).filter(r => r.id !== rewardId) }
        : n
    )
    setGraph({ ...graph, nodes: updatedNodes })
    setTimeout(() => autoSaveRef.current?.(), 300)
  }, [graph])

  const onUpdateObjective = useCallback((nodeId: string, objectiveId: string, field: string, value: unknown) => {
    if (!graph) return
    const updatedNodes = graph.nodes.map(n =>
      n.id === nodeId
        ? {
            ...n,
            objectives: (n.objectives || []).map(o =>
              o.id === objectiveId ? { ...o, [field]: value } : o
            ),
          }
        : n
    )
    setGraph({ ...graph, nodes: updatedNodes })
    setTimeout(() => autoSaveRef.current?.(), 300)
  }, [graph])

  const onUpdateReward = useCallback((nodeId: string, rewardId: string, field: string, value: unknown) => {
    if (!graph) return
    const updatedNodes = graph.nodes.map(n =>
      n.id === nodeId
        ? {
            ...n,
            rewards: (n.rewards || []).map(r =>
              r.id === rewardId ? { ...r, [field]: value } : r
            ),
          }
        : n
    )
    setGraph({ ...graph, nodes: updatedNodes })
    setTimeout(() => autoSaveRef.current?.(), 300)
  }, [graph])

  const openIconPicker = useCallback((target: { type: 'quest' | 'objective' | 'reward' | 'chapter' | 'book', index?: number, nodeId?: string }) => {
    setIconPickerTarget(target)
    setIconPickerSearch('')
    setShowIconPicker(true)
  }, [])

  const filteredIcons = useMemo(() => {
    if (!textureIndex) return []
    const entries = Object.entries(textureIndex)
    if (!iconPickerSearch) return entries.slice(0, 200)
    const search = iconPickerSearch.toLowerCase()
    return entries.filter(([key]) => key.toLowerCase().includes(search)).slice(0, 200)
  }, [textureIndex, iconPickerSearch])

  const selectIcon = useCallback((itemId: string) => {
    if (!iconPickerTarget || !graph) return
    const { type, nodeId } = iconPickerTarget

    if (type === 'book') {
      const updatedGraph = { ...graph, book_icon: itemId }
      setGraph(updatedGraph)
      setTimeout(() => autoSaveRef.current?.(), 300)
    } else if (type === 'chapter' && nodeId) {
      const updatedChapters = graph.chapters.map(ch =>
        ch.id === nodeId ? { ...ch, icon: itemId } : ch
      )
      setGraph({ ...graph, chapters: updatedChapters })
      setTimeout(() => autoSaveRef.current?.(), 300)
    } else if (nodeId) {
      const updatedNodes = graph.nodes.map(n =>
        n.id === nodeId
          ? {
              ...n,
              icon: itemId,
              iconDataUrl: textureIndex[itemId] || '',
            }
          : n
      )
      setGraph({ ...graph, nodes: updatedNodes })
      setTimeout(() => autoSaveRef.current?.(), 300)
    }
    setShowIconPicker(false)
    setIconPickerTarget(null)
  }, [iconPickerTarget, graph, textureIndex])

  const chapterIcons = useMemo(() => {
    if (!graph) return {} as Record<string, string | undefined>
    const map: Record<string, string | undefined> = {}
    for (const ch of graph.chapters) {
      const key = resolveIconKey(ch.icon)
      map[ch.id] = key ? getIconUrl(textureIndex, key) : undefined
    }
    return map
  }, [graph, textureIndex])

  const questCounts = useMemo(() => {
    if (!graph) return {} as Record<string, number>
    const map: Record<string, number> = {}
    for (const ch of graph.chapters) {
      map[ch.id] = graph.nodes.filter(n => n.chapter_id === ch.id).length
    }
    return map
  }, [graph])

  const handleToggleGroup = useCallback((id: string) => {
    setCollapsedGroups(prev => ({ ...prev, [id]: !prev[id] }))
  }, [])

  if (!graph) {
    return (
      <div className="quest-editor" style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#1e1e1e' }}>
        <div className="book-empty">
          <div className="book-empty-icon">📖</div>
          <div className="book-empty-text">No quest data loaded</div>
          <div className="book-empty-hint">Create or import a quest book to begin</div>
        </div>
      </div>
    )
  }

  const selectedNode = selectedNodeId ? graph.nodes.find(n => n.id === selectedNodeId) : null

  return (
    <div className="quest-editor">
      <header className="quest-editor-toolbar">
        <div className="quest-editor-toolbar-left">
          <span className="quest-editor-title">{graph.name || 'Quest Book'}</span>
          <button className="book-btn" onClick={browseModsDir} title="Scan mod textures">🎨 Textures</button>
          <button className="book-btn" onClick={async () => {
            if (!projectPath) { alert('No project path available'); return }
            try {
              const result = await importFtbQuestsFromDir(projectPath)
              if (result.graph && result.chapter_count > 0) {
                setGraph(result.graph)
                if (result.graph.chapters.length > 0) setActiveChapter(result.graph.chapters[0].id)
                await saveQuestGraph(projectId, result.graph)
                alert(`Imported ${result.quest_count} quests across ${result.chapter_count} chapters`)
              } else alert('No FTB Quests data found in this pack')
            } catch (e) { console.error('FTB Quests import failed:', e); alert(`Import failed: ${e}`) }
          }} title="Import FTB Quests from pack">📥 FTB Quests</button>
          <button className="book-btn" onClick={() => { setModsDirInput(modsDir); setShowBookSettings(true) }}>⚙️ Settings</button>
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
              fontSize: 11,
              marginLeft: 8,
              color: saveMessage.ok ? 'var(--ftb-accent)' : '#ff6b6b',
              opacity: 0.9,
              whiteSpace: 'nowrap',
            }}>
              {saveMessage.text}
            </span>
          )}
        </div>
      </header>

      <div className="quest-editor-body">
        <aside className="quest-editor-chapters" role="navigation" aria-label="Chapters">
          <ChapterTree
            chapters={graph.chapters}
            chapterGroups={graph.chapter_groups || []}
            activeChapter={activeChapter}
            questCounts={questCounts}
            chapterIcons={chapterIcons}
            collapsedGroups={collapsedGroups}
            onSelectChapter={setActiveChapter}
            onToggleGroup={handleToggleGroup}
            onAddChapter={onAddChapter}
          />
        </aside>

        <main className="quest-editor-canvas">
          <QuestCanvas
            questGraph={graph}
            chapters={graph.chapters}
            activeChapter={activeChapter}
            textureIndex={textureIndex}
            onUpdateNode={onUpdateNode}
            onUpdateEdge={(_edgeId, _data) => {}}
            onDeleteNode={onDeleteNode}
            onDeleteEdge={(_edgeId) => {}}
            onAddNode={onAddQuest}
            selectedNodeId={selectedNodeId}
            setSelectedNodeId={setSelectedNodeId}
          />
        </main>

        {selectedNode && (
          <QuestDetailModal
            node={selectedNode}
            textureIndex={textureIndex}
            onUpdateNode={onUpdateNode}
            onDeleteNode={onDeleteNode}
            onAddObjective={onAddObjective}
            onRemoveObjective={onRemoveObjective}
            onUpdateObjective={onUpdateObjective}
            onAddReward={onAddReward}
            onRemoveReward={onRemoveReward}
            onUpdateReward={onUpdateReward}
            openIconPicker={openIconPicker}
            onClose={() => setSelectedNodeId(null)}
          />
        )}
      </div>
      {showIconPicker && (
        <div className="ftb-quest-popup-overlay" onClick={() => { setShowIconPicker(false); setIconPickerTarget(null) }}>
          <div className="ftb-quest-popup icon-picker-modal" onClick={(e) => e.stopPropagation()}>
            <div className="ftb-popup-header">
              <div className="ftb-popup-header-left">
                <div className="ftb-popup-title">Select Icon</div>
                <div className="ftb-popup-type">{iconPickerTarget?.type || 'quest'}</div>
              </div>
              <button className="ftb-popup-close" onClick={() => { setShowIconPicker(false); setIconPickerTarget(null) }}>✕</button>
            </div>
            <div className="ftb-popup-body">
              <input
                type="text"
                placeholder="Search textures..."
                value={iconPickerSearch}
                onChange={(e) => setIconPickerSearch(e.target.value)}
                style={{ width: '100%', padding: '8px 12px', borderRadius: '4px', border: '1px solid #313244', background: '#181825', color: '#cdd6f4', fontSize: '13px', marginBottom: '12px', boxSizing: 'border-box' }}
              />
              <div className="icon-picker-grid">
                {filteredIcons.map(([itemId, dataUrl]) => (
                  <button
                    key={itemId}
                    className="icon-picker-item"
                    onClick={() => selectIcon(itemId)}
                    style={{ aspectRatio: '1/1', padding: '8px', minHeight: 0 }}
                  >
                    <img src={dataUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain', imageRendering: 'pixelated', borderRadius: '3px' }} />
                    <span className="icon-picker-label">{itemId}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {showBookSettings && (
        <div className="ftb-quest-popup-overlay" onClick={() => setShowBookSettings(false)}>
          <div className="ftb-quest-popup" style={{ width: '480px' }} onClick={(e) => e.stopPropagation()}>
            <div className="ftb-popup-header">
              <div className="ftb-popup-header-left">
                <div className="ftb-popup-title">Book Settings</div>
              </div>
              <button className="ftb-popup-close" onClick={() => setShowBookSettings(false)}>✕</button>
            </div>
            <div className="ftb-popup-body">
              <div className="ftb-popup-section">
                <div className="ftb-popup-field">
                  <label>Book Title</label>
                  <input type="text" value={graph.name} onChange={(e) => setGraph(graph ? { ...graph, name: e.target.value } : null)} />
                </div>
                <div className="ftb-popup-field">
                  <label>Description</label>
                  <textarea value={graph.description} onChange={(e) => setGraph(graph ? { ...graph, description: e.target.value } : null)} />
                </div>
                <div className="ftb-popup-field">
                  <label>Book Progression Mode</label>
                  <select value={graph.book_progression_mode} onChange={(e) => setGraph(graph ? { ...graph, book_progression_mode: e.target.value } : null)}>
                    {PROGRESSION_MODES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                  </select>
                </div>
                <div className="ftb-popup-field">
                  <label>Default Quest Color</label>
                  <input type="color" value={graph.quest_color || '#60a5fa'} onChange={(e) => setGraph(graph ? { ...graph, quest_color: e.target.value } : null)} />
                </div>
                <div className="ftb-popup-field">
                  <label>Default Quest Shape</label>
                  <select value={graph.default_quest_shape} onChange={(e) => setGraph(graph ? { ...graph, default_quest_shape: e.target.value } : null)}>
                    {SHAPES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </div>
                <div className="ftb-popup-field">
                  <label>Default Quest Width</label>
                  <input type="number" value={graph.default_quest_size?.width || 24} onChange={(e) => setGraph(graph ? { ...graph, default_quest_size: { ...graph.default_quest_size, width: parseInt(e.target.value) || 24 } } : null)} />
                </div>
                <div className="ftb-popup-field">
                  <label>Default Quest Height</label>
                  <input type="number" value={graph.default_quest_size?.height || 24} onChange={(e) => setGraph(graph ? { ...graph, default_quest_size: { ...graph.default_quest_size, height: parseInt(e.target.value) || 24 } } : null)} />
                </div>
                <div className="ftb-popup-field">
                  <label>Mods Directory</label>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input type="text" value={modsDirInput} onChange={(e) => setModsDirInput(e.target.value)} placeholder="e.g. /home/user/instances/MyPack/mods" style={{ flex: 1 }} />
                    <button className="ftb-popup-btn" onClick={async () => {
                      const selected = await pickDir()
                      if (!selected) return
                      setModsDirInput(selected)
                      setModsDirPersisted(selected)
                      const idx = await scanModJarTextures(selected)
                      setTextureIndex(idx)
                      alert(`Loaded ${Object.keys(idx).length} textures from ${selected}`)
                    }}>Browse</button>
                    <button className="ftb-popup-btn primary" onClick={async () => {
                      if (!modsDirInput) return
                      setModsDirPersisted(modsDirInput)
                      const idx = await scanModJarTextures(modsDirInput)
                      setTextureIndex(idx)
                      alert(`Loaded ${Object.keys(idx).length} textures from ${modsDirInput}`)
                    }}>Load Textures</button>
                  </div>
                  <div style={{ fontSize: 11, opacity: 0.6, marginTop: 4 }}>
                    🖼 {Object.keys(textureIndex).length} textures loaded
                  </div>
                </div>
              </div>
            </div>
            <div className="ftb-popup-footer">
              <div className="ftb-popup-footer-right">
                <button className="ftb-popup-btn" onClick={() => setShowBookSettings(false)}>Close</button>
                <button className="ftb-popup-btn primary" onClick={() => { saveGraphRef.current?.(); setShowBookSettings(false) }}>Save & Close</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}