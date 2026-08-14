import { useCallback, useMemo, useState } from 'react'
import { ErrorBoundary } from '../ui/ErrorBoundary'
import { ModRow } from './rows'
import { ModsTabCompatPanel } from './ModsTabCompatPanel'
import { openPrismForProject } from '../../services/project'
import type {
  CompatibilityInstall,
  CompatibilityResult,
} from '../../services/types'

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
  onToggleMod: (mod: any) => Promise<void>
  onRemoveMod: (modId: string) => Promise<void>
  modMetadata: Map<string, ModMetadata>
  projectModsForDeps: any[]
  getMissingDependencies: (modId: string) => Array<{ mod_id: string; dependency_type: string }>
  getModNameById: (modId: string) => string
  /** One-click install of a missing dependency shown in the compat panel. */
  onInstallMissing: (install: CompatibilityInstall) => Promise<void>
  /** Mod ids currently being installed from the compat panel. */
  installingMissing: Set<string>
  /** Install every missing dependency the check resolved, in one pass. */
  onInstallAllMissing: () => Promise<void>
}

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
                onClick={() => props.project && openPrismForProject(props.project.id)}
                disabled={!props.project}
                title="Open Prism Launcher on this pack — Prism's downloader handles versions and dependencies"
              >
                Add mods in Prism
              </button>
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
            <ModsTabCompatPanel
              result={props.compatResult}
              onClose={props.onCompatResultClose}
              onInstallMissing={props.onInstallMissing}
              installingMissing={props.installingMissing}
              onInstallAllMissing={props.onInstallAllMissing}
            />
          )}

          <div className="mod-list">
            {props.projectMods.length === 0 ? (
              <div className="empty-state">No mods in this project yet. Add mods in Prism (the button above), or drop jars into the pack's mods folder, then scan.</div>
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
      </div>
    </ErrorBoundary>
  )
}
