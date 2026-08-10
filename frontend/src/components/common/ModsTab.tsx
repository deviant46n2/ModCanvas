import { useCallback, useMemo, useState } from 'react'
import { ErrorBoundary } from '../ui/ErrorBoundary'
import { List } from 'react-window'
import { ModRow, SearchResultRow, type SearchResultRowExtraProps } from './rows'
import { CategorySelect, CategorySourceHint } from './CategorySelect'
import { SourceToggles, type ModSource } from './SourceToggles'

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
  icon: string | null
  source: 'modrinth' | 'curseforge'
  mismatch?: string | null
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
  searchSources: ModSource[]
  onSearchSourcesChange: (sources: ModSource[]) => void
  searchCategory: string
  onSearchCategoryChange: (category: string) => void
  installingIds: Set<string>
}

const SEARCH_ROW_HEIGHT = 48

export function ModsTab(props: ModsTabProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  const toggleSelect = useCallback((modId: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(modId)) {
        next.delete(modId)
      } else {
        next.add(modId)
      }
      return next
    })
  }, [])

  const allFilteredSelected = useMemo(
    () => props.filteredMods.length > 0 && props.filteredMods.every(m => selectedIds.has(m.mod_id)),
    [props.filteredMods, selectedIds]
  )

  const toggleSelectAll = useCallback(() => {
    setSelectedIds(prev => {
      if (props.filteredMods.every(m => prev.has(m.mod_id))) return new Set()
      return new Set(props.filteredMods.map(m => m.mod_id))
    })
  }, [props.filteredMods])

  const clearSelection = useCallback(() => setSelectedIds(new Set()), [])

  const selectedCount = useMemo(
    () => props.filteredMods.filter(m => selectedIds.has(m.mod_id)).length,
    [props.filteredMods, selectedIds]
  )

  const bulkSetEnabled = useCallback(async (enabled: boolean) => {
    const targets = props.filteredMods.filter(m => selectedIds.has(m.mod_id) && m.enabled !== enabled)
    for (const mod of targets) {
      await props.onToggleMod(mod)
    }
    clearSelection()
  }, [props.filteredMods, selectedIds, props.onToggleMod, clearSelection])

  const handleSearchMods = () => {
    props.onSearchMods()
  }

  const canSearch = props.searchSources.length > 0
  const searchPlaceholder = !canSearch
    ? 'Select a source to search'
    : props.searchSources.length === 1
      ? `Search mods on ${props.searchSources[0] === 'modrinth' ? 'Modrinth' : 'CurseForge'}...`
      : 'Search mods...'

  return (
    <ErrorBoundary>
      <div className="mods-panel" id="tabpanel-mods" role="tabpanel" aria-labelledby="tab-mods">
        <div className="mods-section">
          <div className="section-header">
            <div className="section-title">
              <input
                type="checkbox"
                className="select-all-check"
                checked={allFilteredSelected}
                onChange={toggleSelectAll}
                aria-label="Select all visible mods"
              />
              <h3>Project Mods ({props.projectMods.length})</h3>
            </div>
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

          {selectedCount > 0 && (
            <div className="bulk-bar" role="toolbar" aria-label="Bulk mod actions">
              <span className="bulk-count">{selectedCount} selected</span>
              <div className="bulk-actions">
                <button className="btn-secondary btn-sm" onClick={() => bulkSetEnabled(true)} disabled={props.isLoadingMetadata}>
                  Enable selected
                </button>
                <button className="btn-secondary btn-sm" onClick={() => bulkSetEnabled(false)} disabled={props.isLoadingMetadata}>
                  Disable selected
                </button>
              </div>
              <button className="bulk-clear" onClick={clearSelection} aria-label="Clear selection" title="Clear selection">
                {'\u00D7'}
              </button>
            </div>
          )}

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

          <div className="mod-list">
            {props.projectMods.length === 0 ? (
              <div className="empty-state">No mods in this project yet. Search and add mods below.</div>
            ) : props.filteredMods.length === 0 ? (
              <div className="empty-state">No mods match your filter.</div>
            ) : (
              <ModRow
                filteredMods={props.filteredMods}
                modMetadata={props.modMetadata}
                projectMods={props.projectModsForDeps}
                getMissingDependencies={props.getMissingDependencies}
                toggleModEnabled={props.onToggleMod}
                removeModFromProject={props.onRemoveMod}
                getModNameById={props.getModNameById}
                selectedIds={selectedIds}
                onToggleSelect={toggleSelect}
              />
            )}
          </div>
        </div>

        <div className="mods-section">
          <div className="section-header">
            <h3>Add Mods</h3>
            <SourceToggles sources={props.searchSources} onChange={props.onSearchSourcesChange} />
          </div>
          <div className="search-bar">
            <input
              type="text"
              placeholder={searchPlaceholder}
              value={props.searchQuery}
              onChange={(e) => props.onSearchQueryChange(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && canSearch && props.onSearchMods()}
              aria-label={canSearch ? 'Search mods' : 'Select a source to search'}
              disabled={!canSearch}
            />
            <CategorySelect
              value={props.searchCategory}
              onChange={props.onSearchCategoryChange}
              disabled={!canSearch}
            />
            <button onClick={handleSearchMods} aria-label="Search" disabled={!canSearch}>
              Search
            </button>
          </div>
          {!canSearch && (
            <div className="search-empty-hint" role="status">
              Select at least one source to search.
            </div>
          )}
          <CategorySourceHint categoryActive={!!props.searchCategory} curseForgeActive={props.searchSources.includes('curseforge')} />
          <div className="search-results">
            {props.searchResults.length > 0 && (
              <List<SearchResultRowExtraProps>
                style={{ height: '100%', width: '100%' }}
                rowComponent={SearchResultRow}
                rowCount={props.searchResults.length}
                rowHeight={SEARCH_ROW_HEIGHT}
                rowProps={{
                  searchResults: props.searchResults,
                  projectMods: props.projectModsForDeps,
                  addModToProject: props.onAddMod,
                  installingIds: props.installingIds,
                }}
              />
            )}
          </div>
        </div>
      </div>
    </ErrorBoundary>
  )
}
