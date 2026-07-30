import { useCallback, useState, useMemo, useEffect, useRef } from 'react'
import { getQuestGraph } from './services/api'
import type { QuestGraphData, QuestChapter, QuestNodeData } from './services/api'
import { QuestCanvas } from './components/quest/QuestCanvas'
import { ChapterTree } from './components/quest/ChapterTree'
import { QuestDetailModal } from './components/quest/QuestDetailModal'
import { ImportExportToolbar } from './components/quest/import-export'
import { generateFtbHexId, defaultObjective, defaultReward, defaultQuestNodeData } from './components/quest/quest-helpers'
import type { ToolbarAPI } from './components/quest/import-export'
import { resolveIconKey, getIconUrl } from './components/quest/questIcons'
import './components/quest/editor-theme.css'

interface QuestBookEditorProps {
  projectId: string
  projectPath?: string
  wsConnected?: boolean
}

export default function QuestBookEditor({ projectId, projectPath, wsConnected: _wsConnected }: QuestBookEditorProps) {
  const [graph, setGraph] = useState<QuestGraphData | null>(null)
  const [activeChapter, setActiveChapter] = useState<string | null>(null)
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({})
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [modsDir, setModsDirState] = useState(() => localStorage.getItem('modcanvas_mods_dir') || '')
  const [textureIndex, setTextureIndex] = useState<Record<string, string>>({})
  const toolbarApiRef = useRef<ToolbarAPI | null>(null)

  const setModsDir = useCallback((dir: string) => {
    setModsDirState(dir)
    if (dir) localStorage.setItem('modcanvas_mods_dir', dir)
    else localStorage.removeItem('modcanvas_mods_dir')
  }, [])

  const onReady = useCallback((api: ToolbarAPI) => {
    toolbarApiRef.current = api
  }, [])

  useEffect(() => {
    getQuestGraph(projectId).then((data) => {
      if (data) {
        setGraph(data)
        if (data.chapters.length > 0 && !activeChapter) {
          setActiveChapter(data.chapters[0].id)
        }
      }
    }).catch((e) => console.error('Failed to load quest graph:', e))
  }, [projectId])

  const scheduleAutoSave = useCallback(() => {
    setTimeout(() => toolbarApiRef.current?.scheduleAutoSave(), 300)
  }, [])

  const onUpdateNode = useCallback((nodeId: string, data: Partial<QuestNodeData>) => {
    if (!graph) return
    setGraph({ ...graph, nodes: graph.nodes.map(n => n.id === nodeId ? { ...n, ...data } : n) })
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
      default_enabled: true, progression_mode: 'default',
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
    scheduleAutoSave()
  }, [graph, activeChapter, scheduleAutoSave])

  const onDeleteNode = useCallback((nodeId: string) => {
    if (!graph) return
    setGraph({ ...graph, nodes: graph.nodes.filter(n => n.id !== nodeId) })
    if (selectedNodeId === nodeId) setSelectedNodeId(null)
    scheduleAutoSave()
  }, [graph, selectedNodeId, scheduleAutoSave])

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

  const questCounts = useMemo(() => {
    if (!graph) return {} as Record<string, number>
    const map: Record<string, number> = {}
    for (const ch of graph.chapters) {
      map[ch.id] = graph.nodes.filter(n => n.chapter_id === ch.id).length
    }
    return map
  }, [graph])

  const selectedNode = selectedNodeId ? graph?.nodes.find(n => n.id === selectedNodeId) : null

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

  return (
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
            openIconPicker={(target) => toolbarApiRef.current?.openIconPicker(target)}
            onClose={() => setSelectedNodeId(null)}
          />
        )}
      </div>
    </div>
  )
}
