import { ErrorBoundary } from '../ui/ErrorBoundary'
import { CanvasThemeProvider } from '../theme/theme-provider'
import { TopBar } from './topbar'
import { ModsTab, type ModsTabProps } from './ModsTab'
import { ConfigsTab, type ConfigsTabProps } from './ConfigsTab'
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
  onRefreshWsStatus: () => void
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

  const tabsDisabled = !packLoaded && activeTab !== 'mods'

  return (
    <div className="project-workspace">
      <TopBar
        projectName={project.name}
        minecraftVersion={project.minecraft_version}
        modLoader={project.mod_loader}
        packVersion={project.pack_version}
        wsStatus={props.wsStatus}
        onRefreshWsStatus={props.onRefreshWsStatus}
        onRestartWebSocket={props.onRestartWebSocket}
        deployCompanionMessage={props.deployCompanionMessage}
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

      {props.testProgress && (
        <div className="launch-progress">
          <div className="progress-phase">{props.testProgress}</div>
        </div>
      )}

      {props.testError && (
        <div className="launch-error">
          <div className="error-header">
            <strong>Test Error:</strong>
            <button className="btn-copy" onClick={() => navigator.clipboard.writeText(props.testError)} aria-label="Copy error text">Copy</button>
          </div>
          <pre className="copyable">{props.testError}</pre>
        </div>
      )}

      <div className="workspace-tabs" role="tablist">
        {(['mods', 'configs', 'progression', 'quests', 'recipes'] as const).map((tab) => (
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
        {activeTab === 'mods' && <ModsTab {...props.modsTab} />}
        {activeTab === 'configs' && packLoaded && <ConfigsTab {...props.configsTab} />}
        {activeTab === 'progression' && packLoaded && (
          <ErrorBoundary>
            <div id="tabpanel-progression" role="tabpanel" aria-labelledby="tab-progression">
              <ProgressionGraph projectId={project.id} />
            </div>
          </ErrorBoundary>
        )}
        {activeTab === 'quests' && packLoaded && (
          <ErrorBoundary>
            <div id="tabpanel-quests" role="tabpanel" aria-labelledby="tab-quests">
              <CanvasThemeProvider>
                <QuestBookEditor 
                  projectId={project.id} 
                  projectPath={project.path} 
                  wsConnected={props.wsStatus.connected}
                  ingestResult={ingestResult}
                  packLoaded={packLoaded}
                />
              </CanvasThemeProvider>
            </div>
          </ErrorBoundary>
        )}
        {activeTab === 'recipes' && packLoaded && (
          <ErrorBoundary>
            <div id="tabpanel-recipes" role="tabpanel" aria-labelledby="tab-recipes">
              <RecipeEditor projectId={project.id} projectPath={project.path} />
            </div>
          </ErrorBoundary>
        )}
        {(!packLoaded && activeTab !== 'mods') && (
          <div className="workspace-placeholder">
            <p>Load the pack first to access this tab</p>
          </div>
        )}
      </div>

      <LoadPackModal
        show={showLoadPack}
        onClose={() => setShowLoadPack(false)}
        progress={loadPackProgress}
      />
    </div>
  )
}
