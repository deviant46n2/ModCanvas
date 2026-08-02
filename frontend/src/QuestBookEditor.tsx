import { useCallback, useState, useMemo, useEffect, useRef } from 'react'
import { getQuestGraph } from './services/api'
import type { QuestGraphData, QuestChapter, QuestChapterGroup, QuestNodeData, QuestEdgeData, ChapterImage } from './services/api'
import { QuestCanvas } from './components/quest/QuestCanvas'
import { ChapterTree } from './components/quest/ChapterTree'
import { QuestBookSkeleton } from './components/quest/QuestBookSkeleton'
import { QuestDetailModal } from './components/quest/QuestDetailModal'
import { ChapterSettings } from './components/quest/ChapterSettings'
import { GroupSettings } from './components/quest/GroupSettings'
import { ImportExportToolbar } from './components/quest/import-export'
import { generateFtbHexId, defaultObjective, defaultReward, defaultQuestNodeData } from './components/quest/quest-helpers'
import type { ToolbarAPI } from './components/quest/import-export'
import { resolveIconKey, getIconUrl } from './components/quest/questIcons'
import { resolveAssetUrl } from './services/asset-resolver'
import type { IngestResult, ItemRegistryEntry } from './services/quest-types'
import { scanInstanceItems, scanInstanceTextures, scanInstanceAnimations, scanModJarTextures, getQuestThemeBackground } from './services/recipes'
import {
  subscribeMaterialized,
  subscribeLoadingChange,
  getMaterialized,
  requestMaterialize,
  buildTexturePathIndex,
  findTextureKeysForTarget,
  collectNeededTargets,
  isUsableTextureValue,
} from './services/texture-loader'
import { requestResolveTags } from './services/smart-filter-tags'
import { JeiDrawer } from './components/jei/JeiDrawer'
import { TextureLoadingBar } from './components/quest/TextureLoadingBar'
import { AnimationProvider } from './components/quest/animation-context'
import './components/quest/editor-theme.css'
import type { ProgressState } from './core/quest/progress'

interface QuestBookEditorProps {
  projectId: string
  projectPath?: string
  wsConnected?: boolean
  ingestResult?: IngestResult | null
  packLoaded?: boolean
}

const MIN_SKELETON_MS = 250

export default function QuestBookEditor({ projectId, projectPath, wsConnected: _wsConnected, ingestResult, packLoaded }: QuestBookEditorProps) {
  const [graph, setGraph] = useState<QuestGraphData | null>(null)
  const [activeChapter, setActiveChapter] = useState<string | null>(null)
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({})
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [editChapterId, setEditChapterId] = useState<string | null>(null)
  const [editGroupId, setEditGroupId] = useState<string | null>(null)
  const [modsDir, setModsDirState] = useState(() => localStorage.getItem('modcanvas_mods_dir') || '')
  const [textureIndex, setTextureIndex] = useState<Record<string, string>>({})
  const [animations, setAnimations] = useState<Record<string, string>>({})
  const [ingestIndex, setIngestIndex] = useState<Record<string, string>>({})
  const [textureTick, setTextureTick] = useState(0)
  const [texturesLoading, setTexturesLoading] = useState(false)
  const [texturesRemaining, setTexturesRemaining] = useState(0)
  const [questBackgroundUrl, setQuestBackgroundUrl] = useState<string | null>(null)
  const [items, setItems] = useState<ItemRegistryEntry[]>([])
  const [itemPickerTarget, setItemPickerTarget] = useState<{
    type: 'objective' | 'reward'
    id: string
    nodeId: string
  } | null>(null)
  const toolbarApiRef = useRef<ToolbarAPI | null>(null)
  const [simProgress, setSimProgress] = useState<ProgressState>({})
  const [simMode, setSimMode] = useState(false)

  const setModsDir = useCallback((dir: string) => {
    setModsDirState(dir)
    if (dir) localStorage.setItem('modcanvas_mods_dir', dir)
    else localStorage.removeItem('modcanvas_mods_dir')
  }, [])

  const onReady = useCallback((api: ToolbarAPI) => {
    toolbarApiRef.current = api
  }, [])

  useEffect(() => {
    const startedAt = Date.now()
    let cancelled = false
    let timer: number | undefined
    getQuestGraph(projectId).then((data) => {
      if (cancelled || !data) return
      const apply = () => {
        setGraph(data)
        setActiveChapter(prev => prev ?? (data.chapters.length > 0 ? data.chapters[0].id : null))
      }
      const delay = MIN_SKELETON_MS - (Date.now() - startedAt)
      if (delay > 0) {
        timer = window.setTimeout(apply, delay)
      } else {
        apply()
      }
    }).catch((e) => console.error('Failed to load quest graph:', e))
    return () => {
      cancelled = true
      if (timer !== undefined) window.clearTimeout(timer)
    }
  }, [projectId, packLoaded])

  useEffect(() => {
    if (ingestResult?.asset_registry?.by_id) {
      setIngestIndex(ingestResult.asset_registry.by_id)
      setTextureIndex(prev => ({ ...prev, ...ingestResult.asset_registry.by_id }))
    }
    if (ingestResult?.active_instance) {
      scanInstanceItems(ingestResult.active_instance).then((registry) => {
        setItems(registry);
      }).catch((e) => console.error('[QuestBookEditor] Failed to scan instance items:', e));
    }
  }, [ingestResult])

  useEffect(() => {
    const instancePath = ingestResult?.active_instance || projectPath || ''
    let cancelled = false
    if (instancePath) {
      scanInstanceTextures(instancePath).then((idx) => {
        if (cancelled || !idx || Object.keys(idx).length === 0) return
        setTextureIndex(prev => ({ ...prev, ...idx }))
      }).catch(() => {})
      scanInstanceAnimations(instancePath).then((map) => {
        if (cancelled || !map || Object.keys(map).length === 0) return
        setAnimations(prev => ({ ...prev, ...map }))
      }).catch(() => {})
    } else if (modsDir) {
      scanModJarTextures(modsDir).then((idx) => {
        if (cancelled || !idx || Object.keys(idx).length === 0) return
        setTextureIndex(prev => ({ ...prev, ...idx }))
      }).catch(() => {})
    }
    return () => { cancelled = true }
  }, [ingestResult, projectPath, modsDir])

  useEffect(() => {
    return subscribeMaterialized((added) => {
      if (added.length > 0) setTextureTick(t => t + 1)
    })
  }, [])

  useEffect(() => {
    return subscribeLoadingChange((isLoading, remaining) => {
      setTexturesLoading(isLoading)
      setTexturesRemaining(remaining)
    })
  }, [])

  useEffect(() => {
    const instancePath = ingestResult?.active_instance || projectPath || ''
    if (!instancePath || !activeChapter) {
      setQuestBackgroundUrl(null)
      return
    }
    let cancelled = false
    getQuestThemeBackground(instancePath, activeChapter)
      .then((bgKey) => {
        if (cancelled || !bgKey) return
        const url =
          resolveAssetUrl(bgKey, textureIndex) || getMaterialized(resolveIconKey(bgKey))
        if (url) {
          setQuestBackgroundUrl(prev => (prev === url ? prev : url))
        } else {
          requestMaterialize([resolveIconKey(bgKey)], instancePath)
        }
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [activeChapter, textureIndex, textureTick, ingestResult?.active_instance, projectPath])

  const scheduleAutoSave = useCallback(() => {
    setTimeout(() => toolbarApiRef.current?.scheduleAutoSave(), 300)
  }, [])

  const onUpdateNode = useCallback((nodeId: string, data: Partial<QuestNodeData>) => {
    if (!graph) return
    setGraph({ ...graph, nodes: graph.nodes.map(n => n.id === nodeId ? { ...n, ...data } : n) })
    scheduleAutoSave()
  }, [graph, scheduleAutoSave])

  const onUpdateNodes = useCallback((updates: Array<{ nodeId: string; data: Partial<QuestNodeData> }>) => {
    if (!graph) return
    const byId = new Map(updates.map(u => [u.nodeId, u.data]))
    setGraph({
      ...graph,
      nodes: graph.nodes.map(n => (byId.has(n.id) ? { ...n, ...byId.get(n.id) } : n)),
    })
    scheduleAutoSave()
  }, [graph, scheduleAutoSave])

  const onUpdateChapterImages = useCallback((chapterId: string, images: ChapterImage[]) => {
    if (!graph) return
    setGraph({
      ...graph,
      chapters: graph.chapters.map(c => c.id === chapterId ? { ...c, images } : c),
    })
    scheduleAutoSave()
  }, [graph, scheduleAutoSave])

  const onAddChapter = useCallback(() => {
    if (!graph) return
    const newId = generateFtbHexId()
    const newChapter: QuestChapter = {
      id: newId, title: 'New Chapter', description: '', icon: '',
      background_image: '', order_index: graph.chapters.length,
      hide_until_first_quest_complete: false,
      default_quest_size: { width: 24, height: 24 },
      quest_color: '', group_id: null, default_quest_shape: 'default',
      default_enabled: true, progression_mode: 'default', images: [],
      subtitle: '', default_min_width: 0, always_invisible: false,
      default_hide_dependency_lines: false,
      hide_quest_details_until_startable: false,
      hide_quest_until_deps_visible: false,
      hide_quest_until_deps_complete: false,
      hide_text_until_complete: false,
      autofocus_id: '', default_repeatable: false,
      require_sequential_tasks: false,
    }
    const chapterNode = defaultQuestNodeData({
      id: newId, node_type: 'chapter', label: 'New Chapter', chapter_id: null,
    })
    setGraph({ ...graph, chapters: [...graph.chapters, newChapter], nodes: [...graph.nodes, chapterNode] })
    setActiveChapter(newChapter.id)
    scheduleAutoSave()
  }, [graph, scheduleAutoSave])

  const onAddQuest = useCallback(() => {
    if (!graph || !activeChapter) return
    const newNode = defaultQuestNodeData({ chapter_id: activeChapter, label: 'New Quest' })
    setGraph({ ...graph, nodes: [...graph.nodes, newNode] })
    setSelectedNodeId(newNode.id)
    scheduleAutoSave()
  }, [graph, activeChapter, scheduleAutoSave])

  const onAddQuestLink = useCallback(() => {
    if (!graph || !activeChapter) return
    const newNode = defaultQuestNodeData({
      chapter_id: activeChapter,
      node_type: 'quest_link',
      label: 'New Link',
      link_target: graph.nodes.find((n: QuestNodeData) => n.node_type === 'quest')?.id || '',
    })
    setGraph({ ...graph, nodes: [...graph.nodes, newNode] })
    setSelectedNodeId(newNode.id)
    scheduleAutoSave()
  }, [graph, activeChapter, scheduleAutoSave])

  const onUpdateChapter = useCallback((chapterId: string, data: Partial<QuestChapter>) => {
    if (!graph) return
    setGraph({
      ...graph,
      chapters: graph.chapters.map(c => c.id === chapterId ? { ...c, ...data } : c),
      nodes: graph.nodes.map(n =>
        n.node_type === 'chapter' && n.id === chapterId && data.title !== undefined
          ? { ...n, label: data.title }
          : n
      ),
    })
    scheduleAutoSave()
  }, [graph, scheduleAutoSave])

  const onDeleteChapter = useCallback((chapterId: string) => {
    if (!graph) return
    setGraph({
      ...graph,
      chapters: graph.chapters.filter(c => c.id !== chapterId),
      nodes: graph.nodes.filter(n => n.id !== chapterId && n.chapter_id !== chapterId),
      edges: graph.edges.filter(e => e.source !== chapterId && e.target !== chapterId),
    })
    if (activeChapter === chapterId) {
      const next = graph.chapters.find(c => c.id !== chapterId)
      setActiveChapter(next ? next.id : null)
    }
    if (editChapterId === chapterId) setEditChapterId(null)
    scheduleAutoSave()
  }, [graph, activeChapter, editChapterId, scheduleAutoSave])

  const onMoveChapter = useCallback((chapterId: string, dir: -1 | 1) => {
    if (!graph) return
    const sorted = [...graph.chapters].sort((a, b) => (a.order_index || 0) - (b.order_index || 0))
    const idx = sorted.findIndex(c => c.id === chapterId)
    if (idx < 0) return
    const target = idx + dir
    if (target < 0 || target >= sorted.length) return
    const swapped = [...sorted]
    const tmp = swapped[idx]
    swapped[idx] = swapped[target]
    swapped[target] = tmp
    const byId = new Map(swapped.map((c, i) => [c.id, i]))
    setGraph({
      ...graph,
      chapters: graph.chapters.map(c => ({ ...c, order_index: byId.get(c.id) ?? c.order_index })),
    })
    scheduleAutoSave()
  }, [graph, scheduleAutoSave])

  const onAddGroup = useCallback(() => {
    if (!graph) return
    const newGroup = {
      id: generateFtbHexId(),
      title: 'New Group',
      description: '',
      icon: '',
      order_index: graph.chapter_groups.length,
    }
    setGraph({ ...graph, chapter_groups: [...graph.chapter_groups, newGroup] })
    scheduleAutoSave()
  }, [graph, scheduleAutoSave])

  const onUpdateGroup = useCallback((groupId: string, data: Partial<QuestChapterGroup>) => {
    if (!graph) return
    setGraph({
      ...graph,
      chapter_groups: graph.chapter_groups.map(g => g.id === groupId ? { ...g, ...data } : g),
    })
    scheduleAutoSave()
  }, [graph, scheduleAutoSave])

  const onDeleteGroup = useCallback((groupId: string) => {
    if (!graph) return
    setGraph({
      ...graph,
      chapter_groups: graph.chapter_groups.filter(g => g.id !== groupId),
      chapters: graph.chapters.map(c => c.group_id === groupId ? { ...c, group_id: null } : c),
    })
    scheduleAutoSave()
  }, [graph, scheduleAutoSave])

  const onAssignChapterToGroup = useCallback((chapterId: string, groupId: string | null) => {
    if (!graph) return
    setGraph({
      ...graph,
      chapters: graph.chapters.map(c => c.id === chapterId ? { ...c, group_id: groupId } : c),
    })
    scheduleAutoSave()
  }, [graph, scheduleAutoSave])

  const onMoveGroup = useCallback((groupId: string, dir: -1 | 1) => {
    if (!graph) return
    const sorted = [...graph.chapter_groups].sort((a, b) => (a.order_index || 0) - (b.order_index || 0))
    const idx = sorted.findIndex(g => g.id === groupId)
    if (idx < 0) return
    const target = idx + dir
    if (target < 0 || target >= sorted.length) return
    const swapped = [...sorted]
    const tmp = swapped[idx]
    swapped[idx] = swapped[target]
    swapped[target] = tmp
    const byId = new Map(swapped.map((g, i) => [g.id, i]))
    setGraph({
      ...graph,
      chapter_groups: graph.chapter_groups.map(g => ({ ...g, order_index: byId.get(g.id) ?? g.order_index })),
    })
    scheduleAutoSave()
  }, [graph, scheduleAutoSave])

  const onDeleteNode = useCallback((nodeId: string) => {
    if (!graph) return
    setGraph({ ...graph, nodes: graph.nodes.filter(n => n.id !== nodeId) })
    if (selectedNodeId === nodeId) setSelectedNodeId(null)
    scheduleAutoSave()
  }, [graph, selectedNodeId, scheduleAutoSave])

  const onDeleteNodes = useCallback((nodeIds: string[]) => {
    if (!graph || nodeIds.length === 0) return
    const dead = new Set(nodeIds)
    setGraph({
      ...graph,
      nodes: graph.nodes.filter(n => !dead.has(n.id)),
      edges: graph.edges.filter(e => !dead.has(e.source) && !dead.has(e.target)),
    })
    if (selectedNodeId && dead.has(selectedNodeId)) setSelectedNodeId(null)
    scheduleAutoSave()
  }, [graph, selectedNodeId, scheduleAutoSave])

  const onPasteNodes = useCallback((newNodes: QuestNodeData[], newEdges: QuestEdgeData[]) => {
    if (!graph || newNodes.length === 0) return
    setGraph({
      ...graph,
      nodes: [...graph.nodes, ...newNodes],
      edges: [...graph.edges, ...newEdges],
    })
    scheduleAutoSave()
  }, [graph, scheduleAutoSave])

  // Progress simulation — ephemeral editor state, never serialized to disk.
  // Lets users preview FTB's in-game progression: complete/reset a quest or the
  // whole chapter instantly, and see which quests are currently visible/locked.
  const setQuestProgress = useCallback((questId: string, status: 'started' | 'complete' | null) => {
    setSimProgress(prev => {
      const next = { ...prev }
      if (status === null) delete next[questId]
      else next[questId] = status
      return next
    })
  }, [])

  const completeAllInChapter = useCallback(() => {
    if (!graph) return
    const questIds = graph.nodes
      .filter((n: QuestNodeData) => n.node_type === 'quest' && n.chapter_id === activeChapter)
      .map((n: QuestNodeData) => n.id)
    setSimProgress(prev => {
      const next = { ...prev }
      for (const id of questIds) next[id] = 'complete'
      return next
    })
  }, [graph, activeChapter])

  const resetAllInChapter = useCallback(() => {
    if (!graph) return
    const questIds = new Set(
      graph.nodes
        .filter((n: QuestNodeData) => n.node_type === 'quest' && n.chapter_id === activeChapter)
        .map((n: QuestNodeData) => n.id)
    )
    setSimProgress(prev => {
      const next = { ...prev }
      for (const id of questIds) delete next[id]
      return next
    })
  }, [graph, activeChapter])

  const onAddEdge = useCallback((edge: { source: string; target: string }) => {
    if (!graph) return
    if (!edge.source || !edge.target || edge.source === edge.target) return
    const exists = graph.edges.some(e => e.source === edge.source && e.target === edge.target)
    if (exists) return
    const newEdge: QuestEdgeData = {
      id: generateFtbHexId(),
      source: edge.source,
      target: edge.target,
      label: null,
      edge_type: 'prerequisite',
      inverted: false,
    }
    setGraph({ ...graph, edges: [...graph.edges, newEdge] })
    scheduleAutoSave()
  }, [graph, scheduleAutoSave])

  const onUpdateEdge = useCallback((edgeId: string, data: { source?: string; target?: string }) => {
    if (!graph) return
    const source = data.source ?? ''
    const target = data.target ?? ''
    if (!source || !target || source === target) return
    const duplicate = graph.edges.some(e =>
      e.id !== edgeId && e.source === source && e.target === target
    )
    if (duplicate) return
    setGraph({
      ...graph,
      edges: graph.edges.map(e => e.id === edgeId ? { ...e, ...data } : e),
    })
    scheduleAutoSave()
  }, [graph, scheduleAutoSave])

  const onDeleteEdge = useCallback((edgeId: string) => {
    if (!graph) return
    setGraph({ ...graph, edges: graph.edges.filter(e => e.id !== edgeId) })
    scheduleAutoSave()
  }, [graph, scheduleAutoSave])

  const onAddObjective = useCallback((nodeId: string) => {
    if (!graph) return
    setGraph({ ...graph, nodes: graph.nodes.map(n =>
      n.id === nodeId ? { ...n, objectives: [...(n.objectives || []), defaultObjective()] } : n
    )})
    scheduleAutoSave()
  }, [graph, scheduleAutoSave])

  const onAddReward = useCallback((nodeId: string) => {
    if (!graph) return
    setGraph({ ...graph, nodes: graph.nodes.map(n =>
      n.id === nodeId ? { ...n, rewards: [...(n.rewards || []), defaultReward()] } : n
    )})
    scheduleAutoSave()
  }, [graph, scheduleAutoSave])

  const onRemoveObjective = useCallback((nodeId: string, objectiveId: string) => {
    if (!graph) return
    setGraph({ ...graph, nodes: graph.nodes.map(n =>
      n.id === nodeId ? { ...n, objectives: (n.objectives || []).filter(o => o.id !== objectiveId) } : n
    )})
    scheduleAutoSave()
  }, [graph, scheduleAutoSave])

  const onRemoveReward = useCallback((nodeId: string, rewardId: string) => {
    if (!graph) return
    setGraph({ ...graph, nodes: graph.nodes.map(n =>
      n.id === nodeId ? { ...n, rewards: (n.rewards || []).filter(r => r.id !== rewardId) } : n
    )})
    scheduleAutoSave()
  }, [graph, scheduleAutoSave])

  const onUpdateObjective = useCallback((nodeId: string, objectiveId: string, field: string, value: unknown) => {
    if (!graph) return
    setGraph({ ...graph, nodes: graph.nodes.map(n =>
      n.id === nodeId ? { ...n, objectives: (n.objectives || []).map(o =>
        o.id === objectiveId ? { ...o, [field]: value } : o
      )} : n
    )})
    scheduleAutoSave()
  }, [graph, scheduleAutoSave])

  const onUpdateReward = useCallback((nodeId: string, rewardId: string, field: string, value: unknown) => {
    if (!graph) return
    setGraph({ ...graph, nodes: graph.nodes.map(n =>
      n.id === nodeId ? { ...n, rewards: (n.rewards || []).map(r =>
        r.id === rewardId ? { ...r, [field]: value } : r
      )} : n
    )})
    scheduleAutoSave()
  }, [graph, scheduleAutoSave])

  const handleToggleGroup = useCallback((id: string) => {
    setCollapsedGroups(prev => ({ ...prev, [id]: !prev[id] }))
  }, [])

  const chapterIcons = useMemo(() => {
    if (!graph) return {} as Record<string, string | undefined>
    const map: Record<string, string | undefined> = {}
    for (const ch of graph.chapters) {
      const key = resolveIconKey(ch.icon)
      map[ch.id] = key ? getIconUrl(textureIndex, key) : undefined
    }
    return map
  }, [graph, textureIndex])

  const chapterIconKeys = useMemo(() => {
    if (!graph) return {} as Record<string, string | undefined>
    const map: Record<string, string | undefined> = {}
    for (const ch of graph.chapters) {
      const key = resolveIconKey(ch.icon)
      if (key) map[ch.id] = key
    }
    return map
  }, [graph])

  const questCounts = useMemo(() => {
    if (!graph) return {} as Record<string, number>
    const map: Record<string, number> = {}
    for (const ch of graph.chapters) {
      map[ch.id] = graph.nodes.filter(n => n.chapter_id === ch.id).length
    }
    return map
  }, [graph])

  const selectedNode = selectedNodeId ? graph?.nodes.find(n => n.id === selectedNodeId) : null
  const editChapter = editChapterId ? graph?.chapters.find(c => c.id === editChapterId) : null
  const editGroup = editGroupId ? graph?.chapter_groups.find(g => g.id === editGroupId) : null

  const ingestPathIndex = useMemo(() => buildTexturePathIndex(Object.keys(ingestIndex)), [ingestIndex])
  const scanPathIndex = useMemo(() => buildTexturePathIndex(Object.keys(textureIndex)), [textureIndex])

  useEffect(() => {
    if (!graph) return
    const instancePath = ingestResult?.active_instance || projectPath || ''
    if (!instancePath) return
    const targets = collectNeededTargets(graph, activeChapter, selectedNode)
    const toFetch = new Set<string>()
    const inject: Record<string, string> = {}
    for (const target of targets) {
      const canonical = resolveIconKey(target)
      if (!canonical) continue
      const keys = new Set(findTextureKeysForTarget(scanPathIndex, canonical))
      for (const k of findTextureKeysForTarget(ingestPathIndex, canonical)) keys.add(k)
      for (const key of keys) {
        if (isUsableTextureValue(textureIndex[key])) continue
        const url = getMaterialized(key)
        if (url) inject[key] = url
        else toFetch.add(key)
      }
    }
    if (Object.keys(inject).length > 0) {
      setTextureIndex(prev => ({ ...prev, ...inject }))
    }
    if (toFetch.size > 0) {
      requestMaterialize([...toFetch], instancePath)
    }
    // Expand smart filter item tags (e.g. `#forge:ingots/iron`) into item ids
    // and materialize their textures so SmartFilterIcon can cycle them.
    const tags = targets.filter(t => t.startsWith('#')).map(t => t.slice(1))
    if (tags.length > 0) {
      requestResolveTags(tags, instancePath)
    }
  }, [graph, activeChapter, selectedNode, textureIndex, textureTick, ingestIndex, ingestPathIndex, scanPathIndex, ingestResult?.active_instance, projectPath])

  if (!graph) {
    return <QuestBookSkeleton />
  }

  return (
    <AnimationProvider animations={animations}>
      <div className="quest-editor">
        <ImportExportToolbar
        graph={graph}
        setGraph={setGraph}
        projectId={projectId}
        projectPath={projectPath}
        textureIndex={textureIndex}
        setTextureIndex={setTextureIndex}
        modsDir={modsDir}
        setModsDir={setModsDir}
        onReady={onReady}
      />
      <div className="quest-editor-body">
        <aside className="quest-editor-chapters" role="navigation" aria-label="Chapters">
          <ChapterTree
            chapters={graph.chapters}
            chapterGroups={graph.chapter_groups || []}
            activeChapter={activeChapter}
            questCounts={questCounts}
            chapterIcons={chapterIcons}
            chapterIconKeys={chapterIconKeys}
            collapsedGroups={collapsedGroups}
            onSelectChapter={setActiveChapter}
            onToggleGroup={handleToggleGroup}
            onAddChapter={onAddChapter}
            onEditChapter={setEditChapterId}
            onAddGroup={onAddGroup}
            onEditGroup={setEditGroupId}
          />
        </aside>
        <main className="quest-editor-canvas">
          <QuestCanvas
            questGraph={graph}
            chapters={graph.chapters}
            activeChapter={activeChapter}
            textureIndex={textureIndex}
            onUpdateNode={onUpdateNode}
            onUpdateNodes={onUpdateNodes}
            onAddEdge={onAddEdge}
            onUpdateEdge={onUpdateEdge}
            onDeleteNode={onDeleteNode}
            onDeleteNodes={onDeleteNodes}
            onPasteNodes={onPasteNodes}
            onDeleteEdge={onDeleteEdge}
            onAddNode={onAddQuest}
            onAddLink={onAddQuestLink}
            onUpdateChapterImages={onUpdateChapterImages}
            selectedNodeId={selectedNodeId}
            setSelectedNodeId={setSelectedNodeId}
            questBackgroundUrl={questBackgroundUrl}
            simMode={simMode}
            setSimMode={setSimMode}
            simProgress={simProgress}
            onSetQuestProgress={setQuestProgress}
            onCompleteAll={completeAllInChapter}
            onResetAll={resetAllInChapter}
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
            openIconPicker={(target) => toolbarApiRef.current?.openIconPicker(target)}
            onOpenItemPicker={(target) => setItemPickerTarget(target)}
            onClose={() => setSelectedNodeId(null)}
            simProgress={simProgress}
            onSetQuestProgress={setQuestProgress}
            quests={graph.nodes
              .filter((n: QuestNodeData) => n.node_type === 'quest' || n.node_type === 'side_quest')
              .map((n: QuestNodeData) => ({ id: n.id, label: n.label || n.id }))}
          />
        )}
        {itemPickerTarget && (
          <JeiDrawer
            items={items}
            onSelect={(itemId) => {
              const t = itemPickerTarget
              if (t.type === 'objective') {
                onUpdateObjective(t.nodeId, t.id, 'target', itemId)
              } else {
                onUpdateReward(t.nodeId, t.id, 'item_id', itemId)
              }
              setItemPickerTarget(null)
            }}
            onClose={() => setItemPickerTarget(null)}
          />
        )}
        {editChapter && (
          <ChapterSettings
            open
            chapter={editChapter}
            groups={graph.chapter_groups}
            textureIndex={textureIndex}
            onUpdate={(data) => onUpdateChapter(editChapter.id, data)}
            onDelete={() => onDeleteChapter(editChapter.id)}
            onMove={(dir) => onMoveChapter(editChapter.id, dir)}
            onPickIcon={() => toolbarApiRef.current?.openIconPicker({ type: 'chapter', nodeId: editChapter.id })}
            onMoveToGroup={(groupId) => onAssignChapterToGroup(editChapter.id, groupId)}
            onClose={() => setEditChapterId(null)}
          />
        )}
        {editGroup && (
          <GroupSettings
            open
            group={editGroup}
            chapters={graph.chapters}
            onUpdate={(data) => onUpdateGroup(editGroup.id, data)}
            onDelete={() => onDeleteGroup(editGroup.id)}
            onMove={(dir) => onMoveGroup(editGroup.id, dir)}
            onMoveChapter={(chapterId, groupId) => onAssignChapterToGroup(chapterId, groupId)}
            onClose={() => setEditGroupId(null)}
          />
        )}
      </div>
      {texturesLoading && <TextureLoadingBar remaining={texturesRemaining} />}
      </div>
    </AnimationProvider>
  )
}
