import { useState, useMemo, useCallback } from 'react'
import type { Node, Edge } from '@xyflow/react'
import type { QuestGraphData, QuestObjectiveData, QuestRewardData, QuestAnalysis, QuestChapterGroup } from '../services/api'
import { defaultObjective, defaultReward } from '../components/quest/nodes'
import { saveQuestGraph } from '../services/api'


interface UIContext {
  graph: QuestGraphData | null; setGraph: (g: QuestGraphData | null) => void
  nodes: Node[]; setNodes: React.Dispatch<React.SetStateAction<Node[]>>
  edges: Edge[]; setEdges: React.Dispatch<React.SetStateAction<Edge[]>>
  saveGraph: () => Promise<void>
  textureIndex: Record<string, string>
  toRfNodesCb: (g: QuestGraphData, ti: Record<string, string>) => Node[]
  projectId: string
  activeChapter: string | null
  setActiveChapter: (id: string | null) => void
}

export function useGraphUI(ctx: UIContext) {
  const { graph, setGraph, nodes, setNodes, saveGraph, projectId, setActiveChapter} = ctx

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [inspectorTab, setInspectorTab] = useState<'general' | 'objectives' | 'rewards' | 'advanced'>('general')
  const [showGroups, setShowGroups] = useState(false)
  const [editGroups, setEditGroups] = useState<QuestChapterGroup[]>([])
  const [showBookSettings, setShowBookSettings] = useState(false)
  const [editBookProgressionMode, setEditBookProgressionMode] = useState('Default')
  const [editBookIcon, setEditBookIcon] = useState('')
  const [editBookBgImage, setEditBookBgImage] = useState('')
  const [editQuestColor, setEditQuestColor] = useState('')
  const [editDefaultQuestWidth, setEditDefaultQuestWidth] = useState(24)
  const [editDefaultQuestHeight, setEditDefaultQuestHeight] = useState(24)
  const [editDefaultQuestShape, setEditDefaultQuestShape] = useState('Default')
  const [analysis, setAnalysis] = useState<QuestAnalysis | null>(null)
  const [showAnalysis, setShowAnalysis] = useState(false)

  const [editLabel, setEditLabel] = useState('')
  const [editDesc, setEditDesc] = useState('')
  const [editSubtitle, setEditSubtitle] = useState('')
  const [editColor, setEditColor] = useState('')
  const [editVisibility, setEditVisibility] = useState('Normal')
  const [editOptional, setEditOptional] = useState(false)
  const [editRepeatable, setEditRepeatable] = useState(false)
  const [editSilentComplete, setEditSilentComplete] = useState(false)
  const [editRepeatTime, setEditRepeatTime] = useState(0)
  const [editRepeatMinDelay, setEditRepeatMinDelay] = useState(0)
  const [editRepeatMaxDelay, setEditRepeatMaxDelay] = useState(0)
  const [editIcon, setEditIcon] = useState('')
  const [editHideDeps, setEditHideDeps] = useState(false)
  const [editHideQuest, setEditHideQuest] = useState(false)
  const [editHideAll, setEditHideAll] = useState(false)
  const [editDisableReward, setEditDisableReward] = useState(false)
  const [editPauseReward, setEditPauseReward] = useState(false)
  const [editShape, setEditShape] = useState('Default')
  const [editIconScaling, setEditIconScaling] = useState(1.0)
  const [editTags, setEditTags] = useState('')
  const [editProgressionMode, setEditProgressionMode] = useState('Default')
  const [editSequentialTasks, setEditSequentialTasks] = useState(false)
  const [editDisableToast, setEditDisableToast] = useState(false)
  const [editIgnoreRewardBlocking, setEditIgnoreRewardBlocking] = useState(false)
  const [editDisableJei, setEditDisableJei] = useState(false)
  const [editHideDetailsUntilStartable, setEditHideDetailsUntilStartable] = useState(false)
  const [editHideTextUntilCompleted, setEditHideTextUntilCompleted] = useState(false)
  const [editInvisibleUntilCompleted, setEditInvisibleUntilCompleted] = useState(false)
  const [editInvisibleUntilXTasks, setEditInvisibleUntilXTasks] = useState(0)
  const [editHideDepLines, setEditHideDepLines] = useState(false)
  const [editHideDeptLines, setEditHideDeptLines] = useState(false)
  const [editMinReqDeps, setEditMinReqDeps] = useState(0)
  const [editDepRequirement, setEditDepRequirement] = useState('AllCompleted')

  const selectNode = useCallback((node: Node) => {
    setSelectedNodeId(node.id)
    setEditLabel((node.data?.label as string) || '')
    setEditDesc((node.data?.description as string) || '')
    setEditSubtitle((node.data?.subtitle as string) || '')
    setEditColor((node.data?.color as string) || '')
    setEditVisibility((node.data?.visibility as string) || 'Normal')
    setEditOptional((node.data?.optional as boolean) || false)
    setEditRepeatable((node.data?.can_be_repeatable as boolean) || false)
    setEditSilentComplete((node.data?.silently_complete as boolean) || false)
    setEditRepeatTime((node.data?.repeat_time as number) || 0)
    setEditRepeatMinDelay((node.data?.repeat_min_delay as number) || 0)
    setEditRepeatMaxDelay((node.data?.repeat_max_delay as number) || 0)
    setEditIcon((node.data?.icon as string) || '')
    setEditHideDeps((node.data?.hide_quest_until_deps_complete as boolean) || false)
    setEditHideQuest((node.data?.hide_quest_until_quest_complete as boolean) || false)
    setEditHideAll((node.data?.hide_quest_until_all_complete as boolean) || false)
    setEditDisableReward((node.data?.disable_reward as boolean) || false)
    setEditPauseReward((node.data?.pause_reward as boolean) || false)
    setEditShape((node.data?.shape as string) || 'Default')
    setEditIconScaling((node.data?.icon_scaling as number) || 1.0)
    setEditTags(((node.data?.tags as string[]) || []).join(', '))
    setEditProgressionMode((node.data?.progression_mode as string) || 'Default')
    setEditSequentialTasks((node.data?.sequential_tasks as boolean) || false)
    setEditDisableToast((node.data?.disable_completion_toast as boolean) || false)
    setEditIgnoreRewardBlocking((node.data?.ignore_reward_blocking as boolean) || false)
    setEditDisableJei((node.data?.disable_jei_recipe as boolean) || false)
    setEditHideDetailsUntilStartable((node.data?.hide_details_until_startable as boolean) || false)
    setEditHideTextUntilCompleted((node.data?.hide_text_until_completed as boolean) || false)
    setEditInvisibleUntilCompleted((node.data?.invisible_until_completed as boolean) || false)
    setEditInvisibleUntilXTasks((node.data?.invisible_until_x_tasks as number) || 0)
    setEditHideDepLines((node.data?.hide_dependency_lines as boolean) || false)
    setEditHideDeptLines((node.data?.hide_dependent_lines as boolean) || false)
    setEditMinReqDeps((node.data?.min_required_dependencies as number) || 0)
    setEditDepRequirement((node.data?.dependency_requirement as string) || 'AllCompleted')
    setInspectorTab('general')
  }, [])

  const deselectNode = useCallback(() => setSelectedNodeId(null), [])

  const liveSaveField = useCallback((field: string, value: unknown) => {
    if (!selectedNodeId) return
    setNodes((nds) => nds.map((n) => n.id === selectedNodeId ? { ...n, data: { ...n.data, [field]: value } } : n))
    setTimeout(saveGraph, 300)
  }, [selectedNodeId, setNodes, saveGraph])

  const liveSaveObjectives = useCallback((objectives: QuestObjectiveData[]) => {
    if (!selectedNodeId) return
    setNodes((nds) => nds.map((n) => n.id === selectedNodeId ? { ...n, data: { ...n.data, objectives } } : n))
    setTimeout(saveGraph, 300)
  }, [selectedNodeId, setNodes, saveGraph])

  const liveSaveRewards = useCallback((rewards: QuestRewardData[]) => {
    if (!selectedNodeId) return
    setNodes((nds) => nds.map((n) => n.id === selectedNodeId ? { ...n, data: { ...n.data, rewards } } : n))
    setTimeout(saveGraph, 300)
  }, [selectedNodeId, setNodes, saveGraph])

  const inspectorObjectives = useMemo(() => {
    const sel = nodes.find(n => n.id === selectedNodeId)
    return (sel?.data?.objectives as QuestObjectiveData[]) || []
  }, [selectedNodeId, nodes])

  const inspectorRewards = useMemo(() => {
    const sel = nodes.find(n => n.id === selectedNodeId)
    return (sel?.data?.rewards as QuestRewardData[]) || []
  }, [selectedNodeId, nodes])

  const selectedNode = useMemo(() => selectedNodeId ? nodes.find(n => n.id === selectedNodeId) || null : null, [selectedNodeId, nodes])
  const selectedNodeType = selectedNode ? ((selectedNode.data?.nodeType as string) || 'quest') : 'quest'
  const selectedLabel = selectedNode ? ((selectedNode.data?.label as string) || 'Node') : ''
  const selectedIconDataUrl = selectedNode ? ((selectedNode.data?.iconDataUrl as string) || '') : ''
  const isQuestSelected = selectedNodeType === 'quest' || selectedNodeType === 'side_quest'
  const selectedFallbackIcon = selectedNodeType === 'chapter' ? '\u{1F4D6}' : selectedNodeType === 'gate' ? '\u{1F512}' : selectedNodeType === 'reward' ? '\u{1F381}' : selectedNodeType === 'side_quest' ? '\u{1F4CB}' : '\u{1F4DC}'

  const updateInspectorObjective = useCallback((objIndex: number, field: string, value: unknown) => {
    if (!selectedNodeId) return
    const objectives = [...inspectorObjectives]
    objectives[objIndex] = { ...objectives[objIndex], [field]: value }
    liveSaveObjectives(objectives)
  }, [selectedNodeId, inspectorObjectives, liveSaveObjectives])

  const addInspectorObjective = useCallback(() => {
    if (!selectedNodeId) return; liveSaveObjectives([...inspectorObjectives, defaultObjective()])
  }, [selectedNodeId, inspectorObjectives, liveSaveObjectives])

  const removeInspectorObjective = useCallback((objIndex: number) => {
    if (!selectedNodeId) return; liveSaveObjectives(inspectorObjectives.filter((_, i) => i !== objIndex))
  }, [selectedNodeId, inspectorObjectives, liveSaveObjectives])

  const updateInspectorReward = useCallback((rewIndex: number, field: string, value: unknown) => {
    if (!selectedNodeId) return
    const rewards = [...inspectorRewards]
    rewards[rewIndex] = { ...rewards[rewIndex], [field]: value }
    liveSaveRewards(rewards)
  }, [selectedNodeId, inspectorRewards, liveSaveRewards])

  const addInspectorReward = useCallback(() => {
    if (!selectedNodeId) return; liveSaveRewards([...inspectorRewards, defaultReward()])
  }, [selectedNodeId, inspectorRewards, liveSaveRewards])

  const removeInspectorReward = useCallback((rewIndex: number) => {
    if (!selectedNodeId) return; liveSaveRewards(inspectorRewards.filter((_, i) => i !== rewIndex))
  }, [selectedNodeId, inspectorRewards, liveSaveRewards])

  const loadAnalysis = useCallback(async () => {
    try {
      const { analyzeQuestGraph } = await import('../services/api')
      setAnalysis(await analyzeQuestGraph(projectId)); setShowAnalysis(true)
    } catch (e) { console.error('Failed to load analysis:', e) }
  }, [projectId])

  const openBookSettings = useCallback(() => {
    if (!graph) return
    setEditBookProgressionMode(graph.book_progression_mode || 'Default')
    setEditBookIcon(graph.book_icon || '')
    setEditBookBgImage(graph.book_background_image || '')
    setEditQuestColor(graph.quest_color || '')
    setEditDefaultQuestWidth(graph.default_quest_size?.width || 24)
    setEditDefaultQuestHeight(graph.default_quest_size?.height || 24)
    setEditDefaultQuestShape(graph.default_quest_shape || 'Default')
    setShowBookSettings(true)
  }, [graph])

  const saveBookSettings = useCallback(async () => {
    if (!graph) return
    const updatedGraph: QuestGraphData = {
      ...graph,
      book_progression_mode: editBookProgressionMode,
      book_icon: editBookIcon,
      book_background_image: editBookBgImage,
      quest_color: editQuestColor,
      default_quest_size: { width: editDefaultQuestWidth, height: editDefaultQuestHeight },
      default_quest_shape: editDefaultQuestShape,
    }
    try {
      await saveQuestGraph(projectId, updatedGraph); setGraph(updatedGraph); setShowBookSettings(false)
    } catch (e) { console.error('Failed to save book settings:', e) }
  }, [graph, editBookProgressionMode, editBookIcon, editBookBgImage, editQuestColor, editDefaultQuestWidth, editDefaultQuestHeight, editDefaultQuestShape, projectId])

  const saveGroups = useCallback(async () => {
    if (!graph) return
    const updatedGraph: QuestGraphData = { ...graph, chapter_groups: editGroups }
    try {
      await saveQuestGraph(projectId, updatedGraph); setGraph(updatedGraph); setShowGroups(false)
    } catch (e) { console.error('Failed to save groups:', e) }
  }, [graph, editGroups, projectId])

  const openGroups = useCallback(() => {
    setEditGroups(graph?.chapter_groups ? [...graph.chapter_groups] : [])
    setShowGroups(true)
  }, [graph])

  const addChapter = useCallback(async () => {
    if (!graph) return
    const newChapter = {
      id: crypto.randomUUID(), title: `Chapter ${graph.chapters.length + 1}`, description: '',
      icon: '\u{1F4D6}', background_image: '', order_index: graph.chapters.length,
      hide_until_first_quest_complete: false, default_quest_size: { width: 24, height: 24 },
      quest_color: '', group_id: null, default_quest_shape: 'Default', default_enabled: true, progression_mode: 'Default', images: [],
      subtitle: '', default_min_width: 0, always_invisible: false,
      default_hide_dependency_lines: false, hide_quest_details_until_startable: false,
      hide_quest_until_deps_visible: false, hide_quest_until_deps_complete: false,
      hide_text_until_complete: false, autofocus_id: '', default_repeatable: false,
      require_sequential_tasks: false,
    }
    const updatedGraph: QuestGraphData = { ...graph, chapters: [...graph.chapters, newChapter] }
    try {
      await saveQuestGraph(projectId, updatedGraph); setGraph(updatedGraph); setActiveChapter(newChapter.id)
    } catch (e) { console.error('Failed to add chapter:', e) }
  }, [graph, projectId])

  const editState = {
    label: [editLabel, setEditLabel] as const, desc: [editDesc, setEditDesc] as const,
    subtitle: [editSubtitle, setEditSubtitle] as const, color: [editColor, setEditColor] as const,
    visibility: [editVisibility, setEditVisibility] as const, optional: [editOptional, setEditOptional] as const,
    icon: [editIcon, setEditIcon] as const, repeatable: [editRepeatable, setEditRepeatable] as const,
    silentComplete: [editSilentComplete, setEditSilentComplete] as const,
    repeatTime: [editRepeatTime, setEditRepeatTime] as const,
    repeatMinDelay: [editRepeatMinDelay, setEditRepeatMinDelay] as const,
    repeatMaxDelay: [editRepeatMaxDelay, setEditRepeatMaxDelay] as const,
    hideDeps: [editHideDeps, setEditHideDeps] as const, hideQuest: [editHideQuest, setEditHideQuest] as const,
    hideAll: [editHideAll, setEditHideAll] as const, disableReward: [editDisableReward, setEditDisableReward] as const,
    pauseReward: [editPauseReward, setEditPauseReward] as const, shape: [editShape, setEditShape] as const,
    iconScaling: [editIconScaling, setEditIconScaling] as const, tags: [editTags, setEditTags] as const,
    progressionMode: [editProgressionMode, setEditProgressionMode] as const,
    sequentialTasks: [editSequentialTasks, setEditSequentialTasks] as const,
    disableToast: [editDisableToast, setEditDisableToast] as const,
    ignoreRewardBlocking: [editIgnoreRewardBlocking, setEditIgnoreRewardBlocking] as const,
    disableJei: [editDisableJei, setEditDisableJei] as const,
    hideDetailsUntilStartable: [editHideDetailsUntilStartable, setEditHideDetailsUntilStartable] as const,
    hideTextUntilCompleted: [editHideTextUntilCompleted, setEditHideTextUntilCompleted] as const,
    invisibleUntilCompleted: [editInvisibleUntilCompleted, setEditInvisibleUntilCompleted] as const,
    invisibleUntilXTasks: [editInvisibleUntilXTasks, setEditInvisibleUntilXTasks] as const,
    hideDepLines: [editHideDepLines, setEditHideDepLines] as const,
    hideDeptLines: [editHideDeptLines, setEditHideDeptLines] as const,
    minReqDeps: [editMinReqDeps, setEditMinReqDeps] as const,
    depRequirement: [editDepRequirement, setEditDepRequirement] as const,
  }

  return {
    selectedNodeId, setSelectedNodeId, inspectorTab, setInspectorTab, deselectNode,
    selectNode, liveSaveField, liveSaveObjectives, liveSaveRewards,
    inspectorObjectives, inspectorRewards, selectedNode, selectedNodeType,
    selectedLabel, selectedIconDataUrl, isQuestSelected, selectedFallbackIcon,
    updateInspectorObjective, addInspectorObjective, removeInspectorObjective,
    updateInspectorReward, addInspectorReward, removeInspectorReward,
    loadAnalysis, openBookSettings, saveBookSettings, saveGroups, addChapter,
    openGroups, showGroups, setShowGroups, editGroups, setEditGroups,
    showBookSettings, setShowBookSettings,
    editBookProgressionMode, setEditBookProgressionMode,
    editBookIcon, setEditBookIcon, editBookBgImage, setEditBookBgImage,
    editQuestColor, setEditQuestColor,
    editDefaultQuestWidth, setEditDefaultQuestWidth,
    editDefaultQuestHeight, setEditDefaultQuestHeight,
    editDefaultQuestShape, setEditDefaultQuestShape,
    analysis, setAnalysis, showAnalysis, setShowAnalysis,
    editIcon, setEditIcon,
    editState,
  }
}
