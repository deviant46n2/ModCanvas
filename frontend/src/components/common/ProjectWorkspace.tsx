import { ErrorBoundary } from '../ui/ErrorBoundary'
import { CanvasThemeProvider } from '../theme/theme-provider'
import { TopBar } from './topbar'
import { ModsTab, type ModsTabProps } from './ModsTab'
import { ConfigsTab, type ConfigsTabProps } from './ConfigsTab'
import ProgressionGraph from '../../ProgressionGraph'
import QuestBookEditor from '../../QuestBookEditor'
import RecipeEditor from '../../RecipeEditor'
import type { WsConnectionStatus } from '../../services/api'


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
}

export function ProjectWorkspace(props: ProjectWorkspaceProps) {
  const { activeTab, onTabChange, project } = props

  return (
    <div className="project-workspace">
      <TopBar
        projectName={project.name}
        minecraftVersion={project.minecraft_version}
        modLoader={project.mod_loader}
        packVersion={project.pack_version}
        wsStatus={props.wsStatus}
        deployCompanionMessage={props.deployCompanionMessage}
        isTesting={props.isTesting}
        onSave={props.onSave}
        onTest={props.onTest}
        onDeployCompanion={props.onDeployCompanion}
        onExport={props.onExport}
        onDelete={props.onDelete}
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
            className={`tab ${activeTab === tab ? 'active' : ''}`}
            onClick={() => onTabChange(tab)}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      <div className="workspace-content">
        {activeTab === 'mods' && <ModsTab {...props.modsTab} />}
        {activeTab === 'configs' && <ConfigsTab {...props.configsTab} />}
        {activeTab === 'progression' && (
          <ErrorBoundary>
            <div id="tabpanel-progression" role="tabpanel" aria-labelledby="tab-progression">
              <ProgressionGraph projectId={project.id} />
            </div>
          </ErrorBoundary>
        )}
        {activeTab === 'quests' && (
          <ErrorBoundary>
            <div id="tabpanel-quests" role="tabpanel" aria-labelledby="tab-quests">
              <CanvasThemeProvider>
                <QuestBookEditor projectId={project.id} projectPath={project.path} wsConnected={props.wsStatus.connected} />
              </CanvasThemeProvider>
            </div>
          </ErrorBoundary>
        )}
        {activeTab === 'recipes' && (
          <ErrorBoundary>
            <div id="tabpanel-recipes" role="tabpanel" aria-labelledby="tab-recipes">
              <RecipeEditor projectId={project.id} projectPath={project.path} />
            </div>
          </ErrorBoundary>
        )}
      </div>
    </div>
  )
}
