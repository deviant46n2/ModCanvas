import { useState } from 'react'
import { type RowComponentProps } from 'react-window'

interface ModMetadata {
  mod_id: string
  slug: string
  name: string
  description: string
  author: string
  categories: string[]
  dependencies: ModDependency[]
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

interface ModDependency {
  mod_id: string
  dependency_type: string
}

interface ConfigFileInfo {
  path: string
  name: string
  format: string
  size: number
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function sourceKey(source?: string | null): string {
  if (!source) return 'local'
  const s = source.toLowerCase()
  if (s.includes('modrinth')) return 'modrinth'
  if (s.includes('curse')) return 'curseforge'
  return 'local'
}

/** Small rounded thumbnail with a graceful monogram fallback. */
function ModThumb({ icon, name, size = 28 }: { icon?: string | null; name: string; size?: number }) {
  const [failed, setFailed] = useState(false)
  const showImage = !!icon && !failed
  return (
    <span className={`mod-thumb${showImage ? '' : ' mod-thumb-fallback'}`} style={{ width: size, height: size, borderRadius: 6 }}>
      {showImage ? (
        <img src={icon as string} alt="" draggable={false} onError={() => setFailed(true)} />
      ) : (
        <span className="mod-thumb-letter">{name ? name.charAt(0).toUpperCase() : '?'}</span>
      )}
    </span>
  )
}

export interface ModRowExtraProps {
  filteredMods: any[]
  modMetadata: Map<string, ModMetadata>
  projectMods: any[]
  getMissingDependencies: (modId: string) => ModDependency[]
  toggleModEnabled: (mod: any) => Promise<void>
  removeModFromProject: (modId: string) => Promise<void>
  getModNameById: (modId: string) => string
  selectedIds: ReadonlySet<string>
  onToggleSelect: (modId: string) => void
}

export function ModRow({
  filteredMods,
  modMetadata,
  getMissingDependencies,
  toggleModEnabled,
  removeModFromProject,
  getModNameById,
  selectedIds,
  onToggleSelect,
}: ModRowExtraProps) {
  return (
    <div className="mod-grid">
      {filteredMods.map((mod) => {
        const meta = modMetadata.get(mod.mod_id)
        const missingDeps = getMissingDependencies(mod.mod_id)
        const selected = selectedIds.has(mod.mod_id)
        const depCount = meta?.dependencies?.length ?? 0
        const downloads = typeof mod.downloads === 'number' ? mod.downloads : meta?.downloads ?? 0
        const description = mod.description || meta?.description || ''
        const icon = mod.icon ?? meta?.icon ?? null

        return (
          <div
            key={mod.mod_id}
            className={`mod-card-grid ${!mod.enabled ? 'disabled' : ''} ${missingDeps.length > 0 ? 'has-missing-deps' : ''} ${selected ? 'selected' : ''}`}
          >
            <div className="mod-card-grid-head">
              <input
                type="checkbox"
                className="mod-row-checkbox"
                checked={selected}
                onChange={() => onToggleSelect(mod.mod_id)}
                aria-label={`Select ${mod.name}`}
              />
              <ModThumb icon={icon} name={mod.name} size={36} />
              <div className="mod-card-grid-title">
                <span className="mod-row-name">{mod.name}</span>
                <span className="mod-row-author">{mod.author || meta?.author || ''}</span>
              </div>
              <button
                className={`btn-toggle ${mod.enabled ? 'enabled' : 'disabled'}`}
                onClick={() => toggleModEnabled(mod)}
                title={mod.enabled ? 'Disable' : 'Enable'}
                aria-pressed={mod.enabled}
              >
                {mod.enabled ? 'ON' : 'OFF'}
              </button>
            </div>
            <div className="mod-card-grid-desc">{description}</div>
            <div className="mod-card-grid-meta">
              <span className={`source-badge ${sourceKey(mod.source)}`}>{mod.source || 'Local'}</span>
              {mod.version && <span className="mod-row-chip">v{mod.version}</span>}
              {downloads > 0 && <span className="mod-row-chip">{downloads.toLocaleString()} dl</span>}
              {depCount > 0 && <span className="mod-row-chip">{depCount} deps</span>}
              {meta && meta.categories?.length > 0 && (
                <span className="mod-row-chip mod-row-cats" title={meta.categories.join(', ')}>
                  {meta.categories.slice(0, 2).join(', ')}
                </span>
              )}
              {missingDeps.length > 0 && (
                <span
                  className="mod-row-warn"
                  title={`Missing required: ${missingDeps.map((d) => getModNameById(d.mod_id)).join(', ')}`}
                >
                  !
                </span>
              )}
              <span className="mod-card-grid-actions">
                <button
                  className="btn-remove"
                  onClick={() => removeModFromProject(mod.mod_id)}
                  title="Remove mod"
                  aria-label={`Remove ${mod.name}`}
                >
                  {'\u00D7'}
                </button>
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

export interface ConfigRowExtraProps {
  configFiles: ConfigFileInfo[]
  selectedConfig: ConfigFileInfo | null
  openConfigFile: (file: ConfigFileInfo) => Promise<void>
}

export function ConfigFileRow({
  index,
  style,
  configFiles,
  selectedConfig,
  openConfigFile,
}: RowComponentProps<ConfigRowExtraProps>) {
  const file = configFiles[index]
  return (
    <div style={style}>
      <div
        className={`config-file-item ${selectedConfig?.path === file.path ? 'active' : ''}`}
        onClick={() => openConfigFile(file)}
      >
        <div className="config-file-name">{file.name}</div>
        <div className="config-file-meta">{file.format} &bull; {formatFileSize(file.size)}</div>
      </div>
    </div>
  )
}

export interface SearchResultRowExtraProps {
  searchResults: ModMetadata[]
  projectMods: any[]
  addModToProject: (mod: any) => Promise<void>
  installingIds: Set<string>
}

export function SearchResultRow({
  index,
  style,
  searchResults,
  projectMods,
  addModToProject,
  installingIds,
}: RowComponentProps<SearchResultRowExtraProps>) {
  const mod = searchResults[index]
  const isAdded = projectMods.some(m => m.mod_id === mod.mod_id)
  const isInstalling = installingIds.has(mod.mod_id)
  return (
    <div style={style} className="mod-row-wrap">
      <div className={`mod-row ${isAdded || isInstalling ? 'disabled' : ''}`}>
        <ModThumb icon={mod.icon ?? null} name={mod.name} />
        <div className="mod-row-main">
          <div className="mod-row-title">
            <span className="mod-row-name">{mod.name}</span>
            {mod.author && <span className="mod-row-author">{mod.author}</span>}
          </div>
          <div className="mod-row-desc">{mod.description}</div>
        </div>
        <div className="mod-row-meta">
          <span className={`source-badge ${mod.source}`}>{mod.source}</span>
          {mod.downloads > 0 && <span className="mod-row-chip">{mod.downloads.toLocaleString()} dl</span>}
          {mod.mismatch && (
            <span className="mod-row-warn mod-row-warn-text" title={mod.mismatch}>
              diff version
            </span>
          )}
          {mod.categories?.length > 0 && (
            <span className="mod-row-chip mod-row-cats" title={mod.categories.join(', ')}>
              {mod.categories.slice(0, 2).join(', ')}
            </span>
          )}
        </div>
        <div className="mod-row-actions">
          <button
            className={`btn-add ${isAdded || isInstalling || !!mod.mismatch ? 'added' : ''}`}
            onClick={() => !isAdded && !isInstalling && !mod.mismatch && addModToProject(mod)}
            disabled={isAdded || isInstalling || !!mod.mismatch}
            title={mod.mismatch || undefined}
            aria-label={isAdded ? `${mod.name} already added` : isInstalling ? `Installing ${mod.name}` : mod.mismatch ? `${mod.name} unavailable: ${mod.mismatch}` : `Add ${mod.name}`}
          >
            {isInstalling ? 'Installing...' : isAdded ? 'Added' : mod.mismatch ? 'Unavailable' : '+ Add'}
          </button>
        </div>
      </div>
    </div>
  )
}
