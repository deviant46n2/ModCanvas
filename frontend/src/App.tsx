import './App.css'
// App.css holds the design tokens + base (docs/design.md §2). The feature
// sections it used to carry were split out (s30 debt payment, 3225 -> 225
// lines); import order below IS the cascade order — do not reorder.
import './styles/app-launcher.css'
import './styles/app-workspace.css'
import './styles/app-tabs.css'
import './styles/app-mods.css'
import './styles/app-mod-rows.css'
import './styles/app-mod-grid.css'
import './styles/app-search.css'
import './styles/app-overlays.css'
import './styles/app-loading.css'
import './styles/app-buttons.css'
import './styles/app-instance.css'
import './styles/app-utilities.css'
import './styles/app-compat.css'
import './styles/app-configs-shell.css'
import './styles/app-config-editor.css'
import './styles/app-config-rows.css'
import './styles/app-analysis.css'
import './styles/app-topbar.css'
import './styles/app-health.css'
import { useEffect } from 'react'
import { ToastProvider } from './components/ui/Toast'
import { ErrorBoundary } from './components/ui/ErrorBoundary'
import { Launcher } from './components/launcher/Launcher'
import { ProjectWorkspace } from './components/common/ProjectWorkspace'
import { ImportModal, ExportModal, DeleteConfirmModal } from './components/common/modals'
import { WizardStepper } from './components/common/WizardStepper'
import { LeavePackModal } from './components/common/LeavePackModal'
import { LoadPackModal } from './components/common/LoadPackModal'
import { useAppState } from './hooks/useAppState'
import { HistoryProvider, useHistory } from './hooks/history-provider'
import { saveQuestGraph } from './services/quest'
import { startCompanionSocket, stopCompanionSocket } from './services/companion-socket'
import { useRecipeStore } from './core/recipe/recipe-store'
import type { QuestGraphData } from './services/api'

function App() {
  return (
    <ToastProvider>
      <ErrorBoundary>
        <HistoryProvider>
          <AppRoot />
        </HistoryProvider>
      </ErrorBoundary>
    </ToastProvider>
  )
}

function AppRoot() {
  const s = useAppState()
  const history = useHistory()
  const openProject = s.openProject
  const deleteTarget = s.openProject ?? s.selectedProject

  useEffect(() => {
    history.attachProject(openProject?.id ?? null)
  }, [history, openProject?.id])

  // Join the companion bridge as a peer for the app's lifetime. The socket
  // carries connection status and companion frames; the Tauri event channel
  // is unreliable on some Linux/WebKitGTK stacks and is no longer used for it.
  useEffect(() => {
    startCompanionSocket()
    return stopCompanionSocket
  }, [])

  // Scope the recipe store to the active project. Recipes are pack-specific:
  // leaving the previous pack's recipes in the (persisted) store makes the
  // Recipes tab and Pack Health derive from stale data after switching packs.
  useEffect(() => {
    useRecipeStore.setState({ recipes: [], selectedRecipeId: null })
  }, [openProject?.id])

  // Cross-tool undo routing: when a history step targets an editor that may be
  // unmounted, persist the restored snapshot canonically and switch tabs so a
  // reload shows the restored state.
  useEffect(() => {
    const projectId = openProject?.id ?? null
    if (!projectId) return
    const unregister: (() => void)[] = [
      history.registerRoute('graph', {
        restore: (entry, direction) => {
          const payload = direction === 'before' ? entry.before : entry.after
          if (payload && typeof payload === 'object') {
            saveQuestGraph(projectId, payload as QuestGraphData).catch(() => {})
          }
        },
        navigate: () => {
          if (s.activeTab !== 'quests') s.handleTabChange('quests')
        },
      }),
      history.registerRoute('config', {
        navigate: () => {
          if (s.activeTab !== 'configs') s.handleTabChange('configs')
        },
      }),
    ]
    return () => {
      unregister.forEach((fn) => fn())
    }
  }, [history, openProject?.id, s.activeTab, s.handleTabChange])

  return (
    <div className="app">
      {openProject ? (
        <ProjectWorkspace
          project={openProject}
          activeTab={s.activeTab}
          onTabChange={s.handleTabChange}
          onRestartWebSocket={s.restartWebSocket}
          onRestartInstance={s.handleRestartInstance}
          isRestarting={s.isRestarting}
          deployCompanionMessage={s.deployCompanionMessage}
          isTesting={s.isTesting}
          testProgress={s.testProgress}
          testError={s.testError}
          onSave={s.handleSaveProject}
          onTest={s.handleTestProject}
          onDeployCompanion={s.handleDeployCompanion}
          onExport={() => s.setShowExport(true)}
          onDelete={() => s.setConfirmCloseProject(true)}
          onBackToProjects={s.requestClosePack}
          onRefresh={() => s.refreshPack(false)}
          onForceReindex={() => s.refreshPack(true)}
          modsTab={{
            projectMods: s.projectMods,
            filteredMods: s.filteredMods,
            modFilterInput: s.modFilterInput,
            onModFilterInputChange: s.setModFilterInput,
            onDebouncedModFilter: s.debouncedSetModFilter,
            compatResult: s.compatResult,
            onCompatResultClose: () => s.setCompatResult(null),
            isLoadingMetadata: s.isLoadingMetadata,
            isCheckingCompat: s.isCheckingCompat,
            project: openProject,
            onScanInstanceMods: s.handleScanInstanceMods,
            onLoadDependencies: s.loadModMetadata,
            onCheckCompat: s.handleCheckCompat,
            onInstallMissing: s.installMissingDependency,
            onInstallAllMissing: s.installAllMissingDependencies,
            installingMissing: s.installingMissing,
            searchQuery: s.searchQuery,
            onSearchQueryChange: s.setSearchQuery,
            onSearchMods: s.handleSearchMods,
            searchResults: s.searchResults,
            onAddMod: s.addModToProject,
            onToggleMod: s.toggleModEnabled,
            onRemoveMod: s.removeModFromProject,
            modMetadata: s.modMetadata,
            projectModsForDeps: s.projectMods,
            getMissingDependencies: s.getMissingDependencies,
            getModNameById: s.getModNameById,
            searchSources: s.searchSources,
            onSearchSourcesChange: s.setSearchSources,
            searchCategory: s.searchCategory,
            onSearchCategoryChange: s.setSearchCategory,
            installingIds: s.installingIds,
          }}
          configsTab={{
            configFiles: s.configFiles,
            selectedConfig: s.selectedConfig,
            onOpenConfig: s.openConfigFile,
            configContent: s.configContent,
            onConfigContentChange: s.setConfigContent,
            configMode: s.configMode,
            onConfigModeChange: s.setConfigMode,
            configSaving: s.configSaving,
            onSaveConfig: s.saveConfigFile,
            onRevertConfig: s.revertConfigFile,
            parsedConfig: s.parsedConfig,
            onUpdateConfigValue: s.updateConfigValue,
            onAddConfigArrayItem: s.addConfigArrayItem,
            onAddConfigField: s.addConfigField,
            onRemoveConfigAt: s.removeConfigAt,
            onMoveConfigArrayItem: s.moveConfigArrayItem,
            onDuplicateConfigAt: s.duplicateConfigAt,
            configSearch: s.configSearch,
            onConfigSearchChange: s.setConfigSearch,
            configDirty: s.configDirty,
            canUndoConfig: s.canUndoConfig,
            onUndoConfig: s.undoConfigChange,
          }}
          ingestResult={s.ingestResult}
          ingesting={s.ingesting}
          ingestError={s.ingestError}
          packLoaded={s.packLoaded}
        />
      ) : (
        <Launcher
          projects={s.projects}
          selectedProject={s.selectedProject}
          onSelectProject={s.selectProject}
          onOpenProject={s.openPack}
          onRefresh={s.loadProjects}
          onOpenPrism={s.openPrismLauncher}
          onImport={() => s.setShowImport(true)}
          onNewProject={() => s.setShowWizard(true)}
          onDeleteProject={() => s.setConfirmCloseProject(true)}
        />
      )}

      <WizardStepper
        show={s.showWizard}
        onClose={() => s.setShowWizard(false)}
        onCreate={s.handleCreateProject}
      />

      <ImportModal
        show={s.showImport}
        onClose={s.handleCloseImport}
        importPath={s.importPath}
        onImportPathChange={s.setImportPath}
        importResult={s.importResult}
        isImporting={s.isImporting}
        importError={s.importError}
        onPickPath={s.pickImportPath}
        onImport={s.importPack}
        onDone={s.handleImportDone}
      />

      <ExportModal
        show={s.showExport}
        onClose={s.handleCloseExport}
        projectName={deleteTarget?.name}
        exportError={s.exportError}
        exportPath={s.exportPath}
        isExporting={s.isExporting}
        onExportMrpack={s.exportMrpack}
        onExportCurseforge={s.exportCurseforge}
      />

      <DeleteConfirmModal
        show={s.confirmCloseProject}
        projectName={deleteTarget?.name}
        onCancel={s.handleCloseDelete}
        onConfirm={s.handleConfirmDelete}
      />

      <LeavePackModal
        show={s.showLeavePack}
        onSave={s.saveAndClosePack}
        onDiscard={s.discardAndClosePack}
        onCancel={s.cancelLeavePack}
      />

      <LoadPackModal
        show={s.showLoadPack}
        onClose={s.dismissLoadModal}
        progress={s.loadPackProgress}
      />
    </div>
  )
}

export default App
