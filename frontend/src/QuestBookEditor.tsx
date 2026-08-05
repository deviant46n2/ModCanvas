import { useCallback, useState, useMemo, useEffect, useRef } from 'react'
import { useHistory } from './hooks/history-provider'
import { getQuestGraph, wsIpcGetStatus } from './services/api'
import type { QuestGraphData, QuestChapter, QuestChapterGroup, QuestNodeData, QuestEdgeData, ChapterImage, EdgeBezierRel } from './services/api'
import { QuestCanvas } from './components/quest/QuestCanvas'
import { ChapterTree } from './components/quest/ChapterTree'
import { getThemePreset, applyBookTheme } from './core/quest/theme-presets'
import { QuestBookSkeleton } from './components/quest/QuestBookSkeleton'
import { QuestDetailModal } from './components/quest/QuestDetailModal'
import { ChapterSettings } from './components/quest/ChapterSettings'
import { GroupSettings } from './components/quest/GroupSettings'
import { ImportExportToolbar } from './components/quest/import-export'
import { generateFtbHexId, defaultObjective, defaultReward, defaultQuestNodeData, moveArrayItem } from './components/quest/quest-helpers'
import type { ToolbarAPI } from './components/quest/import-export'
import { resolveIconKey, getIconUrl } from './components/quest/questIcons'
import { resolveAssetUrl } from './services/asset-resolver'
import type { IngestResult, ItemRegistryEntry } from './services/quest-types'
import { scanInstanceItems, scanInstanceTextures, scanInstanceAnimations, scanModJarTextures, getQuestThemeBackground } from './services/recipes'
import { registerModItems } from './services/smart-filter-mods'
import {
  subscribeMaterialized,
  subscribeLoadingChange,
  subscribeNotFound,
  getMaterialized,
  requestMaterialize,
  buildTexturePathIndex,
  findTextureKeysForTarget,
  collectNeededTargets,
  prefetchAllChapterTextures,
  registerBakedKeysFromIndex,
  isUsableTextureValue,
  isBakedTexture,
  getBakedTextureKeys,
  unmarkBakedKeys,
  subscribeBakedKeys,
  getBakedTextureCount,
  textureDisplayUrl,
  isTexturePending,
} from './services/texture-loader'
import { requestResolveTags } from './services/smart-filter-tags'
import {
  initEngineRenderListener,
  setEngineRenderConnected,
  subscribeEngineRenders,
  queueEngineRenders,
  queueEngineRendersPriority,
  getEngineRenderCache,
  persistEngineRenders,
  normalizeItemId,
} from './services/engine-render'
import { ItemPickerModal } from './components/common/ItemPickerModal'
import { TextureLoadingBar } from './components/quest/TextureLoadingBar'
import { EngineRenderPrompt } from './components/quest/EngineRenderPrompt'
import { AnimationProvider } from './components/quest/animation-context'
import { getAdapter } from './adapters'
import { normalizeLoader } from './core/recipe/loader'
import {
  initRuntimeTextureListener,
  subscribeRuntimeTextures,
  getRuntimeTextureCache,
  saveRuntimeTextureCache,
  mergeRuntimeTextures,
  questRuntimeNamespaces,
  requestRuntimeTextures,
} from './services/runtime-textures'
import './components/quest/editor-theme.css'
import type { ProgressState } from './core/quest/progress'
import { usePackHealthStore } from './core/pack-health/pack-health-store'

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
}

const MIN_SKELETON_MS = 250

export default function QuestBookEditor({ projectId, projectPath, minecraftVersion, modLoader, wsConnected, ingestResult, packLoaded, onTest, isTesting }: QuestBookEditorProps) {
  // Resolve the adapter so bare KubeJS item ids get the pack's default
  // namespace during the item-registry scan (shared with the recipe editor).
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
  const [textureIndex, setTextureIndex] = useState<Record<string, string>>({})
  const [animations, setAnimations] = useState<Record<string, string>>({})
  const [ingestIndex, setIngestIndex] = useState<Record<string, string>>({})
  const [textureTick, setTextureTick] = useState(0)
  const [texturesLoading, setTexturesLoading] = useState(false)
  const [texturesRemaining, setTexturesRemaining] = useState(0)
  const [bakedCount, setBakedCount] = useState(() => getBakedTextureCount())
  const [enginePromptDismissed, setEnginePromptDismissed] = useState(false)
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
  // App-wide history (Ctrl+Z / Ctrl+Y). Every graph mutation commits into the
  // shared store so undo/redo stays chronological across the whole workspace;
  // the graph apply handler below restores snapshots to the live canvas.
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

  // Background warm-up: once the pack is loaded and the graph is available,
  // queue texture materialization for ALL chapters/groups (not just the active
  // one). This runs invisibly after Load Pack so that opening the Chapters
  // screen later is instant — the icons are already resident.
  const prefetchedFor = useRef<string | null>(null)
  useEffect(() => {
    if (!packLoaded || !graph || !graph.chapters.length) return
    const instancePath = ingestResult?.active_instance || projectPath || ''
    if (!instancePath) return
    const key = `${projectId}|${instancePath}`
    if (prefetchedFor.current === key) return
    prefetchedFor.current = key
    const count = prefetchAllChapterTextures(graph, instancePath)
    // eslint-disable-next-line no-console
    console.log(`[ModCanvas] Pre-warming ${count} quest textures in the background…`)
  }, [packLoaded, graph, projectId, projectPath, ingestResult?.active_instance])

  useEffect(() => {
    if (ingestResult?.asset_registry?.by_id) {
      registerBakedKeysFromIndex(ingestResult.asset_registry.by_id)
      setIngestIndex(ingestResult.asset_registry.by_id)
      setTextureIndex(prev => ({ ...prev, ...ingestResult.asset_registry.by_id }))
    }
    if (ingestResult?.active_instance) {
      scanInstanceItems(ingestResult.active_instance, kubejsNamespace).then((registry) => {
        setItems(registry);
        registerModItems(registry);
      }).catch((e) => console.error('[QuestBookEditor] Failed to scan instance items:', e));
    }
  }, [ingestResult, kubejsNamespace])

  // ── Engine-render pipeline (companion mod) ──────────────────────────────
  // When the game is running with the companion connected, icons that the local
  // pipeline cannot bake (complex/custom mod models, fluids, …) are rendered
  // in-game and cached. Injected into the live texture index (quest tiles) and
  // the item registry (JEI view), and persisted to the Rust disk cache.
  const instancePath = ingestResult?.active_instance || projectPath || ''

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

  // Track software-baked keys reactively so the "run the instance to capture
  // textures" prompt appears/clears as bakes are replaced by real engine icons.
  useEffect(() => subscribeBakedKeys(() => setBakedCount(getBakedTextureCount())), [])
  // Switching packs must never leak the previous pack's graph or active
  // chapter (a stale active chapter would filter the new pack to the wrong
  // quests). The graph-load effect below re-selects the first chapter.
  useEffect(() => {
    setGraph(null)
    setActiveChapter(null)
    setSelectedNodeId(null)
    setEnginePromptDismissed(false)
  }, [projectId])
  useEffect(() => {
    let disposed = false
    initEngineRenderListener()
    setEngineRenderConnected(!!wsConnected)

    // Fallback sync: if the `ws-ipc:status` event was missed (or the effect
    // ran before the game connected), poll the server so the engine-render
    // path arms itself shortly after the companion appears.
    let pollTimer: ReturnType<typeof setInterval> | undefined
    const syncStatus = () => {
      wsIpcGetStatus().then((st) => {
        if (!disposed) setEngineRenderConnected(st.connected)
      }).catch(() => {})
    }
    pollTimer = setInterval(syncStatus, 5000)
    syncStatus()

    if (instancePath) {
      getEngineRenderCache(instancePath)
        .then((cached) => {
          if (disposed || !cached || Object.keys(cached).length === 0) return
          // Cached engine icons replace any software bake for these items.
          unmarkBakedKeys(Object.keys(cached))
          setTextureIndex((prev) => {
            let changed = false
            const merged = { ...prev }
            for (const [k, v] of Object.entries(cached)) {
              if (prev[k] !== v) {
                merged[k] = v
                changed = true
              }
            }
            return changed ? merged : prev
          })
          setItems((prev) => prev.map((i) => (i.texture_data_url ? i : { ...i, texture_data_url: cached[i.id] ?? null })))
        })
        .catch(() => {})
    }

    const unsubRenders = subscribeEngineRenders((rendered) => {
      // Real engine icons: stop treating them as software-baked so they render
      // pixelated (in-game look) instead of smooth-scaled.
      unmarkBakedKeys(Object.keys(rendered))
      setTextureIndex((prev) => {
        let changed = false
        const merged = { ...prev }
        for (const [k, v] of Object.entries(rendered)) {
          if (prev[k] !== v) {
            merged[k] = v
            changed = true
          }
        }
        return changed ? merged : prev
      })
      setItems((prev) => prev.map((i) => (i.texture_data_url ? i : { ...i, texture_data_url: rendered[i.id] ?? null })))
      if (instancePath) {
        persistEngineRenders(instancePath, rendered).catch((e) => console.error('[QuestBookEditor] persistEngineRenders failed:', e))
      }
    })

    return () => {
      disposed = true
      if (pollTimer) clearInterval(pollTimer)
      unsubRenders()
    }
  }, [instancePath, wsConnected])

  // ── Runtime texture extraction (non-item gaps) ────────────────────────────
  // Quest backgrounds / chapter images / GUI + theme assets that only exist at
  // runtime are captured from the companion's ResourceManager and merged into
  // the texture index (runtime wins) + persisted to the Rust disk cache. Loads
  // the cached captures on open, and requests a fresh extraction once per pack
  // when the companion is connected and the graph is available.
  const runtimeRequestedRef = useRef<string | null>(null)
  useEffect(() => {
    if (!wsConnected || !graph) return
    if (runtimeRequestedRef.current === projectId) return
    runtimeRequestedRef.current = projectId
    const namespaces = questRuntimeNamespaces(graph)
    requestRuntimeTextures(namespaces).catch((e) =>
      console.error('[QuestBookEditor] requestRuntimeTextures failed:', e),
    )
  }, [wsConnected, graph, projectId])

  useEffect(() => {
    let disposed = false
    initRuntimeTextureListener()
    if (instancePath) {
      getRuntimeTextureCache(instancePath)
        .then((cached) => {
          if (disposed || !cached || Object.keys(cached).length === 0) return
          setTextureIndex((prev) => mergeRuntimeTextures(prev, cached))
        })
        .catch((e) => console.error('[QuestBookEditor] getRuntimeTextureCache failed:', e))
    }
    const unsub = subscribeRuntimeTextures((textures) => {
      setTextureIndex((prev) => mergeRuntimeTextures(prev, textures))
      if (instancePath) {
        saveRuntimeTextureCache(instancePath, textures).catch((e) =>
          console.error('[QuestBookEditor] saveRuntimeTextureCache failed:', e),
        )
      }
    })
    return () => {
      disposed = true
      unsub()
    }
  }, [instancePath])

  // Queue engine renders once the companion is connected:
  //  - software-baked item ids (replaced with real GUI renders, cached forever)
  //  - registry items with no baked texture (JEI "?" slots)
  //  - keys that exhausted materialization retries (quest tiles)
  useEffect(() => {
    if (!wsConnected) return
    const missingRegistry = items.filter((i) => !i.texture_data_url).map((i) => i.id)
    if (missingRegistry.length > 0) queueEngineRenders(missingRegistry)
    const unsub = subscribeNotFound((keys) => {
      const itemLike = keys.map(normalizeItemId).filter((k): k is string => !!k)
      if (itemLike.length > 0) queueEngineRenders(itemLike)
    })
    return unsub
  }, [wsConnected, instancePath, items])

  // Once the texture index is loaded (which populates `bakedKeys`), queue all
  // software-baked items for engine replacement. Runs again on index changes so
  // newly-scanned bakes are caught; `queueEngineRenders` dedupes.
  useEffect(() => {
    if (!wsConnected) return
    const baked = getBakedTextureKeys()
    if (baked.length > 0) queueEngineRenders(baked)
  }, [wsConnected, textureIndex])

  // Feed the Pack Health panel with the already-materialized quest graph and
  // item registry. This is a push of cached state — never a scan — so the
  // health report updates on every commit without any extra I/O.
  const setQuestState = usePackHealthStore((s) => s.setQuestState)
  useEffect(() => {
    setQuestState(graph, items)
  }, [graph, items, setQuestState])

  useEffect(() => {
    const instancePath = ingestResult?.active_instance || projectPath || ''
    let cancelled = false
    if (instancePath) {
      scanInstanceTextures(instancePath).then((idx) => {
        if (cancelled || !idx || Object.keys(idx).length === 0) return
        registerBakedKeysFromIndex(idx)
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

  // Materialization resolves in batches (500 keys each). Bumping textureTick on
  // every batch would rebuild the whole quest canvas hundreds of times and
  // stutter the UI, so re-renders are coalesced into a single pass per ~120ms.
  useEffect(() => {
    let timer: number | undefined
    let pending = false
    const schedule = () => {
      if (pending) return
      pending = true
      timer = window.setTimeout(() => {
        pending = false
        setTextureTick(t => t + 1)
      }, 120)
    }
    const unsub = subscribeMaterialized(schedule)
    return () => {
      unsub()
      if (timer !== undefined) window.clearTimeout(timer)
    }
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
    commitGraph({ ...graph, nodes: graph.nodes.map(n => n.id === nodeId ? { ...n, ...data } : n) })
    scheduleAutoSave()
  }, [graph, scheduleAutoSave])

  const onUpdateNodes = useCallback((updates: Array<{ nodeId: string; data: Partial<QuestNodeData> }>) => {
    if (!graph) return
    const byId = new Map(updates.map(u => [u.nodeId, u.data]))
    commitGraph({
      ...graph,
      nodes: graph.nodes.map(n => (byId.has(n.id) ? { ...n, ...byId.get(n.id) } : n)),
    })
    scheduleAutoSave()
  }, [graph, scheduleAutoSave])

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
  }, [graph, scheduleAutoSave])

  const onAddQuest = useCallback((_chapterId?: string, position?: { x: number; y: number }) => {
    if (!graph || !activeChapter) return
    const newNode = defaultQuestNodeData({ chapter_id: activeChapter, label: 'New Quest', position: position || { x: 0, y: 0 } })
    commitGraph({ ...graph, nodes: [...graph.nodes, newNode] })
    setSelectedNodeId(newNode.id)
    scheduleAutoSave()
  }, [graph, activeChapter, scheduleAutoSave])

  const onAddQuestWithTask = useCallback((_chapterId: string, objectiveType: string, position?: { x: number; y: number }) => {
    if (!graph || !activeChapter) return
    const node = defaultQuestNodeData({
      chapter_id: activeChapter,
      label: 'New Quest',
      position: position || { x: 0, y: 0 },
    })
    const objective = { ...defaultObjective(), objective_type: objectiveType }
    const newNode = { ...node, objectives: [objective] }
    commitGraph({ ...graph, nodes: [...graph.nodes, newNode] })
    setSelectedNodeId(newNode.id)
    scheduleAutoSave()
  }, [graph, activeChapter, scheduleAutoSave])

  const onAddQuestLink = useCallback((_chapterId?: string, position?: { x: number; y: number }) => {
    if (!graph || !activeChapter) return
    const newNode = defaultQuestNodeData({
      chapter_id: activeChapter,
      node_type: 'quest_link',
      label: 'New Link',
      position: position || { x: 0, y: 0 },
      link_target: graph.nodes.find((n: QuestNodeData) => n.node_type === 'quest')?.id || '',
    })
    commitGraph({ ...graph, nodes: [...graph.nodes, newNode] })
    setSelectedNodeId(newNode.id)
    scheduleAutoSave()
  }, [graph, activeChapter, scheduleAutoSave])

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

  const onDeleteNode = useCallback((nodeId: string) => {
    if (!graph) return
    commitGraph({ ...graph, nodes: graph.nodes.filter(n => n.id !== nodeId) })
    if (selectedNodeId === nodeId) setSelectedNodeId(null)
    scheduleAutoSave()
  }, [graph, selectedNodeId, scheduleAutoSave])

  const onDeleteNodes = useCallback((nodeIds: string[]) => {
    if (!graph || nodeIds.length === 0) return
    const dead = new Set(nodeIds)
    commitGraph({
      ...graph,
      nodes: graph.nodes.filter(n => !dead.has(n.id)),
      edges: graph.edges.filter(e => !dead.has(e.source) && !dead.has(e.target)),
    })
    if (selectedNodeId && dead.has(selectedNodeId)) setSelectedNodeId(null)
    scheduleAutoSave()
  }, [graph, selectedNodeId, scheduleAutoSave])

  const onPasteNodes = useCallback((newNodes: QuestNodeData[], newEdges: QuestEdgeData[]) => {
    if (!graph || newNodes.length === 0) return
    commitGraph({
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
    commitGraph({ ...graph, edges: [...graph.edges, newEdge] })
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
    commitGraph({
      ...graph,
      edges: graph.edges.map(e => e.id === edgeId ? { ...e, ...data } : e),
    })
    scheduleAutoSave()
  }, [graph, scheduleAutoSave])

  const onDeleteEdge = useCallback((edgeId: string) => {
    if (!graph) return
    commitGraph({ ...graph, edges: graph.edges.filter(e => e.id !== edgeId) })
    scheduleAutoSave()
  }, [graph, scheduleAutoSave])

  // Persist a dependency edge's manual bezier control points (editor-only; not
  // written to SNBT). Null clears the curve back to the default.
  const onUpdateEdgeBezier = useCallback((edgeId: string, bezier: EdgeBezierRel | null) => {
    if (!graph) return
    commitGraph({
      ...graph,
      edges: graph.edges.map(e => e.id === edgeId ? { ...e, bezier } : e),
    })
    scheduleAutoSave()
  }, [graph, scheduleAutoSave])

  // Apply a self-authored book-level visual preset across the whole graph.
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

  const onAddObjective = useCallback((nodeId: string) => {
    if (!graph) return
    commitGraph({ ...graph, nodes: graph.nodes.map(n =>
      n.id === nodeId ? { ...n, objectives: [...(n.objectives || []), defaultObjective()] } : n
    )})
    scheduleAutoSave()
  }, [graph, scheduleAutoSave])

  const onAddReward = useCallback((nodeId: string) => {
    if (!graph) return
    commitGraph({ ...graph, nodes: graph.nodes.map(n =>
      n.id === nodeId ? { ...n, rewards: [...(n.rewards || []), defaultReward()] } : n
    )})
    scheduleAutoSave()
  }, [graph, scheduleAutoSave])

  const onRemoveObjective = useCallback((nodeId: string, objectiveId: string) => {
    if (!graph) return
    commitGraph({ ...graph, nodes: graph.nodes.map(n =>
      n.id === nodeId ? { ...n, objectives: (n.objectives || []).filter(o => o.id !== objectiveId) } : n
    )})
    scheduleAutoSave()
  }, [graph, scheduleAutoSave])

  const onRemoveReward = useCallback((nodeId: string, rewardId: string) => {
    if (!graph) return
    commitGraph({ ...graph, nodes: graph.nodes.map(n =>
      n.id === nodeId ? { ...n, rewards: (n.rewards || []).filter(r => r.id !== rewardId) } : n
    )})
    scheduleAutoSave()
  }, [graph, scheduleAutoSave])

  const onUpdateObjective = useCallback((nodeId: string, objectiveId: string, field: string, value: unknown) => {
    if (!graph) return
    commitGraph({ ...graph, nodes: graph.nodes.map(n =>
      n.id === nodeId ? { ...n, objectives: (n.objectives || []).map(o =>
        o.id === objectiveId ? { ...o, [field]: value } : o
      )} : n
    )})
    scheduleAutoSave()
  }, [graph, scheduleAutoSave])

  const onUpdateReward = useCallback((nodeId: string, rewardId: string, field: string, value: unknown) => {
    if (!graph) return
    commitGraph({ ...graph, nodes: graph.nodes.map(n =>
      n.id === nodeId ? { ...n, rewards: (n.rewards || []).map(r =>
        r.id === rewardId ? { ...r, [field]: value } : r
      )} : n
    )})
    scheduleAutoSave()
  }, [graph, scheduleAutoSave])

  const onMoveObjective = useCallback((nodeId: string, objectiveId: string, dir: -1 | 1) => {
    if (!graph) return
    const next = graph.nodes.map(n => {
      if (n.id !== nodeId) return n
      const list = n.objectives || []
      const idx = list.findIndex(o => o.id === objectiveId)
      return { ...n, objectives: moveArrayItem(list, idx, idx + dir) }
    })
    if (next.every((n, i) => n === graph.nodes[i])) return
    commitGraph({ ...graph, nodes: next })
    scheduleAutoSave()
  }, [graph, scheduleAutoSave])

  const onMoveReward = useCallback((nodeId: string, rewardId: string, dir: -1 | 1) => {
    if (!graph) return
    const next = graph.nodes.map(n => {
      if (n.id !== nodeId) return n
      const list = n.rewards || []
      const idx = list.findIndex(r => r.id === rewardId)
      return { ...n, rewards: moveArrayItem(list, idx, idx + dir) }
    })
    if (next.every((n, i) => n === graph.nodes[i])) return
    commitGraph({ ...graph, nodes: next })
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

  const histStatus = useMemo(() => ({
    undo: history.canUndo,
    redo: history.canRedo,
  }), [history])

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
    // Software-baked items in the CURRENT view get engine renders first so the
    // page upgrades quickly; the background queue fills the rest of the pack.
    if (wsConnected) {
      const bakedInView = [...new Set([...targets].map(resolveIconKey))]
        .filter((k) => isBakedTexture(k))
        .map(normalizeItemId)
        .filter((id): id is string => !!id)
      if (bakedInView.length > 0) queueEngineRendersPriority(bakedInView)
    }
  }, [graph, activeChapter, selectedNode, textureIndex, textureTick, ingestIndex, ingestPathIndex, scanPathIndex, ingestResult?.active_instance, projectPath, wsConnected])

  if (!graph) {
    return <QuestBookSkeleton />
  }

  return (
    <AnimationProvider animations={animations}>
      <div className="quest-editor">
        <ImportExportToolbar
        graph={graph}
        setGraph={commitGraph}
        projectId={projectId}
        projectPath={projectPath}
        textureIndex={textureIndex}
        setTextureIndex={setTextureIndex}
        modsDir={modsDir}
        setModsDir={setModsDir}
        onReady={onReady}
      />
      {packLoaded && !!instancePath && bakedCount > 0 && (!!wsConnected || !enginePromptDismissed) && (
        <EngineRenderPrompt
          bakedCount={bakedCount}
          connected={!!wsConnected}
          isTesting={isTesting ?? false}
          onRunInstance={() => onTest?.()}
          onDismiss={() => setEnginePromptDismissed(true)}
        />
      )}
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
            onRenameChapter={(id, title) => onUpdateChapter(id, { title })}
            onMoveChapter={onMoveChapter}
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
            onUpdateEdgeBezier={onUpdateEdgeBezier}
            onApplyThemePreset={onApplyThemePreset}
            onDeleteNode={onDeleteNode}
            onDeleteNodes={onDeleteNodes}
            onPasteNodes={onPasteNodes}
            onDeleteEdge={onDeleteEdge}
            onAddNode={onAddQuest}
            onAddLink={onAddQuestLink}
            onAddQuestWithTask={onAddQuestWithTask}
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
            onUndo={history.undo}
            onRedo={history.redo}
            canUndo={histStatus.undo}
            canRedo={histStatus.redo}
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
            onMoveObjective={onMoveObjective}
            onMoveReward={onMoveReward}
            openIconPicker={(target) => toolbarApiRef.current?.openIconPicker(target)}
            onOpenItemPicker={(target) => setItemPickerTarget(target)}
            onClose={() => setSelectedNodeId(null)}
            simProgress={simProgress}
            onSetQuestProgress={setQuestProgress}
            quests={graph.nodes
              .filter((n: QuestNodeData) => n.node_type === 'quest' || n.node_type === 'side_quest')
              .map((n: QuestNodeData) => ({ id: n.id, label: n.label || n.id }))}
            rewardTables={graph.reward_tables || []}
          />
        )}
        {itemPickerTarget && (
          <ItemPickerModal
            items={items}
            getTextureUrl={getPickerTextureUrl}
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
