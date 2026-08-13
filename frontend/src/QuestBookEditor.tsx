import { useCallback, useState, useMemo, useEffect, useRef } from 'react'
import { useHistory } from './hooks/history-provider'
import { getQuestGraph } from './services/api'
import type { QuestGraphData } from './services/quest-types'
import type { IngestResult } from './services/quest-types'
import type { ItemTagInfo } from './services/quest-types'
import { listItemTags } from './services/recipes'
import { openAssetsFolder } from './services/open-assets-folder'
import { QuestBookSkeleton } from './components/quest/QuestBookSkeleton'
import type { ToolbarAPI } from './components/quest/import-export'
import { getAdapter } from './adapters'
import { normalizeLoader } from './core/recipe/loader'
import type { ProgressState } from './core/quest/progress'
import { usePackHealthStore } from './core/pack-health/pack-health-store'
import { textureDisplayUrl, isTexturePending, requestMaterialize } from './services/texture-loader'
import { useQuestAssetPipeline } from './hooks/useQuestAssetPipeline'
import { useGuidedQuestCreate } from './hooks/useGuidedQuestCreate'
import { useQuestNodeMutations } from './hooks/useQuestNodeMutations'
import { useQuestStructureMutations } from './hooks/useQuestStructureMutations'
import { QuestEditorLayout } from './components/quest/QuestEditorLayout'
import { GuidedQuestWizard } from './components/quest/GuidedQuestWizard'

interface QuestBookEditorProps {
  projectId: string
  projectPath?: string
  minecraftVersion?: string
  modLoader?: string
  wsConnected?: boolean
  ingestResult?: IngestResult | null
  packLoaded?: boolean
  onTest?: () => void
  isTesting?: boolean
  /** External handoff (P0-MINIWIZ wizard step 5): open the guided quest modal. */
  showGuidedQuest?: boolean
  onGuidedQuestClose?: () => void
}

const MIN_SKELETON_MS = 250

export default function QuestBookEditor({ projectId, projectPath, minecraftVersion, modLoader, wsConnected, ingestResult, packLoaded, onTest, isTesting, showGuidedQuest, onGuidedQuestClose }: QuestBookEditorProps) {
  const adapter = useMemo(
    () => getAdapter(minecraftVersion ?? '1.21.1', normalizeLoader(modLoader)),
    [minecraftVersion, modLoader],
  )
  const kubejsNamespace = adapter.getKubejsDefaultNamespace()
  const [graph, setGraph] = useState<QuestGraphData | null>(null)
  const [activeChapter, setActiveChapter] = useState<string | null>(null)
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({})
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [editChapterId, setEditChapterId] = useState<string | null>(null)
  const [editGroupId, setEditGroupId] = useState<string | null>(null)
  const [modsDir, setModsDirState] = useState(() => localStorage.getItem('modcanvas_mods_dir') || '')
  const [itemPickerTarget, setItemPickerTarget] = useState<{
    type: 'objective' | 'reward'
    id: string
    nodeId: string
  } | null>(null)
  const [simProgress, setSimProgress] = useState<ProgressState>({})
  const [simMode, setSimMode] = useState(false)
  const [enginePromptDismissed, setEnginePromptDismissed] = useState(false)
  const [guidedQuestLocal, setGuidedQuestLocal] = useState(false)
  // External handoff (wizard step 5) vs internal toolbar button: the external
  // prop is one-shot (the App clears it after the modal closes) — derive the
  // effective open state from either source.
  const guidedQuestOpen = showGuidedQuest || guidedQuestLocal
  const closeGuidedQuest = useCallback(() => {
    setGuidedQuestLocal(false)
    onGuidedQuestClose?.()
  }, [onGuidedQuestClose])
  const toolbarApiRef = useRef<ToolbarAPI | null>(null)
  const history = useHistory()

  // Restore history steps that target this quest graph.
  useEffect(() => {
    return history.register('graph', (entry, direction) => {
      const value = direction === 'before' ? entry.before : entry.after
      if (value && typeof value === 'object') {
        setGraph(value as QuestGraphData)
      }
    })
  }, [history])

  const setModsDir = useCallback((dir: string) => {
    setModsDirState(dir)
    if (dir) localStorage.setItem('modcanvas_mods_dir', dir)
    else localStorage.removeItem('modcanvas_mods_dir')
  }, [])

  // Commit helper: records the before/after snapshot in the app-wide history
  // and applies the new graph. Rapid same-target edits coalesce into one undo
  // gesture (e.g. a node drag); discrete ops can pass `split` for a clean step.
  const commitGraph = useCallback((next: QuestGraphData, opts?: { split?: boolean }) => {
    if (graph) {
      history.commit({
        subject: 'graph',
        target: 'quest',
        label: 'Edit quest graph',
        before: graph,
        after: next,
      }, opts)
    }
    setGraph(next)
  }, [graph, history])

  const onReady = useCallback((api: ToolbarAPI) => {
    toolbarApiRef.current = api
  }, [])

  const scheduleAutoSave = useCallback(() => {
    setTimeout(() => toolbarApiRef.current?.scheduleAutoSave?.(), 300)
  }, [])

  // Guided "Add a quest" create — see useGuidedQuestCreate (P0-MINIWIZ).
  const handleGuidedQuestCreate = useGuidedQuestCreate({
    graph, activeChapter, commitGraph, setSelectedNodeId, scheduleAutoSave, toolbarApiRef,
  })

  const instancePath = ingestResult?.active_instance || projectPath || ''

  const selectedNode = selectedNodeId ? graph?.nodes.find(n => n.id === selectedNodeId) : null

  const { textureIndex, animations, texturesLoading, texturesRemaining, bakedCount, questBackgroundUrl, items } =
    useQuestAssetPipeline({ instancePath, ingestResult, kubejsNamespace, wsConnected, graph, activeChapter, selectedNode, packLoaded, projectId })

  // Item/tag catalog for the shared JEI-style picker: items come from the
  // pipeline, tags from the same instance scan the recipe editor uses.
  const [tagCatalog, setTagCatalog] = useState<ItemTagInfo[]>([])
  useEffect(() => {
    let disposed = false
    if (!instancePath) return
    listItemTags(instancePath)
      .then((tags) => {
        if (!disposed) setTagCatalog(tags)
      })
      .catch((e) => console.error('[QuestBookEditor] Failed to load item tags:', e))
    return () => { disposed = true }
  }, [instancePath])

  // Item picker icons resolve lazily through the live texture index first
  // (shared lazy materializer), falling back to the registry's own data URL —
  // so opening the picker never deepens the base64 registry dependency.
  const getPickerTextureUrl = useCallback(
    (itemId: string): string | null => {
      const url = textureDisplayUrl(textureIndex, itemId)
      if (url) return url
      if (isTexturePending(textureIndex, itemId) && instancePath) {
        requestMaterialize([itemId], instancePath)
      }
      return null
    },
    [textureIndex, instancePath],
  )

  const nodeMutations = useQuestNodeMutations({ graph, commitGraph, scheduleAutoSave, activeChapter, selectedNodeId, setSelectedNodeId })
  const structureMutations = useQuestStructureMutations({ graph, commitGraph, scheduleAutoSave, activeChapter, editChapterId, setActiveChapter, setEditChapterId, setSimProgress })

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

  // Switching packs must never leak the previous pack's graph or active
  // chapter (a stale active chapter would filter the new pack to the wrong
  // quests). The graph-load effect below re-selects the first chapter.
  useEffect(() => {
    setGraph(null)
    setActiveChapter(null)
    setSelectedNodeId(null)
    setEnginePromptDismissed(false)
  }, [projectId])

  // Feed the Pack Health panel with the already-materialized quest graph and
  // item registry. This is a push of cached state — never a scan — so the
  // health report updates on every commit without any extra I/O.
  const setQuestState = usePackHealthStore((s) => s.setQuestState)
  useEffect(() => {
    setQuestState(graph, items)
  }, [graph, items, setQuestState])

  const handleToggleGroup = useCallback((id: string) => {
    setCollapsedGroups(prev => ({ ...prev, [id]: !prev[id] }))
  }, [])

  if (!graph) {
    return <QuestBookSkeleton />
  }

  return (
    <>
      <QuestEditorLayout
      graph={graph}
      setGraph={commitGraph}
      projectId={projectId}
      projectPath={projectPath}
      instancePath={instancePath}
      onOpenAssetsFolder={() => openAssetsFolder(projectId)}
      packLoaded={packLoaded}
      wsConnected={wsConnected}
      isTesting={isTesting}
      onTest={onTest}
      onReady={onReady}
      toolbarApiRef={toolbarApiRef}
      textureIndex={textureIndex}
      animations={animations}
      modsDir={modsDir}
      setModsDir={setModsDir}
      bakedCount={bakedCount}
      enginePromptDismissed={enginePromptDismissed}
      setEnginePromptDismissed={setEnginePromptDismissed}
      items={items}
      tags={tagCatalog}
      getPickerTextureUrl={getPickerTextureUrl}
      questBackgroundUrl={questBackgroundUrl}
      texturesLoading={texturesLoading}
      texturesRemaining={texturesRemaining}
      collapsedGroups={collapsedGroups}
      onToggleGroup={handleToggleGroup}
      selectedNodeId={selectedNodeId}
      setSelectedNodeId={setSelectedNodeId}
      activeChapter={activeChapter}
      onSelectChapter={setActiveChapter}
      editChapterId={editChapterId}
      setEditChapterId={setEditChapterId}
      editGroupId={editGroupId}
      setEditGroupId={setEditGroupId}
      itemPickerTarget={itemPickerTarget}
      setItemPickerTarget={setItemPickerTarget}
      simMode={simMode}
      setSimMode={setSimMode}
      simProgress={simProgress}
      onOpenGuidedQuest={() => setGuidedQuestLocal(true)}
      {...nodeMutations}
      {...structureMutations}
      />
      <GuidedQuestWizard
        open={guidedQuestOpen}
        items={items}
        tags={tagCatalog}
        getPickerTextureUrl={getPickerTextureUrl}
        onClose={closeGuidedQuest}
        onCreate={handleGuidedQuestCreate}
      />
    </>
  )
}
