import { useMemo, useState } from 'react'
import { ErrorBoundary } from '../ui/ErrorBoundary'
import { List } from 'react-window'
import { ConfigFileRow, type ConfigRowExtraProps } from './rows'
import { ConfigValueEditor, type ConfigValue, type ParsedConfig, type ConfigFileInfo } from './config-editor'
import { GuidedConfigWizard, type GuidedConfigTarget } from './GuidedConfigWizard'

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
  onRevertConfig: () => void
  parsedConfig: ParsedConfig | null
  onUpdateConfigValue: (path: string[], value: ConfigValue) => void
  onAddConfigArrayItem: (path: string[]) => void
  onAddConfigField: (path: string[]) => void
  onRemoveConfigAt: (path: string[]) => void
  onMoveConfigArrayItem: (arrayPath: string[], from: number, to: number) => void
  onDuplicateConfigAt: (path: string[]) => void
  configSearch: string
  onConfigSearchChange: (value: string) => void
  configDirty: boolean
  canUndoConfig: boolean
  onUndoConfig: () => void
}

export function ConfigsTab(props: ConfigsTabProps) {
  const [editorSearch, setEditorSearch] = useState('')
  const [collapsedAll, setCollapsedAll] = useState(false)
  const [showGuidedConfig, setShowGuidedConfig] = useState(false)

  const filteredFiles = useMemo(() => {
    const q = props.configSearch.trim().toLowerCase()
    if (!q) return props.configFiles
    return props.configFiles.filter(
      (f) => f.name.toLowerCase().includes(q) || f.path.toLowerCase().includes(q),
    )
  }, [props.configFiles, props.configSearch])

  const showDirtyHint =
    props.configMode === 'structured'
      ? props.configDirty && !!props.parsedConfig
      : props.configDirty

  return (
    <ErrorBoundary>
      <div className="configs-panel" id="tabpanel-configs" role="tabpanel" aria-labelledby="tab-configs">
        <div className="configs-sidebar">
          <div className="section-header">
            <h3>Config Files ({props.configFiles.length})</h3>
            <button
              type="button"
              className="btn-secondary btn-sm"
              onClick={() => setShowGuidedConfig(true)}
              title="Guided config tweak — search a setting by plain words, edit it, save"
            >
              ✨ Add a tweak
            </button>
          </div>
          <input
            type="text"
            className="config-search"
            placeholder="Search files..."
            value={props.configSearch}
            onChange={(e) => props.onConfigSearchChange(e.target.value)}
          />
          <div className="config-file-list" style={{ height: 'calc(100vh - 340px)' }}>
            {filteredFiles.length === 0 ? (
              <div className="empty-state">
                {props.configFiles.length === 0
                  ? 'No config files found. Import a modpack to get config files.'
                  : 'No files match your search.'}
              </div>
            ) : (
              <List<ConfigRowExtraProps>
                style={{ height: '100%', width: '100%' }}
                rowComponent={ConfigFileRow}
                rowCount={filteredFiles.length}
                rowHeight={60}
                rowProps={{
                  configFiles: filteredFiles,
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
                <span className="config-editor-filename">
                  {props.selectedConfig.name}
                  {showDirtyHint && <span className="config-dirty-dot" title="Unsaved changes" />}
                </span>
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
                  {props.configMode === 'structured' && props.parsedConfig && (
                    <button
                      className="btn-secondary btn-sm"
                      onClick={() => {
                        setCollapsedAll((v) => !v)
                        setEditorSearch('')
                      }}
                      title="Collapse or expand all sections"
                    >
                      {collapsedAll ? 'Expand all' : 'Collapse all'}
                    </button>
                  )}
                  {props.configMode === 'structured' && props.canUndoConfig && (
                    <button className="btn-secondary btn-sm" onClick={props.onUndoConfig}>
                      Undo
                    </button>
                  )}
                  <button
                    className="btn-secondary btn-sm"
                    onClick={props.onRevertConfig}
                    disabled={!showDirtyHint}
                    title="Discard changes and reload from disk"
                  >
                    Revert
                  </button>
                  <button className="btn-primary btn-sm" onClick={props.onSaveConfig} disabled={props.configSaving}>
                    {props.configSaving ? 'Saving...' : 'Save'}
                  </button>
                </div>
              </div>
              {props.configMode === 'structured' && props.parsedConfig ? (
                <>
                  <input
                    type="text"
                    className="config-search config-editor-search"
                    placeholder="Search keys and values..."
                    value={editorSearch}
                    onChange={(e) => setEditorSearch(e.target.value)}
                  />
                  <div className="config-structured-editor" key={collapsedAll ? 'collapsed' : 'expanded'}>
                    {props.parsedConfig.root.type === 'object' || props.parsedConfig.root.type === 'group' ? (
                      Object.entries(props.parsedConfig.root.fields || {}).map(([key, val]) => (
                        <ConfigValueEditor
                          key={key}
                          value={val}
                          path={[key]}
                          onChange={props.onUpdateConfigValue}
                          query={editorSearch}
                          collapsed={collapsedAll}
                          onAddArrayItem={props.onAddConfigArrayItem}
                          onAddField={props.onAddConfigField}
                          onRemoveAt={props.onRemoveConfigAt}
                          onMoveArrayItem={props.onMoveConfigArrayItem}
                          onDuplicateAt={props.onDuplicateConfigAt}
                        />
                      ))
                    ) : (
                      <ConfigValueEditor
                        value={props.parsedConfig.root}
                        path={['root']}
                        onChange={props.onUpdateConfigValue}
                        query={editorSearch}
                        collapsed={collapsedAll}
                        onAddArrayItem={props.onAddConfigArrayItem}
                        onAddField={props.onAddConfigField}
                        onRemoveAt={props.onRemoveConfigAt}
                        onMoveArrayItem={props.onMoveConfigArrayItem}
                        onDuplicateAt={props.onDuplicateConfigAt}
                      />
                    )}
                  </div>
                </>
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
      <GuidedConfigWizard
        open={showGuidedConfig}
        configFiles={props.configFiles}
        openFilePath={props.selectedConfig?.path ?? null}
        openRoot={props.parsedConfig?.root ?? null}
        onOpenFile={props.onOpenConfig}
        onApply={(target: GuidedConfigTarget) => {
          props.onUpdateConfigValue(target.path, target.value)
          props.onSaveConfig()
        }}
        onClose={() => setShowGuidedConfig(false)}
      />
    </ErrorBoundary>
  )
}
