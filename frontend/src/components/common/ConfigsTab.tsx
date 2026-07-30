import { ErrorBoundary } from '../ui/ErrorBoundary'
import { List } from 'react-window'
import { ConfigFileRow, type ConfigRowExtraProps } from './rows'
import { ConfigValueEditor, type ConfigValue, type ParsedConfig, type ConfigFileInfo } from './config-editor'

export interface ConfigsTabProps {
  configFiles: ConfigFileInfo[]
  selectedConfig: ConfigFileInfo | null
  onOpenConfig: (file: ConfigFileInfo) => Promise<void>
  configContent: string
  onConfigContentChange: (content: string) => void
  configMode: 'structured' | 'raw'
  onConfigModeChange: (mode: 'structured' | 'raw') => void
  configSaving: boolean
  onSaveConfig: () => void
  parsedConfig: ParsedConfig | null
  onUpdateConfigValue: (path: string[], value: ConfigValue) => void
  configUndoStack: ConfigValue[]
  onUndoConfig: () => void
}

export function ConfigsTab(props: ConfigsTabProps) {
  return (
    <ErrorBoundary>
      <div className="configs-panel" id="tabpanel-configs" role="tabpanel" aria-labelledby="tab-configs">
        <div className="configs-sidebar">
          <div className="section-header">
            <h3>Config Files ({props.configFiles.length})</h3>
          </div>
          <div className="config-file-list" style={{ height: 'calc(100vh - 300px)' }}>
            {props.configFiles.length === 0 ? (
              <div className="empty-state">No config files found. Import a modpack to get config files.</div>
            ) : (
              <List<ConfigRowExtraProps>
                style={{ height: '100%', width: '100%' }}
                rowComponent={ConfigFileRow}
                rowCount={props.configFiles.length}
                rowHeight={60}
                rowProps={{
                  configFiles: props.configFiles,
                  selectedConfig: props.selectedConfig,
                  openConfigFile: props.onOpenConfig,
                }}
              />
            )}
          </div>
        </div>
        <div className="config-editor">
          {props.selectedConfig ? (
            <>
              <div className="config-editor-header">
                <span className="config-editor-filename">{props.selectedConfig.name}</span>
                <div className="config-editor-actions">
                  {props.parsedConfig && (
                    <div className="config-mode-toggle">
                      <button
                        className={`btn-mode ${props.configMode === 'structured' ? 'active' : ''}`}
                        onClick={() => props.onConfigModeChange('structured')}
                      >
                        Structured
                      </button>
                      <button
                        className={`btn-mode ${props.configMode === 'raw' ? 'active' : ''}`}
                        onClick={() => props.onConfigModeChange('raw')}
                      >
                        Raw
                      </button>
                    </div>
                  )}
                  {props.configMode === 'structured' && props.configUndoStack.length > 0 && (
                    <button className="btn-secondary btn-sm" onClick={props.onUndoConfig}>
                      Undo
                    </button>
                  )}
                  <button className="btn-primary btn-sm" onClick={props.onSaveConfig} disabled={props.configSaving}>
                    {props.configSaving ? 'Saving...' : 'Save'}
                  </button>
                </div>
              </div>
              {props.configMode === 'structured' && props.parsedConfig ? (
                <div className="config-structured-editor">
                  {props.parsedConfig.root.type === 'object' || props.parsedConfig.root.type === 'group' ? (
                    Object.entries(props.parsedConfig.root.fields || {}).map(([key, val]) => (
                      <ConfigValueEditor
                        key={key}
                        value={val}
                        path={[key]}
                        onChange={props.onUpdateConfigValue}
                      />
                    ))
                  ) : (
                    <ConfigValueEditor
                      value={props.parsedConfig.root}
                      path={['root']}
                      onChange={props.onUpdateConfigValue}
                    />
                  )}
                </div>
              ) : (
                <textarea
                  className="config-editor-textarea"
                  value={props.configContent}
                  onChange={(e) => props.onConfigContentChange(e.target.value)}
                  spellCheck={false}
                />
              )}
            </>
          ) : (
            <div className="empty-state">Select a config file to edit.</div>
          )}
        </div>
      </div>
    </ErrorBoundary>
  )
}
