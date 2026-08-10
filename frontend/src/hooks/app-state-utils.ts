import { listen } from '@tauri-apps/api/event'
import { getCurrentWindow } from '@tauri-apps/api/window'
import {
  ingestActiveInstance as apiIngestActiveInstance,
  importFtbQuestsFromDir as apiImportFtbQuests,
  saveQuestGraph as apiSaveQuestGraph,
  scanInstanceMods as apiScanInstanceMods,
  scanPackRecipes as apiScanPackRecipes,
} from '../services/api'
import { useRecipeStore } from '../core/recipe/recipe-store'
import type { Recipe } from '../core/recipe/recipe-store'
import type { Project, ImportResult, LoadPackProgress, DiscoveredRecipe } from '../services/types'
import type { IngestResult } from '../services/quest-types'

export type AppTab = 'mods' | 'configs' | 'quests' | 'recipes' | 'health'

export function errorMessage(e: any): string {
  return typeof e === 'string' ? e : e?.message || String(e)
}

export function mergeLoadPackProgress(prev: LoadPackProgress, p: LoadPackProgress): LoadPackProgress {
  return {
    ...prev,
    stage: p.stage === 'textures' ? 'textures' : prev.stage,
    message: p.message,
    progress: Math.max(prev.progress, p.progress),
    file: p.file,
    done: p.done,
    total: p.total,
  }
}

export function withDiscoveredMeta(discovered: DiscoveredRecipe[]): Recipe[] {
  return discovered.map((r) => ({
    ...r.recipe,
    origin: r.origin,
    source: r.source,
    editable: r.editable,
    sourceLines: r.span ?? undefined,
  }))
}

export function subscribePackProgress(
  setLoadPackProgress: (updater: (prev: LoadPackProgress) => LoadPackProgress) => void,
): () => void {
  let unlisten: (() => void) | undefined
  listen<LoadPackProgress>('modcanvas-load-pack-progress', (event) => {
    setLoadPackProgress((prev) => mergeLoadPackProgress(prev, event.payload))
  }).then((u) => { unlisten = u })
  return () => { unlisten?.() }
}

export function subscribeDropImport(handlers: {
  setImportPath: (path: string) => void
  setImportError: (message: string) => void
  setImportResult: (result: ImportResult | null) => void
  setShowImport: (show: boolean) => void
}): () => void {
  let unlisten: (() => void) | undefined
  getCurrentWindow().onDragDropEvent((event) => {
    if (event.payload.type !== 'drop') return
    const pack = event.payload.paths.find((p) => /\.(zip|mrpack|toml)$/i.test(p))
    if (!pack) return
    handlers.setImportPath(pack)
    handlers.setImportError('')
    handlers.setImportResult(null)
    handlers.setShowImport(true)
  }).then((u) => { unlisten = u })
  return () => { unlisten?.() }
}

export function pruneStaleCaches(projects: Project[]): void {
  const instancePaths = projects.map((p) => p.path)
  const modsDirs = projects.map((p) => `${p.path}/mods`)
  import('../services/recipes').then(({ pruneCaches }) => {
    pruneCaches(instancePaths, modsDirs).catch(() => {})
  })
}

export interface LoadPipelineCtx {
  project: Project
  force: boolean
  wasLoaded: boolean
  setPackLoaded: (loaded: boolean) => void
  setShowLoadPack: (show: boolean) => void
  setLoadPackProgress: (progress: LoadPackProgress) => void
  setIngestResult: (result: IngestResult | null) => void
  loadProjectMods: (projectId: string) => Promise<void>
  loadConfigFiles: () => Promise<void>
}

export async function runLoadPipelineCore(ctx: LoadPipelineCtx): Promise<boolean> {
  const { project, force, wasLoaded, setPackLoaded, setShowLoadPack, setLoadPackProgress, setIngestResult, loadProjectMods, loadConfigFiles } = ctx
  if (!project.path) return false
  setPackLoaded(false)
  setShowLoadPack(true)
  setLoadPackProgress({ stage: 'idle', message: 'Preparing to scan textures...', progress: 2 })

  // Yield to let modal render first
  await new Promise(r => setTimeout(r, 0))

  try {
    // Stage 1: Ingest textures (backend emits per-jar progress events that
    // the listener above forwards into the load bar).
    setLoadPackProgress({ stage: 'textures', message: 'Scanning mod jars for textures...', progress: 5 })
    const ingestResult = await apiIngestActiveInstance(project.path, force)
    setIngestResult(ingestResult)
    setLoadPackProgress({ stage: 'textures', message: `Indexed ${ingestResult.textures_indexed} textures from ${ingestResult.jars_scanned} mods`, progress: 32 })

    // Stage 2: Import FTB Quests
    setLoadPackProgress({ stage: 'quests', message: 'Locating FTB Quests data files...', progress: 36 })
    const importResult = await apiImportFtbQuests(project.path)
    setLoadPackProgress({ stage: 'quests', message: `Found ${importResult.chapter_count} chapters, ${importResult.quest_count} quests`, progress: 55 })

    // Save quest graph to database
    if (importResult.graph && importResult.graph.chapters.length > 0) {
      setLoadPackProgress({ stage: 'quests', message: 'Saving quest graph to database...', progress: 60 })
      await apiSaveQuestGraph(project.id, importResult.graph)
    }

    // Stage 3: Scan + load mods (file-by-file via the returned mod list)
    setLoadPackProgress({ stage: 'mods', message: 'Scanning instance mods folder...', progress: 64 })
    const scannedMods = await apiScanInstanceMods(project.id)
    setLoadPackProgress({ stage: 'mods', message: `Found ${scannedMods.length} mods in instance`, progress: 72 })

    setLoadPackProgress({ stage: 'mods', message: 'Loading mod details...', progress: 78 })
    await loadProjectMods(project.id)

    // Stage 4: Load configs
    setLoadPackProgress({ stage: 'mods', message: 'Loading config files...', progress: 86 })
    await loadConfigFiles()

    // Stage 5: Scan pack recipes (mod jars + vanilla data + KubeJS/CT) into
    // the recipe store. Cache-aware, so repeat opens are instant.
    setLoadPackProgress({ stage: 'recipes', message: 'Scanning pack recipes...', progress: 88 })
    const discovered = await apiScanPackRecipes(project.path)
    setLoadPackProgress({
      stage: 'recipes',
      message: `Found ${discovered.length} recipes across the pack`,
      progress: 92,
    })
    // Preserve origin/source/editable so read-only jar recipes are marked and
    // pack-health skips them.
    useRecipeStore.getState().loadRecipesFromPack(withDiscoveredMeta(discovered))

    // Stage 6: Prepare quest/recipe data
    setLoadPackProgress({ stage: 'recipes', message: 'Preparing editor data...', progress: 94 })

    // Complete
    setLoadPackProgress({ stage: 'complete', message: 'Pack loaded successfully!', progress: 100 })
    setPackLoaded(true)

    // Auto-close modal after brief delay
    setTimeout(() => setShowLoadPack(false), 1500)
    return true
  } catch (e: any) {
    const msg = errorMessage(e)
    console.error('[Frontend] Load pack failed:', msg)
    setLoadPackProgress({ stage: 'error', message: 'Failed to load pack', progress: 0, error: msg })
    // Restore the prior loaded state so a failed refresh does not strand the
    // workspace in a half-loaded state.
    setPackLoaded(wasLoaded)
    return false
  }
}
