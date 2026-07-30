import { ErrorBoundary } from '../ui/ErrorBoundary'
import { List } from 'react-window'
import { ModRow, SearchResultRow, type ModRowExtraProps, type SearchResultRowExtraProps } from './rows'

interface ModMetadata {
  mod_id: string
  slug: string
  name: string
  description: string
  author: string
  categories: string[]
  dependencies: Array<{ mod_id: string; dependency_type: string }>
  supported_loaders: string[]
  supported_versions: string[]
  downloads: number
  source_url: string | null
  issues_url: string | null
  documentation_url: string | null
}

interface CompatibilityIssue {
  severity: string
  message: string
  affected_mods: string[]
  affected_mod_names: string[]
}

interface CompatibilityResult {
  compatible: boolean
  issues: CompatibilityIssue[]
  warnings: string[]
}

export interface ModsTabProps {
  projectMods: any[]
  filteredMods: any[]
  modFilterInput: string
  onModFilterInputChange: (value: string) => void
  onDebouncedModFilter: (value: string) => void
  compatResult: CompatibilityResult | null
  onCompatResultClose: () => void
  isLoadingMetadata: boolean
  isCheckingCompat: boolean
  project: any
  onScanInstanceMods: () => void
  onLoadDependencies: () => void
  onCheckCompat: () => void
  searchQuery: string
  onSearchQueryChange: (q: string) => void
  onSearchMods: () => void
  searchResults: ModMetadata[]
  onAddMod: (mod: any) => Promise<void>
  onToggleMod: (mod: any) => Promise<void>
  onRemoveMod: (modId: string) => Promise<void>
  modMetadata: Map<string, ModMetadata>
  projectModsForDeps: any[]
  getMissingDependencies: (modId: string) => Array<{ mod_id: string; dependency_type: string }>
  getModNameById: (modId: string) => string
}

export function ModsTab(props: ModsTabProps) {
  return (
    <ErrorBoundary>
      <div className="mods-panel" id="tabpanel-mods" role="tabpanel" aria-labelledby="tab-mods">
        <div className="mods-section">
          <div className="section-header">
            <h3>Project Mods ({props.projectMods.length})</h3>
            <div className="section-actions">
              <button
                className="btn-secondary btn-sm"
                onClick={props.onScanInstanceMods}
                disabled={!props.project}
                title="Scan instance's mods folder and populate database"
              >
                Scan Instance Mods
              </button>
              <button
                className="btn-secondary btn-sm"
                onClick={props.onLoadDependencies}
                disabled={props.isLoadingMetadata || props.projectMods.length === 0}
              >
                {props.isLoadingMetadata ? 'Loading...' : 'Load Dependencies'}
              </button>
              <button
                className="btn-secondary btn-sm"
                onClick={props.onCheckCompat}
                disabled={props.isCheckingCompat || props.projectMods.length === 0}
              >
                {props.isCheckingCompat ? 'Checking...' : 'Check Compatibility'}
              </button>
              <input
                type="text"
                placeholder="Filter mods..."
                value={props.modFilterInput}
                onChange={(e) => {
                  props.onModFilterInputChange(e.target.value)
                  props.onDebouncedModFilter(e.target.value)
                }}
                className="mod-filter"
                aria-label="Filter mods"
              />
            </div>
          </div>

          {props.compatResult && (
            <div className={`compat-panel ${props.compatResult.compatible ? 'compatible' : 'has-issues'}`}>
              <div className="compat-header">
                <span className="compat-status">
                  {props.compatResult.compatible ? 'All checks passed' : `${props.compatResult.issues.length} issue(s) found`}
                </span>
                <button className="btn-close" onClick={props.onCompatResultClose} aria-label="Close compatibility results">{'\u00D7'}</button>
              </div>
              {props.compatResult.issues.length > 0 && (
                <div className="compat-issues">
                  {props.compatResult.issues.map((issue, i) => (
                    <div key={i} className={`compat-issue ${issue.severity.toLowerCase()}`}>
                      <span className="issue-severity">{issue.severity}</span>
                      <span className="issue-message">{issue.message}</span>
                      <span className="issue-mods">
                        {issue.affected_mod_names.join(' \u2194 ')}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              {props.compatResult.warnings.length > 0 && (
                <div className="compat-warnings">
                  {props.compatResult.warnings.map((warn, i) => (
                    <div key={i} className="compat-warning">{warn}</div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="mod-list" style={{ height: 'calc(100vh - 250px)' }}>
            {props.projectMods.length === 0 ? (
              <div className="empty-state">No mods in this project yet. Search and add mods below.</div>
            ) : props.filteredMods.length === 0 ? (
              <div className="empty-state">No mods match your filter.</div>
            ) : (
              <List<ModRowExtraProps>
                style={{ height: '100%', width: '100%' }}
                rowComponent={ModRow}
                rowCount={props.filteredMods.length}
                rowHeight={200}
                rowProps={{
                  filteredMods: props.filteredMods,
                  modMetadata: props.modMetadata,
                  projectMods: props.projectModsForDeps,
                  getMissingDependencies: props.getMissingDependencies,
                  toggleModEnabled: props.onToggleMod,
                  removeModFromProject: props.onRemoveMod,
                  getModNameById: props.getModNameById,
                }}
              />
            )}
          </div>
        </div>

        <div className="mods-section">
          <div className="section-header">
            <h3>Add Mods from Modrinth</h3>
          </div>
          <div className="search-bar">
            <input
              type="text"
              placeholder="Search mods on Modrinth..."
              value={props.searchQuery}
              onChange={(e) => props.onSearchQueryChange(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && props.onSearchMods()}
              aria-label="Search mods on Modrinth"
            />
            <button onClick={props.onSearchMods} aria-label="Search">Search</button>
          </div>
          <div className="search-results" style={{ height: 'calc(100vh - 480px)' }}>
            {props.searchResults.length > 0 && (
              <List<SearchResultRowExtraProps>
                style={{ height: '100%', width: '100%' }}
                rowComponent={SearchResultRow}
                rowCount={props.searchResults.length}
                rowHeight={80}
                rowProps={{
                  searchResults: props.searchResults,
                  projectMods: props.projectModsForDeps,
                  addModToProject: props.onAddMod,
                }}
              />
            )}
          </div>
        </div>
      </div>
    </ErrorBoundary>
  )
}
