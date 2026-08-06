import { useEffect } from 'react'
import { ErrorBoundary } from '../ui/ErrorBoundary'
import { CanvasThemeProvider } from '../theme/theme-provider'
import { TopBar } from './topbar'
import { WorkspaceStatusBar } from './statusbar'
import { ModsTab, type ModsTabProps } from './ModsTab'
import { ConfigsTab, type ConfigsTabProps } from './ConfigsTab'
import ProgressionGraph from '../../ProgressionGraph'
import QuestBookEditor from '../../QuestBookEditor'
import RecipeEditor from '../../RecipeEditor'
import { PackHealthProvider } from './PackHealthProvider'
import { PackHealthTab } from './PackHealthTab'
import { usePackHealthStore } from '../../core/pack-health/pack-health-store'
import { getPackIcon } from '../../services/mods'
import { useConnectionPill } from '../../hooks/useConnectionPill'
import type { IngestResult } from '../../services/api'


export interface ProjectWorkspaceProps {
  project: {
    id: string
    name: string
    description: string
    minecraft_version: string
    mod_loader: string
    pack_version: string
    author: string
    created_at: string
    updated_at: string
    path: string
  }
  activeTab: 'mods' | 'configs' | 'progression' | 'quests' | 'recipes' | 'health'
  onTabChange: (tab: 'mods' | 'configs' | 'progression' | 'quests' | 'recipes' | 'health') => void
  onRestartWebSocket: () => void
  deployCompanionMessage: string
  isTesting: boolean
  testProgress: string
  testError: string
  onSave: () => void
  onTest: () => void
  onDeployCompanion: () => void
  onExport: () => void
  onDelete: () => void
  onBackToProjects: () => void
  onRefresh: () => void
  onForceReindex: () => void

  modsTab: ModsTabProps
  configsTab: ConfigsTabProps

  ingestResult: IngestResult | null
  ingesting: boolean
  ingestError: string

  packLoaded: boolean
}

export function ProjectWorkspace(props: ProjectWorkspaceProps) {
  const {
    activeTab,
    onTabChange,
    project,
    ingestResult,
    packLoaded,
  } = props
  const { view: connectionView, signals: connectionSignals } = useConnectionPill(project)

  // Tabs are always navigable (all panels stay mounted and handle their own
  // empty state), so no disabled gating is needed here.
  const tabsDisabled = false

  // Detect the pack's cover image once (pack.png / icon.png in the instance
  // root) and publish it to the health store. One call per load, never on
  // demand — feeds the pack-coverage check.
  const setHasCoverImage = usePackHealthStore((s) => s.setHasCoverImage)
  useEffect(() => {
    const instancePath = ingestResult?.active_instance || project.path
    if (!packLoaded || !instancePath) return
    let cancelled = false
    getPackIcon(instancePath)
      .then((url) => {
        if (!cancelled) setHasCoverImage(!!url)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [packLoaded, ingestResult?.active_instance, project.path, setHasCoverImage])

  // Clear stale health state the moment the pack is closed so a later project
  // never inherits another pack's quest graph / item registry.
  useEffect(() => {
    if (!packLoaded) {
      usePackHealthStore.setState({ questGraph: null, itemRegistry: null, hasCoverImage: false })
    }
  }, [packLoaded])

  return (
    <div className="project-workspace">
      <TopBar
        projectName={project.name}
        minecraftVersion={project.minecraft_version}
        modLoader={project.mod_loader}
        packVersion={project.pack_version}
        isTesting={props.isTesting}
        onSave={props.onSave}
        onTest={props.onTest}
        onDeployCompanion={props.onDeployCompanion}
        onExport={props.onExport}
        onDelete={props.onDelete}
        packLoaded={packLoaded}
        onBackToProjects={props.onBackToProjects}
        onRefresh={props.onRefresh}
        onForceReindex={props.onForceReindex}
        onClosePack={props.onBackToProjects}
      />

            <div className="workspace-tabs" role="tablist">        {(['health', 'mods', 'configs', 'progression', 'quests', 'recipes'] as const).map((tab) => (
          <button
            key={tab}
            id={`tab-${tab}`}
            role="tab"
            aria-selected={activeTab === tab}
            aria-controls={`tabpanel-${tab}`}
            className={`tab ${activeTab === tab ? 'active' : ''} ${tabsDisabled ? 'disabled' : ''}`}
            onClick={() => !tabsDisabled && onTabChange(tab)}
            disabled={tabsDisabled}
            title={tabsDisabled ? 'Load the pack first' : ''}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      <PackHealthProvider project={project} packLoaded={packLoaded}>
        <div className="workspace-content">
          {/* All tabs stay mounted so switching never re-runs their load effects
              (texture scans, quest graph, config reads). Inactive panels are
              hidden via CSS rather than unmounted. */}
          <div id="tabpanel-health" role="tabpanel" aria-labelledby="tab-health" className={activeTab === 'health' ? '' : 'tab-hidden'}>
            <ErrorBoundary>
              <PackHealthTab />
            </ErrorBoundary>
          </div>
          <div id="tabpanel-mods" role="tabpanel" aria-labelledby="tab-mods" className={activeTab === 'mods' ? '' : 'tab-hidden'}>
            <ModsTab {...props.modsTab} />
          </div>
          <div id="tabpanel-configs" role="tabpanel" aria-labelledby="tab-configs" className={activeTab === 'configs' ? '' : 'tab-hidden'}>
            <ConfigsTab {...props.configsTab} />
          </div>
          <div id="tabpanel-progression" role="tabpanel" aria-labelledby="tab-progression" className={activeTab === 'progression' ? '' : 'tab-hidden'}>
            <ErrorBoundary>
              <ProgressionGraph projectId={project.id} />
            </ErrorBoundary>
          </div>
          <div id="tabpanel-quests" role="tabpanel" aria-labelledby="tab-quests" className={activeTab === 'quests' ? '' : 'tab-hidden'}>
            <ErrorBoundary>
              <CanvasThemeProvider>
                <QuestBookEditor 
                  projectId={project.id} 
                  projectPath={project.path} 
                  minecraftVersion={project.minecraft_version}
                  modLoader={project.mod_loader}
                  wsConnected={connectionSignals.companionConnected}
                  ingestResult={ingestResult}
                  packLoaded={packLoaded}
                  onTest={props.onTest}
                  isTesting={props.isTesting}
                />
              </CanvasThemeProvider>
            </ErrorBoundary>
          </div>
          <div id="tabpanel-recipes" role="tabpanel" aria-labelledby="tab-recipes" className={activeTab === 'recipes' ? '' : 'tab-hidden'}>
            <ErrorBoundary>
              <RecipeEditor
                projectId={project.id}
                projectPath={project.path}
                minecraftVersion={project.minecraft_version}
                modLoader={project.mod_loader}
              />
            </ErrorBoundary>
          </div>
        </div>
      </PackHealthProvider>

      <WorkspaceStatusBar
        connection={connectionView}
        onRestartWebSocket={props.onRestartWebSocket}
        isTesting={props.isTesting}
        testProgress={props.testProgress}
        testError={props.testError}
        deployCompanionMessage={props.deployCompanionMessage}
      />
    </div>
  )
}
