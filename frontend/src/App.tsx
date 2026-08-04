import './App.css'
import { useEffect } from 'react'
import logo from './assets/logo.png'
import { ToastProvider } from './components/ui/Toast'
import { ErrorBoundary } from './components/ui/ErrorBoundary'
import { Sidebar } from './components/common/sidebar'
import { ProjectWorkspace } from './components/common/ProjectWorkspace'
import { NewProjectModal, ImportModal, ExportModal, DeleteConfirmModal } from './components/common/modals'
import { useAppState } from './hooks/useAppState'
import { HistoryProvider, useHistory } from './hooks/history-provider'
import { saveQuestGraph } from './services/quest'
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

  useEffect(() => {
    history.attachProject(s.selectedProject?.id ?? null)
  }, [history, s.selectedProject?.id])

  // Cross-tool undo routing: when a history step targets an editor that may be
  // unmounted, persist the restored snapshot canonically and switch tabs so a
  // reload shows the restored state.
  useEffect(() => {
    const projectId = s.selectedProject?.id ?? null
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
  }, [history, s.selectedProject?.id, s.activeTab, s.handleTabChange])

  return (
    <div className="app">
          <Sidebar
            projects={s.projects}
            selectedProject={s.selectedProject}
            onSelectProject={s.setSelectedProject}
            onOpenPrism={s.openPrismLauncher}
            onRefresh={s.loadProjects}
            onImport={() => s.setShowImport(true)}
            onNewProject={() => s.setShowNewProject(true)}
          />

          <main className="main-content">
            <NewProjectModal
              show={s.showNewProject}
              onClose={() => s.setShowNewProject(false)}
              projectName={s.newProjectName}
              onProjectNameChange={s.setNewProjectName}
              mcVersion={s.mcVersion}
              onMcVersionChange={s.setMcVersion}
              modLoader={s.modLoader}
              onModLoaderChange={s.setModLoader}
              onCreate={s.handleCreateProject}
            />

            {s.selectedProject ? (
              <ProjectWorkspace
                project={s.selectedProject}
                wsStatus={s.wsStatus}
                activeTab={s.activeTab}
                onTabChange={s.handleTabChange}
                onRestartWebSocket={s.restartWebSocket}
                deployCompanionMessage={s.deployCompanionMessage}
                isTesting={s.isTesting}
                testProgress={s.testProgress}
                testError={s.testError}
                onSave={s.handleSaveProject}
                onTest={s.handleTestProject}
                onDeployCompanion={s.handleDeployCompanion}
                onExport={() => s.setShowExport(true)}
                onDelete={() => s.setConfirmCloseProject(true)}
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
                  project: s.selectedProject,
                  onScanInstanceMods: s.handleScanInstanceMods,
                  onLoadDependencies: s.loadModMetadata,
                  onCheckCompat: s.handleCheckCompat,
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
                  searchSource: s.searchSource,
                  onSearchSourceChange: s.setSearchSource,
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
                loadPackProgress={s.loadPackProgress}
                showLoadPack={s.showLoadPack}
                setShowLoadPack={s.setShowLoadPack}
                onLoadPack={() => s.loadPack(s.selectedProject!)}
                onClosePack={s.closePack}
              />
            ) : (
              <div className="welcome">
                <div className="welcome-content">
                  <img className="welcome-logo" src={logo} alt="ModCanvas logo" />
                  <h2>Welcome to ModCanvas</h2>
                  <p>Select a project or create a new one to get started.</p>
                </div>
              </div>
            )}
          </main>

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
            projectName={s.selectedProject?.name}
            exportError={s.exportError}
            exportPath={s.exportPath}
            isExporting={s.isExporting}
            onExportMrpack={s.exportMrpack}
            onExportCurseforge={s.exportCurseforge}
          />

          <DeleteConfirmModal
            show={s.confirmCloseProject}
            projectName={s.selectedProject?.name}
            onCancel={s.handleCloseDelete}
            onConfirm={s.handleConfirmDelete}
          />
        </div>
  )
}

export default App
