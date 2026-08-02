import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { useNodesState, useEdgesState, MarkerType, addEdge } from '@xyflow/react'
import type { Node, Edge, Connection } from '@xyflow/react'
import {
  getQuestGraph, saveQuestGraph,
  importFtbQuestsFromDir, exportFtbQuestsToDir, scanModJarTextures,
  ingestActiveInstance, logDebug,
} from '../services/api'
import type { QuestGraphData, QuestObjectiveData, QuestRewardData } from '../services/api'
import type { QuestTileData } from '../components/QuestTile'
import { autoLayoutNodes, resolveIconKey, defaultObjective, defaultReward } from '../components/quest/nodes'
import { graphToApiData, toRfEdges } from '../services/graphConverters'

export function useGraphData(projectId: string, projectPath?: string) {
  const [graph, setGraph] = useState<QuestGraphData | null>(null)
    const [textureIndex, setTextureIndex] = useState<Record<string, string>>({})
  const [modsDir, setModsDir] = useState(() => localStorage.getItem('modcanvas_mods_dir') || '')
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
  const [activeChapter, setActiveChapter] = useState<string | null>(null)
    const [iconPickerSearch, setIconPickerSearch] = useState('')
  const [showIconPicker, setShowIconPicker] = useState(false)
  const importedRef = useRef(false)

  const setModsDirPersisted = useCallback((dir: string) => {
    setModsDir(dir)
    if (dir) localStorage.setItem('modcanvas_mods_dir', dir)
    else localStorage.removeItem('modcanvas_mods_dir')
  }, [])

  const browseModsDir = useCallback(async () => {
    const modsPath = projectPath ? `${projectPath}/mods` : ''
    if (!modsPath) { alert('No project path available'); return }
    try {
      setModsDirPersisted(modsPath)
      const idx = await scanModJarTextures(modsPath)
      setTextureIndex(idx)
      alert(`Loaded ${Object.keys(idx).length} textures from ${modsPath}`)
    } catch (e) { console.error('Mods Dir error:', e); alert(`Failed to scan ${modsPath}: ${e}`) }
  }, [projectPath, setModsDirPersisted])

  const openIconPicker = useCallback(() => {
    setIconPickerSearch('')
    setShowIconPicker(true)
  }, [])

  useEffect(() => { importedRef.current = false }, [projectId])

  useEffect(() => {
    if (!modsDir && projectPath) {
      const inferred = `${projectPath}/mods`
      setModsDir(inferred)
      return
    }
    if (modsDir) {
      const instancePath = modsDir.replace(/\/mods$/, '')
      ingestActiveInstance(instancePath).then((result) => {
        setTextureIndex(result.asset_registry.by_id)
        const msg = `[Ingestion Engine] Indexed ${result.textures_indexed} textures for instance ${result.active_instance} (${result.jars_scanned} jars scanned)`
        console.log(msg)
        logDebug(msg)
      }).catch((e: unknown) => {
        console.error('Ingestion failed, falling back to scanModJarTextures:', e)
        scanModJarTextures(modsDir).then((idx: Record<string, string>) => {
          setTextureIndex(idx)
          console.log(`[ModCanvas] Loaded ${Object.keys(idx).length} textures from ${modsDir}`)
        }).catch((e2: unknown) => console.error('Failed to scan textures:', e2))
      })
    }
  }, [modsDir, projectPath])

  const saveGraphRef = useRef<(() => Promise<void>) | null>(null)
  saveGraphRef.current = async () => {
    if (!graph) return
    try {
      const updatedGraph = graphToApiData(graph, nodes, edges)
      await saveQuestGraph(projectId, updatedGraph)
      setGraph(updatedGraph)
    } catch (e) { console.error('Failed to save quest graph:', e) }
  }

  const onUpdateNode = useCallback((nodeId: string, data: Partial<QuestTileData>) => {
    setNodes((nds) => nds.map((n) => n.id === nodeId ? { ...n, data: { ...n.data, ...data } } : n))
    setTimeout(() => saveGraphRef.current?.(), 300)
  }, [setNodes])

  const onAddObjective = useCallback((nodeId: string) => {
    
    setNodes((nds) => nds.map((n) => n.id === nodeId ? { ...n, data: { ...n.data, objectives: [...(n.data?.objectives as QuestObjectiveData[] || []), defaultObjective()] } } : n))
    setTimeout(() => saveGraphRef.current?.(), 300)
  }, [setNodes])

  const onAddReward = useCallback((nodeId: string) => {
    
    setNodes((nds) => nds.map((n) => n.id === nodeId ? { ...n, data: { ...n.data, rewards: [...(n.data?.rewards as QuestRewardData[] || []), defaultReward()] } } : n))
    setTimeout(() => saveGraphRef.current?.(), 300)
  }, [setNodes])

  const onRemoveObjective = useCallback((nodeId: string, objectiveId: string) => {
    setNodes((nds) => nds.map((n) => n.id === nodeId ? { ...n, data: { ...n.data, objectives: (n.data?.objectives as QuestObjectiveData[] || []).filter((o) => o.id !== objectiveId) } } : n))
    setTimeout(() => saveGraphRef.current?.(), 300)
  }, [setNodes])

  const onRemoveReward = useCallback((nodeId: string, rewardId: string) => {
    setNodes((nds) => nds.map((n) => n.id === nodeId ? { ...n, data: { ...n.data, rewards: (n.data?.rewards as QuestRewardData[] || []).filter((r) => r.id !== rewardId) } } : n))
    setTimeout(() => saveGraphRef.current?.(), 300)
  }, [setNodes])

  const onUpdateObjective = useCallback((nodeId: string, objectiveId: string, field: string, value: unknown) => {
    setNodes((nds) => nds.map((n) => n.id === nodeId ? { ...n, data: { ...n.data, objectives: (n.data?.objectives as QuestObjectiveData[] || []).map((o) => o.id === objectiveId ? { ...o, [field]: value } : o) } } : n))
    setTimeout(() => saveGraphRef.current?.(), 300)
  }, [setNodes])

  const onUpdateReward = useCallback((nodeId: string, rewardId: string, field: string, value: unknown) => {
    setNodes((nds) => nds.map((n) => n.id === nodeId ? { ...n, data: { ...n.data, rewards: (n.data?.rewards as QuestRewardData[] || []).map((r) => r.id === rewardId ? { ...r, [field]: value } : r) } } : n))
    setTimeout(() => saveGraphRef.current?.(), 300)
  }, [setNodes])

  const toRfNodesCb = useCallback((g: QuestGraphData, texIndex: Record<string, string>): Node[] => {
    const SCALE = 48
    return g.nodes.map((n: any) => ({
      id: n.id, type: (n.node_type || 'quest').toLowerCase(),
      position: { x: n.position.x * SCALE, y: n.position.y * SCALE },
      data: {
        label: n.label, description: n.description, nodeType: n.node_type,
        objectives: n.objectives, rewards: n.rewards, required_items: n.required_items,
        chapter_id: n.chapter_id, icon: n.icon,
        iconDataUrl: n.icon ? (texIndex[resolveIconKey(n.icon)] || '') : '',
        size: n.size, color: n.color, visibility: n.visibility,
        optional: n.optional, silently_complete: n.silently_complete,
        can_be_repeatable: n.can_be_repeatable, repeat_cooldown: n.repeat_cooldown,
        hide_quest_until_deps_complete: n.hide_quest_until_deps_complete,
        hide_quest_until_quest_complete: n.hide_quest_until_quest_complete,
        hide_quest_until_all_complete: n.hide_quest_until_all_complete,
        disable_reward: n.disable_reward, pause_reward: n.pause_reward,
        lock_icon: n.lock_icon, hide_lock_icon: n.hide_lock_icon,
        guide_page: n.guide_page, max_completable_dependents: n.max_completable_dependents,
        subtitle: n.subtitle, quest_background: n.quest_background,
        shape: n.shape, icon_scaling: n.icon_scaling, tags: n.tags,
        progression_mode: n.progression_mode, sequential_tasks: n.sequential_tasks,
        disable_completion_toast: n.disable_completion_toast,
        ignore_reward_blocking: n.ignore_reward_blocking,
        disable_jei_recipe: n.disable_jei_recipe, min_window_width: n.min_window_width,
        hide_details_until_startable: n.hide_details_until_startable,
        hide_text_until_completed: n.hide_text_until_completed,
        invisible_until_completed: n.invisible_until_completed,
        invisible_until_x_tasks: n.invisible_until_x_tasks,
        hide_dependency_lines: n.hide_dependency_lines,
        hide_dependent_lines: n.hide_dependent_lines,
        min_required_dependencies: n.min_required_dependencies,
        dependency_requirement: n.dependency_requirement,
        textureIndex: texIndex, onUpdateNode, onAddObjective, onAddReward,
        onRemoveObjective, onRemoveReward, onUpdateObjective, onUpdateReward,
        openIconPicker,
      },
    }))
  }, [onUpdateNode, onAddObjective, onAddReward, onRemoveObjective, onRemoveReward, onUpdateObjective, onUpdateReward, openIconPicker])

  const loadGraph = useCallback(async () => {
    if (importedRef.current) return
    try {
      const g = await getQuestGraph(projectId)
      if (importedRef.current) return
      setGraph(g); setNodes(toRfNodesCb(g, textureIndex)); setEdges(toRfEdges(g))
      if (g.chapters.length > 0) setActiveChapter(g.chapters[0].id)
      setNodes(nds => {
        const qn = nds.filter(n => n.type !== 'chapter')
        if (qn.length > 0 && qn.every(n => n.position.x === 0 && n.position.y === 0)) return autoLayoutNodes(nds, g.chapters)
        return nds
      })
    } catch (e) { console.error('Failed to load quest graph:', e) }
  }, [projectId, setNodes, setEdges, toRfNodesCb, textureIndex])

  const saveGraph = useCallback(async () => {
    if (!graph) return
    try {
      const updatedGraph = graphToApiData(graph, nodes, edges)
      await saveQuestGraph(projectId, updatedGraph); setGraph(updatedGraph)
    } catch (e) { console.error('Failed to save quest graph:', e) }
  }, [graph, nodes, edges, projectId])

  const autoGenerate = useCallback(async () => {
    let packDir = projectPath
    if (!packDir) {
      const { open } = await import('@tauri-apps/plugin-dialog')
      const selected = await open({ directory: true, multiple: false, title: 'Select FTB Quests pack directory', defaultPath: modsDir || undefined })
      if (!selected) return; packDir = selected as string
    }
    try {
      const result = await importFtbQuestsFromDir(packDir)
      if (result.graph) {
        importedRef.current = true
        setGraph(result.graph); setNodes(toRfNodesCb(result.graph, textureIndex)); setEdges(toRfEdges(result.graph))
        setActiveChapter(result.graph.chapters[0]?.id ?? null)
        setNodes(nds => autoLayoutNodes(nds, result.graph.chapters))
        try { await saveQuestGraph(projectId, result.graph) } catch (e) { console.error(e) }
        const mp = packDir ? `${packDir}/mods` : ''
        if (mp && Object.keys(textureIndex).length === 0) {
          try {
            const ingestResult = await ingestActiveInstance(packDir)
            const idx = ingestResult.asset_registry.by_id
            setTextureIndex(idx)
            const msg = `[Ingestion Engine] Indexed ${ingestResult.textures_indexed} textures for ${packDir}`
            console.log(msg); logDebug(msg)
            if (Object.keys(idx).length > 0) {
              setModsDirPersisted(mp); setNodes(toRfNodesCb(result.graph, idx))
              setNodes(nds => autoLayoutNodes(nds, result.graph.chapters))
              alert(`Loaded ${result.quest_count} quests, ${result.chapter_count} chapters, and ${Object.keys(idx).length} textures`)
              return
            }
          } catch (_) {}
        }
        alert(`Loaded ${result.quest_count} quests in ${result.chapter_count} chapters (${result.format})`)
      }
    } catch (e) { console.error('Failed to import FTB Quests:', e); alert(`Failed to load FTB Quests: ${e}`) }
  }, [projectId, projectPath, setNodes, setEdges, toRfNodesCb, textureIndex, modsDir, setModsDirPersisted])

  const exportFtbQuests = useCallback(async () => {
    if (!graph) return
    try {
      const { open } = await import('@tauri-apps/plugin-dialog')
      const selected = await open({ directory: true, multiple: false, title: 'Select export directory for FTB Quests' })
      if (!selected) return; await exportFtbQuestsToDir(projectId, selected as string)
    } catch (e) { console.error('Failed to export:', e) }
  }, [projectId, graph])

  const onConnect = useCallback((connection: Connection) => {
    setEdges((eds) => addEdge({ ...connection, type: 'smoothstep', animated: false, markerEnd: { type: MarkerType.ArrowClosed } }, eds))
    setTimeout(saveGraph, 100)
  }, [setEdges, saveGraph])

  const filteredTextures = useMemo(() => {
    const entries = Object.entries(textureIndex)
    if (!iconPickerSearch) return entries
    const q = iconPickerSearch.toLowerCase()
    return entries.filter(([id]) => id.toLowerCase().includes(q))
  }, [textureIndex, iconPickerSearch])

  useEffect(() => {
    if (Object.keys(textureIndex).length === 0 || nodes.length === 0) return
    setNodes((nds) => nds.map((n) => {
      const icon = (n.data?.icon as string) || ''
      if (!icon || n.type === 'chapter') return n
      const newUrl = icon ? (textureIndex[resolveIconKey(icon)] || '') : ''
      const currentUrl = (n.data?.iconDataUrl as string) || ''
      return newUrl !== currentUrl ? { ...n, data: { ...n.data, iconDataUrl: newUrl } } : n
    }))
  }, [textureIndex, setNodes])

  const filteredNodes = useMemo(() => {
    return nodes.filter(n => {
      if (n.type === 'chapter') return false
      if (!activeChapter) return true
      return (n.data?.chapter_id as string) === activeChapter
    })
  }, [nodes, activeChapter])

  const filteredEdges = useMemo(() => {
    if (!activeChapter) return edges
    const visibleIds = new Set(filteredNodes.map(n => n.id))
    return edges.filter(e => visibleIds.has(e.source) && visibleIds.has(e.target))
  }, [edges, filteredNodes, activeChapter])

  const chapterQuestCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    nodes.forEach(n => {
      if (n.type === 'chapter') return
      counts[(n.data?.chapter_id as string) || '_none'] = (counts[(n.data?.chapter_id as string) || '_none'] || 0) + 1
    })
    return counts
  }, [nodes])

  useEffect(() => {
    if (graph && graph.chapters.length > 0 && !activeChapter) setActiveChapter(graph.chapters[0].id)
  }, [graph, activeChapter])

  useEffect(() => { loadGraph() }, [loadGraph])

  useEffect(() => {
    if (graph && nodes.length > 0) {
      const qn = nodes.filter(n => n.type !== 'chapter')
      if (qn.length > 0 && qn.every(n => n.position.x === 0 && n.position.y === 0)) setNodes(nds => autoLayoutNodes(nds, graph.chapters))
    }
  }, [activeChapter, nodes.length, graph?.chapters, setNodes])

  return {
    graph, setGraph, nodes, setNodes, edges, setEdges, onNodesChange, onEdgesChange,
    textureIndex, setTextureIndex, modsDir, browseModsDir, setModsDirPersisted,
    saveGraph, loadGraph, autoGenerate, exportFtbQuests, onConnect,
    filteredNodes, filteredEdges, chapterQuestCounts, filteredTextures,
    importedRef, openIconPicker, iconPickerSearch, setIconPickerSearch,
    showIconPicker, setShowIconPicker, activeChapter, setActiveChapter,
    toRfNodesCb,
  }
}
