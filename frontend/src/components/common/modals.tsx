interface Project {
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

interface ImportResult {
  project: Project
  mods: Array<{ mod_id: string; slug: string; name: string; version: string; source: string }>
  unresolved_mods: Array<{ file_name: string; mod_id: string | null; version: string | null; loader: string | null }>
  config_files: Array<{ path: string; content: string; format: string }>
}

interface NewProjectModalProps {
  show: boolean
  onClose: () => void
  projectName: string
  onProjectNameChange: (name: string) => void
  mcVersion: string
  onMcVersionChange: (v: string) => void
  modLoader: string
  onModLoaderChange: (v: string) => void
  onCreate: () => void
}

export function NewProjectModal({
  show,
  onClose,
  projectName,
  onProjectNameChange,
  mcVersion,
  onMcVersionChange,
  modLoader,
  onModLoaderChange,
  onCreate,
}: NewProjectModalProps) {
  if (!show) return null
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>New Project</h2>
        <div className="form-group">
          <label>Project Name</label>
          <input
            type="text"
            value={projectName}
            onChange={(e) => onProjectNameChange(e.target.value)}
            placeholder="My Modpack"
          />
        </div>
        <div className="form-group">
          <label>Minecraft Version</label>
          <select value={mcVersion} onChange={(e) => onMcVersionChange(e.target.value)}>
            <option value="1.21.1">1.21.1</option>
            <option value="1.20.1">1.20.1</option>
            <option value="1.19.2">1.19.2</option>
          </select>
        </div>
        <div className="form-group">
          <label>Mod Loader</label>
          <select value={modLoader} onChange={(e) => onModLoaderChange(e.target.value)}>
            <option value="Forge">Forge</option>
            <option value="NeoForge">NeoForge</option>
            <option value="Fabric">Fabric</option>
            <option value="Quilt">Quilt</option>
          </select>
        </div>
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={onCreate}>Create</button>
        </div>
      </div>
    </div>
  )
}

interface ImportModalProps {
  show: boolean
  onClose: () => void
  importPath: string
  onImportPathChange: (path: string) => void
  importResult: ImportResult | null
  isImporting: boolean
  importError: string
  onPickPath: () => Promise<void>
  onImport: () => Promise<void>
  onDone: () => void
}

export function ImportModal({
  show,
  onClose,
  importPath,
  onImportPathChange,
  importResult,
  isImporting,
  importError,
  onPickPath,
  onImport,
  onDone,
}: ImportModalProps) {
  if (!show) return null
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Import Modpack</h2>
        <div className="form-group">
          <label>Modpack File</label>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              type="text"
              value={importPath}
              onChange={(e) => onImportPathChange(e.target.value)}
              placeholder="Select .mrpack, pack.toml, or instance folder"
              readOnly
              style={{ flex: 1 }}
            />
            <button className="btn-secondary" onClick={onPickPath} aria-label="Browse for modpack file">Browse</button>
          </div>
        </div>

        {importError && (
          <div className="launch-error" style={{ marginTop: '16px' }}>
            <div className="error-header">
              <strong>Import Error:</strong>
              <button className="btn-copy" onClick={() => navigator.clipboard.writeText(importError)} aria-label="Copy error text">Copy</button>
            </div>
            <pre className="copyable">{importError}</pre>
          </div>
        )}

        {importResult && (
          <div style={{ marginTop: '16px', padding: '12px', background: 'var(--color-bg-surface-1)', borderRadius: '8px' }}>
            <h4>Import Successful: {importResult.project.name}</h4>
            <div style={{ marginTop: '8px', fontSize: '14px', color: 'var(--color-text-tertiary)' }}>
              MC {importResult.project.minecraft_version} &bull; {importResult.project.mod_loader} &bull; {importResult.mods.length} mods
            </div>
            {importResult.unresolved_mods.length > 0 && (
              <div style={{ marginTop: '8px', fontSize: '13px', color: 'var(--color-warning)' }}>
                {importResult.unresolved_mods.length} mods could not be auto-resolved
              </div>
            )}
          </div>
        )}

        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          {!importResult && <button className="btn-primary" onClick={onImport} disabled={isImporting || !importPath}>
            {isImporting ? 'Importing...' : 'Import'}
          </button>}
          {importResult && <button className="btn-primary" onClick={onDone}>Done</button>}
        </div>
      </div>
    </div>
  )
}

interface ExportModalProps {
  show: boolean
  onClose: () => void
  projectName: string | undefined
  exportError: string
  exportPath: string
  isExporting: boolean
  onExportMrpack: () => Promise<void>
  onExportCurseforge: () => Promise<void>
}

export function ExportModal({
  show,
  onClose,
  projectName,
  exportError,
  exportPath,
  isExporting,
  onExportMrpack,
  onExportCurseforge,
}: ExportModalProps) {
  if (!show) return null
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Export Modpack</h2>
        <p style={{ marginBottom: '16px', color: 'var(--color-text-secondary)' }}>
          Export <strong>{projectName}</strong> as a modpack file.
        </p>

        {exportError && (
          <div className="launch-error" style={{ marginTop: '16px' }}>
            <div className="error-header">
              <strong>Export Error:</strong>
              <button className="btn-copy" onClick={() => navigator.clipboard.writeText(exportError)} aria-label="Copy error text">Copy</button>
            </div>
            <pre className="copyable">{exportError}</pre>
          </div>
        )}

        {exportPath && (
          <div style={{ marginTop: '16px', padding: '12px', background: 'var(--color-bg-surface-1)', borderRadius: '8px' }}>
            <h4>Export Complete</h4>
            <div style={{ marginTop: '8px', fontSize: '13px', color: 'var(--color-text-tertiary)', wordBreak: 'break-all' }}>
              {exportPath}
            </div>
          </div>
        )}

        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>
            {exportPath ? 'Close' : 'Cancel'}
          </button>
          {!exportPath && (
            <>
              <button className="btn-primary" onClick={onExportMrpack} disabled={isExporting}>
                {isExporting ? 'Exporting...' : 'Export as .mrpack'}
              </button>
              <button className="btn-primary" onClick={onExportCurseforge} disabled={isExporting}>
                {isExporting ? 'Exporting...' : 'Export as CurseForge'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

interface DeleteConfirmModalProps {
  show: boolean
  projectName: string | undefined
  onCancel: () => void
  onConfirm: () => Promise<void>
}

export function DeleteConfirmModal({
  show,
  projectName,
  onCancel,
  onConfirm,
}: DeleteConfirmModalProps) {
  if (!show) return null
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Delete Project</h2>
        <p style={{ marginBottom: '16px', color: 'var(--color-text-secondary)' }}>
          Are you sure you want to delete <strong>{projectName}</strong>?
          This will permanently remove the project and all its mods. This cannot be undone.
        </p>
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onCancel}>Cancel</button>
          <button className="btn-danger" onClick={onConfirm}>Delete Project</button>
        </div>
      </div>
    </div>
  )
}
