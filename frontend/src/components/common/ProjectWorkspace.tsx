import { ErrorBoundary } from '../ui/ErrorBoundary'
import { CanvasThemeProvider } from '../theme/theme-provider'
import { TopBar } from './topbar'
import { WorkspaceStatusBar } from './statusbar'
import { ModsTab, type ModsTabProps } from './ModsTab'
import { ConfigsTab, type ConfigsTabProps } from './ConfigsTab'
import { HistoryDrawer } from '../history/HistoryDrawer'
import ProgressionGraph from '../../ProgressionGraph'
import QuestBookEditor from '../../QuestBookEditor'
import RecipeEditor from '../../RecipeEditor'
import { LoadPackModal } from './LoadPackModal'
import type { WsConnectionStatus, IngestResult } from '../../services/api'
import type { LoadPackProgress } from '../../services/types'


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
  wsStatus: WsConnectionStatus
  activeTab: 'mods' | 'configs' | 'progression' | 'quests' | 'recipes'
  onTabChange: (tab: 'mods' | 'configs' | 'progression' | 'quests' | 'recipes') => void
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

  modsTab: ModsTabProps
  configsTab: ConfigsTabProps

  ingestResult: IngestResult | null
  ingesting: boolean
  ingestError: string

  packLoaded: boolean
  loadPackProgress: LoadPackProgress
  showLoadPack: boolean
  setShowLoadPack: (show: boolean) => void
  onLoadPack: () => void
  onClosePack: () => void
}

export function ProjectWorkspace(props: ProjectWorkspaceProps) {
  const { 
    activeTab, 
    onTabChange, 
    project, 
    ingestResult,
    packLoaded,
    loadPackProgress,
    showLoadPack,
    setShowLoadPack,
    onLoadPack,
    onClosePack,
  } = props

  // Tabs are always navigable (all panels stay mounted and handle their own
  // empty state), so no disabled gating is needed here.
  const tabsDisabled = false

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
        onLoadPack={onLoadPack}
        onClosePack={onClosePack}
      />

            <div className="workspace-tabs" role="tablist">        {(['mods', 'configs', 'progression', 'quests', 'recipes'] as const).map((tab) => (
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

      <HistoryDrawer />

      {!packLoaded && activeTab === 'mods' && (
        <div className="load-pack-prompt">
          <div className="prompt-content">
            <h3>Load Modpack</h3>
            <p>Click "Load Pack" to scan textures, import FTB Quests, and load mods from the instance.</p>
            <button className="btn-primary" onClick={onLoadPack} disabled={props.ingesting}>
              {props.ingesting ? 'Loading...' : 'Load Pack'}
            </button>
          </div>
        </div>
      )}

      <div className="workspace-content">
        {/* All tabs stay mounted so switching never re-runs their load effects
            (texture scans, quest graph, config reads). Inactive panels are
            hidden via CSS rather than unmounted. */}
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
                wsConnected={props.wsStatus.connected}
                ingestResult={ingestResult}
                packLoaded={packLoaded}
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

      <WorkspaceStatusBar
        wsStatus={props.wsStatus}
        onRestartWebSocket={props.onRestartWebSocket}
        isTesting={props.isTesting}
        testProgress={props.testProgress}
        testError={props.testError}
        deployCompanionMessage={props.deployCompanionMessage}
      />

      <LoadPackModal
        show={showLoadPack}
        onClose={() => setShowLoadPack(false)}
        progress={loadPackProgress}
      />
    </div>
  )
}
