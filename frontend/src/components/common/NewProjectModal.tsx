import { servedMatrix } from '../../adapters/served-matrix';
import type { LoaderType } from '../../adapters/types';

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

const LOADER_LABELS: Record<LoaderType, string> = {
  neoforge: 'NeoForge',
  forge: 'Forge',
  fabric: 'Fabric',
  quilt: 'Quilt',
}

function loaderLabel(loader: LoaderType): string {
  return LOADER_LABELS[loader]
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

  // The version/loader pickers come from the adapter matrix — the app must
  // never offer a combination no adapter can serve exactly (the 1.19.2 lie,
  // s34). Options below are derived, never hand-rolled.
  const matrix = servedMatrix()
  const currentLoaders =
    matrix.find((v) => v.mcVersion === mcVersion)?.loaders ?? []

  function handleVersionChange(next: string) {
    onMcVersionChange(next)
    // Loader options are per-version; if the current loader is not served
    // for the new version, reset to that version's first served loader.
    const nextLoaders = matrix.find((v) => v.mcVersion === next)?.loaders ?? []
    const current = modLoader.toLowerCase() as LoaderType
    if (nextLoaders.length > 0 && !nextLoaders.includes(current)) {
      onModLoaderChange(loaderLabel(nextLoaders[0]))
    }
  }

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
          <select
            value={mcVersion}
            onChange={(e) => handleVersionChange(e.target.value)}
          >
            {matrix.map((v) => (
              <option key={v.mcVersion} value={v.mcVersion}>
                {v.mcVersion}
              </option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label>Mod Loader</label>
          <select
            value={modLoader}
            onChange={(e) => onModLoaderChange(e.target.value)}
          >
            {currentLoaders.map((loader) => (
              <option key={loader} value={loaderLabel(loader)}>
                {loaderLabel(loader)}
              </option>
            ))}
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
