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

export interface ModRowExtraProps {
  filteredMods: any[]
  modMetadata: Map<string, ModMetadata>
  projectMods: any[]
  getMissingDependencies: (modId: string) => ModDependency[]
  toggleModEnabled: (mod: any) => Promise<void>
  removeModFromProject: (modId: string) => Promise<void>
  getModNameById: (modId: string) => string
}

export function ModRow({
  index,
  style,
  filteredMods,
  modMetadata,
  projectMods,
  getMissingDependencies,
  toggleModEnabled,
  removeModFromProject,
  getModNameById,
}: RowComponentProps<ModRowExtraProps>) {
  const mod = filteredMods[index]
  const meta = modMetadata.get(mod.mod_id)
  const missingDeps = getMissingDependencies(mod.mod_id)
  return (
    <div style={style}>
      <div className={`mod-card ${!mod.enabled ? 'disabled' : ''} ${missingDeps.length > 0 ? 'has-missing-deps' : ''}`}>
        <div className="mod-card-header">
          <div className="mod-info">
            <div className="mod-name">{mod.name}</div>
            <div className="mod-author">{mod.author}</div>
          </div>
          <div className="mod-actions">
            <button
              className={`btn-toggle ${mod.enabled ? 'enabled' : 'disabled'}`}
              onClick={() => toggleModEnabled(mod)}
              title={mod.enabled ? 'Disable' : 'Enable'}
              aria-pressed={mod.enabled}
            >
              {mod.enabled ? 'ON' : 'OFF'}
            </button>
            <button
              className="btn-remove"
              onClick={() => removeModFromProject(mod.mod_id)}
              title="Remove mod"
              aria-label={`Remove ${mod.name}`}
            >
              {'\u00D7'}
            </button>
          </div>
        </div>
        <div className="mod-desc">{mod.description}</div>
        <div className="mod-meta">
          <span>{mod.source}</span>
          {mod.version && <span>v{mod.version}</span>}
          {meta && meta.categories.length > 0 && (
            <span className="mod-categories">{meta.categories.join(', ')}</span>
          )}
        </div>
        {meta && meta.dependencies.length > 0 && (
          <div className="mod-dependencies">
            {meta.dependencies.map((dep: ModDependency, i: number) => {
              const isPresent = projectMods.some(m => m.mod_id === dep.mod_id)
              return (
                <span key={i} className={`dep-badge ${dep.dependency_type} ${isPresent ? 'present' : 'missing'}`}>
                  {dep.dependency_type}: {getModNameById(dep.mod_id)}
                </span>
              )
            })}
          </div>
        )}
        {missingDeps.length > 0 && (
          <div className="mod-missing-deps">
            Missing required: {missingDeps.map(d => d.mod_id).join(', ')}
          </div>
        )}
      </div>
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
}

export function SearchResultRow({
  index,
  style,
  searchResults,
  projectMods,
  addModToProject,
}: RowComponentProps<SearchResultRowExtraProps>) {
  const mod = searchResults[index]
  const isAdded = projectMods.some(m => m.mod_id === mod.mod_id)
  return (
    <div style={style}>
      <div className="mod-card" style={{ height: '100%' }}>
        <div className="mod-card-header">
          <div className="mod-info">
            <div className="mod-name">{mod.name}</div>
            <div className="mod-author">{mod.author}</div>
          </div>
          <button
            className={`btn-add ${isAdded ? 'added' : ''}`}
            onClick={() => !isAdded && addModToProject(mod)}
            disabled={isAdded}
            aria-label={isAdded ? `${mod.name} already added` : `Add ${mod.name}`}
          >
            {isAdded ? 'Added' : '+ Add'}
          </button>
        </div>
        <div className="mod-desc" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {mod.description}
        </div>
        <div className="mod-meta">
          <span>{mod.downloads.toLocaleString()} downloads</span>
          {mod.categories.length > 0 && (
            <span className="mod-categories">{mod.categories.join(', ')}</span>
          )}
        </div>
      </div>
    </div>
  )
}
