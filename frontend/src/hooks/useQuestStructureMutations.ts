import { useCallback, type Dispatch, type SetStateAction } from 'react'
import type { QuestGraphData, QuestChapter, QuestChapterGroup, QuestNodeData, ChapterImage } from '../services/quest-types'
import { generateFtbHexId, defaultQuestNodeData } from '../components/quest/quest-helpers'
import { getThemePreset, applyBookTheme } from '../core/quest/theme-presets'
import type { ProgressState } from '../core/quest/progress'

interface UseQuestStructureMutationsOptions {
  graph: QuestGraphData | null
  commitGraph: (next: QuestGraphData, opts?: { split?: boolean }) => void
  scheduleAutoSave: () => void
  activeChapter: string | null
  editChapterId: string | null
  setActiveChapter: (id: string | null) => void
  setEditChapterId: (id: string | null) => void
  setSimProgress: Dispatch<SetStateAction<ProgressState>>
}

export function useQuestStructureMutations({
  graph,
  commitGraph,
  scheduleAutoSave,
  activeChapter,
  editChapterId,
  setActiveChapter,
  setEditChapterId,
  setSimProgress,
}: UseQuestStructureMutationsOptions) {
  const onUpdateChapterImages = useCallback((chapterId: string, images: ChapterImage[]) => {
    if (!graph) return
    commitGraph({
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
    commitGraph({ ...graph, chapters: [...graph.chapters, newChapter], nodes: [...graph.nodes, chapterNode] })
    setActiveChapter(newChapter.id)
    scheduleAutoSave()
  }, [graph, scheduleAutoSave, setActiveChapter])

  const onUpdateChapter = useCallback((chapterId: string, data: Partial<QuestChapter>) => {
    if (!graph) return
    commitGraph({
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
    commitGraph({
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
  }, [graph, activeChapter, editChapterId, scheduleAutoSave, setActiveChapter, setEditChapterId])

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
    commitGraph({
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
    commitGraph({ ...graph, chapter_groups: [...graph.chapter_groups, newGroup] })
    scheduleAutoSave()
  }, [graph, scheduleAutoSave])

  const onUpdateGroup = useCallback((groupId: string, data: Partial<QuestChapterGroup>) => {
    if (!graph) return
    commitGraph({
      ...graph,
      chapter_groups: graph.chapter_groups.map(g => g.id === groupId ? { ...g, ...data } : g),
    })
    scheduleAutoSave()
  }, [graph, scheduleAutoSave])

  const onDeleteGroup = useCallback((groupId: string) => {
    if (!graph) return
    commitGraph({
      ...graph,
      chapter_groups: graph.chapter_groups.filter(g => g.id !== groupId),
      chapters: graph.chapters.map(c => c.group_id === groupId ? { ...c, group_id: null } : c),
    })
    scheduleAutoSave()
  }, [graph, scheduleAutoSave])

  const onAssignChapterToGroup = useCallback((chapterId: string, groupId: string | null) => {
    if (!graph) return
    commitGraph({
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
    commitGraph({
      ...graph,
      chapter_groups: graph.chapter_groups.map(g => ({ ...g, order_index: byId.get(g.id) ?? g.order_index })),
    })
    scheduleAutoSave()
  }, [graph, scheduleAutoSave])

  const onApplyThemePreset = useCallback((presetId: string) => {
    if (!graph) return
    const preset = presetId ? getThemePreset(presetId) : undefined
    const next = preset ? applyBookTheme(graph, preset) : {
      ...graph,
      active_theme: undefined,
      edge_color: undefined,
      edge_cycle_color: undefined,
    }
    commitGraph(next)
    scheduleAutoSave()
  }, [graph, scheduleAutoSave, commitGraph])

  const setQuestProgress = useCallback((questId: string, status: 'started' | 'complete' | null) => {
    setSimProgress(prev => {
      const next = { ...prev }
      if (status === null) delete next[questId]
      else next[questId] = status
      return next
    })
  }, [setSimProgress])

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
  }, [graph, activeChapter, setSimProgress])

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
  }, [graph, activeChapter, setSimProgress])

  return {
    onUpdateChapterImages,
    onAddChapter,
    onUpdateChapter,
    onDeleteChapter,
    onMoveChapter,
    onAddGroup,
    onUpdateGroup,
    onDeleteGroup,
    onAssignChapterToGroup,
    onMoveGroup,
    onApplyThemePreset,
    onSetQuestProgress: setQuestProgress,
    onCompleteAll: completeAllInChapter,
    onResetAll: resetAllInChapter,
  }
}
