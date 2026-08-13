import { useState, useEffect, useCallback, useRef } from 'react'
import { openPrismLauncher } from '../services/api'
import { useProjectState, type Project } from './useProjectState'
import { useModState } from './useModState'
import { useConfigState } from './useConfigState'
import { useLaunchState } from './useLaunchState'
import { useBeginnerMode } from './useBeginnerMode'
import type { LoadPackProgress, CreateProjectInput } from '../services/types'
import { usePackIo } from './use-pack-io'
import type { StartIntent } from '../components/common/StartChooser'
import {
  type AppTab,
  subscribePackProgress,
  subscribeDropImport,
  pruneStaleCaches,
  runLoadPipelineCore,
} from './app-state-utils'

export type { Project } from './useProjectState'
export type { ModDependency, ModMetadata, CompatibilityIssue, CompatibilityResult } from './useModState'
export type { LoadPackProgress, ImportResult } from '../services/types'

export function useAppState() {
  const projectState = useProjectState()
  const { openProject, setShowWizard } = projectState
  const modState = useModState(openProject)
  const configState = useConfigState(openProject)
  const launchState = useLaunchState(openProject)
  const { beginnerMode, setBeginnerMode } = useBeginnerMode()
  const packIo = usePackIo(projectState)
  const { setIngestResult, setIngestError, setImportError, setImportResult, ...packIoRest } = packIo

  const [activeTab, setActiveTab] = useState<AppTab>('mods')

  const [showLoadPack, setShowLoadPack] = useState(false)
  const [loadPackProgress, setLoadPackProgress] = useState<LoadPackProgress>({
    stage: 'idle',
    message: '',
    progress: 0,
  })
  const [packLoaded, setPackLoaded] = useState(false)
  // Save / Discard / Cancel guard shown when leaving a dirty pack.
  const [showLeavePack, setShowLeavePack] = useState(false)
  // Settings modal (CurseForge API key).
  const [showSettings, setShowSettings] = useState(false)
  // StartChooser (s49): the four-card front door. The picked intent drives the
  // wizard's template preset + post-create steps + the beginner-mode landing.
  const [showStartChooser, setShowStartChooser] = useState(false)
  const [startIntent, setStartIntent] = useState<StartIntent | null>(null)
  const autoReopenDone = useRef(false)

  // Listen for granular progress events emitted by the backend during ingest
  // (per-jar texture scanning), so the load bar shows real file-by-file work.
  useEffect(() => subscribePackProgress(setLoadPackProgress), [])

  /** Shared cache-aware load pipeline: texture ingest → FTB import → save graph
   *  → scan + load mods → load configs. `force` bypasses the ingest cache.
   *  Returns true on success. */
  const runLoadPipeline = useCallback(
    (project: Project, force: boolean, wasLoaded: boolean): Promise<boolean> =>
      runLoadPipelineCore({
        project,
        force,
        wasLoaded,
        setPackLoaded,
        setShowLoadPack,
        setLoadPackProgress,
        setIngestResult,
        loadProjectMods: modState.loadProjectMods,
        loadConfigFiles: configState.loadConfigFiles,
      }),
    [modState, configState, setIngestResult],
  )

  /** Open a pack: enter the workspace and run the full cache-aware load. */
  async function openPack(project: Project) {
    if (!project.path) return
    projectState.openPack(project)
    const ok = await runLoadPipeline(project, false, false)
    if (!ok) {
      // Roll back to the launcher; the modal keeps showing the error.
      projectState.closePack()
      setPackLoaded(false)
      setIngestResult(null)
      setIngestError('')
      modState.resetModState()
      modState.setSearchQuery('')
      modState.setSearchResults([])
      configState.resetConfigState()
    }
  }

  /** Re-run the load pipeline against the open pack (manual Refresh). */
  async function refreshPack(force: boolean) {
    const project = projectState.openProject
    if (!project) return
    await runLoadPipeline(project, force, true)
  }

  /** Create a project, then open it (full cache-aware load) under the still-
   *  open wizard. Errors propagate so the wizard can show why. Returns the
   *  project so the wizard can continue to its post-create steps. */
  async function handleCreateProject(input: CreateProjectInput): Promise<Project> {
    const project = await projectState.handleCreateProject(input)
    setActiveTab('mods')
    await openPack(project)
    return project
  }

  /** StartChooser pick (s49): record the intent and open the wizard. Blank and
   *  load close the chooser — blank lands in the IDE via the wizard's skip. */
  function pickStart(intent: StartIntent) {
    setStartIntent(intent)
    setShowStartChooser(false)
    if (intent.kind === 'load') return
    setShowWizard(true)
  }

  /** Wizard Done (s49 mode-per-choice): intro lands in Beginner Mode; IDE-tour
   *  and blank land with the full IDE on. The toggle stays in the topbar. */
  function handleWizardDone() {
    setBeginnerMode(startIntent?.kind === 'intro')
    setShowWizard(false)
  }

  /** Dismiss the load modal. If a fresh open failed, also leave the workspace. */
  function dismissLoadModal() {
    setShowLoadPack(false)
    if (!packLoaded && projectState.openProject) {
      closePack()
    }
  }

  function closePack() {
    setPackLoaded(false)
    setIngestResult(null)
    setIngestError('')
    projectState.closePack()
    modState.resetModState()
    modState.setSearchQuery('')
    modState.setSearchResults([])
    configState.resetConfigState()
  }

  /** Leave the pack, guarding against a dirty config editor. */
  function requestClosePack() {
    if (configState.configDirty) {
      setShowLeavePack(true)
    } else {
      closePack()
    }
  }

  async function saveAndClosePack() {
    setShowLeavePack(false)
    if (configState.configDirty) {
      await configState.saveConfigFile()
    }
    closePack()
  }

  function discardAndClosePack() {
    setShowLeavePack(false)
    closePack()
  }

  function cancelLeavePack() {
    setShowLeavePack(false)
  }

  useEffect(() => {
    projectState.loadProjects()

    const onVisibility = () => {
      if (document.visibilityState === 'visible') projectState.loadProjects()
    }
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Prune stale per-instance caches (old scans/instances leave junk that can
  // total gigabytes). Runs once after the project list loads, keeping caches
  // for every known project path + mods dir.
  const prunedRef = useRef(false)
  useEffect(() => {
    if (prunedRef.current || projectState.projects.length === 0) return
    prunedRef.current = true
    pruneStaleCaches(projectState.projects)
  }, [projectState.projects])

  // Auto-reopen the last-opened pack on launch: after the project list loads,
  // if a last-project id was stored and matches a known project, open it (full
  // cache-aware load). The heavy stages are cache-validated, so reopen is fast
  // when caches are warm. Otherwise stay on the launcher.
  useEffect(() => {
    if (autoReopenDone.current) return
    const id = projectState.getLastProjectId()
    if (!id) {
      autoReopenDone.current = true
      return
    }
    // Wait for the project list to actually load before giving up.
    if (projectState.projects.length === 0) return
    const target = projectState.projects.find((p) => p.id === id)
    if (!target) {
      autoReopenDone.current = true
      return
    }
    autoReopenDone.current = true
    setActiveTab('mods')
    openPack(target)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectState.projects])

  // Drag-and-drop pack import: the native dialog can hang on some Wayland
  // setups, so dropping a pack file onto the window is a reliable alternative.
  // Tauri's drag-drop event carries real absolute paths (unlike a hidden
  // <input type="file">, which does not expose paths on WebKitGTK).
  useEffect(
    () =>
      subscribeDropImport({
        setImportPath: packIo.setImportPath,
        setImportError,
        setImportResult,
        setShowImport: packIo.setShowImport,
      }),
    [packIo.setImportPath, setImportError, setImportResult, packIo.setShowImport],
  )

  function handleTabChange(tab: AppTab) {
    setActiveTab(tab)
    if (tab === 'configs' && openProject) {
      configState.loadConfigFiles()
    }
  }

  // Guided-first-quest handoff (P0-MINIWIZ, wizard step 5): close the wizard,
  // open the quests tab, and pop the guided-quest modal inside the editor.
  const [showGuidedQuest, setShowGuidedQuest] = useState(false)
  function handleGuidedQuest() {
    setShowWizard(false)
    handleTabChange('quests')
    setShowGuidedQuest(true)
  }
  function handleGuidedQuestClose() {
    setShowGuidedQuest(false)
  }

  async function handleConfirmDelete() {
    const wasOpen = !!projectState.openProject
    const success = await projectState.handleConfirmDelete()
    if (success) {
      if (wasOpen) {
        closePack()
      } else {
        modState.setSearchQuery('')
        modState.setSearchResults([])
      }
      setActiveTab('mods')
    }
  }

  return {
    ...projectState,
    ...modState,
    ...configState,
    ...launchState,
    ...packIoRest,
    activeTab,
    beginnerMode, setBeginnerMode,
    handleTabChange,
    handleConfirmDelete,
    openPrismLauncher,
    showLoadPack,
    setShowLoadPack,
    loadPackProgress,
    packLoaded,
    openPack,
    refreshPack,
    closePack,
    dismissLoadModal,
    showGuidedQuest,
    handleGuidedQuest,
    handleGuidedQuestClose,
    showLeavePack,
    requestClosePack,
    showSettings, setShowSettings,
    showStartChooser, setShowStartChooser,
    pickStart, startIntent,
    handleWizardDone,
    saveAndClosePack,
    discardAndClosePack,
    cancelLeavePack,
    handleCreateProject,
  }
}
