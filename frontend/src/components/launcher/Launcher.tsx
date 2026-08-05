import { useEffect, useRef } from 'react'
import type { Project } from '../../services/types'
import { SearchIcon, RefreshIcon, DownloadIcon, PlusIcon, TrashIcon, BookIcon } from '../ui/icons'
import logo from '../../assets/logo.png'

interface LauncherProps {
  projects: Project[]
  selectedProject: Project | null
  onSelectProject: (project: Project) => void
  onOpenProject: (project: Project) => void
  onRefresh: () => void
  onOpenPrism: () => void
  onImport: () => void
  onNewProject: () => void
  onDeleteProject: (project: Project) => void
}

function sourceBadge(project: Project): string {
  return project.source === 'prism' ? 'Prism' : 'ModCanvas'
}

export function Launcher({
  projects,
  selectedProject,
  onSelectProject,
  onOpenProject,
  onRefresh,
  onOpenPrism,
  onImport,
  onNewProject,
  onDeleteProject,
}: LauncherProps) {
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!listRef.current || !selectedProject) return
    const el = listRef.current.querySelector<HTMLElement>(`[data-project-id="${selectedProject.id}"]`)
    // scrollIntoView is absent in jsdom / some embedders; guard so the effect
    // never throws.
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ block: 'nearest' })
    }
  }, [selectedProject?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const openSelected = () => {
    if (selectedProject) onOpenProject(selectedProject)
  }

  return (
    <div className="launcher">
      <header className="launcher-header">
        <div className="launcher-brand">
          <img className="launcher-logo" src={logo} alt="ModCanvas logo" />
          <h1>ModCanvas</h1>
        </div>
        <div className="launcher-actions">
          <button className="btn-secondary" onClick={onOpenPrism} title="Browse Modpacks in Prism Launcher">
            <SearchIcon size={16} /> Prism
          </button>
          <button className="btn-secondary" onClick={onRefresh} title="Refresh instances from Prism">
            <RefreshIcon size={16} /> Refresh
          </button>
          <button className="btn-secondary" onClick={onImport} title="Import Modpack">
            <DownloadIcon size={16} /> Import
          </button>
          <button className="btn-primary" onClick={onNewProject} title="Create new project">
            <PlusIcon size={16} /> New Project
          </button>
        </div>
      </header>

      <div className="launcher-body">
        <div className="launcher-list" ref={listRef} role="listbox" aria-label="Projects" onKeyDown={(e) => {
          // Items handle Enter themselves; only open the selection when the
          // key lands on the container (e.g. focus was placed on it).
          if (e.key === 'Enter' && (e.target as HTMLElement).getAttribute?.('role') !== 'option') {
            openSelected()
          }
        }}>
          {projects.length === 0 && (
            <div className="launcher-empty">
              <BookIcon size={32} />
              <p>No projects yet. Import a modpack or create a new project to get started.</p>
            </div>
          )}
          {projects.map((project) => (
            <div
              key={project.id}
              data-project-id={project.id}
              role="option"
              aria-selected={selectedProject?.id === project.id}
              className={`launcher-item ${selectedProject?.id === project.id ? 'active' : ''}`}
              onClick={() => onSelectProject(project)}
              onDoubleClick={() => onOpenProject(project)}
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onSelectProject(project)
                if (e.key === 'Enter') onOpenProject(project)
              }}
            >
              <div className="launcher-item-main">
                <div className="launcher-item-name">{project.name}</div>
                <div className="launcher-item-meta">
                  MC {project.minecraft_version} &bull; {project.mod_loader}
                </div>
              </div>
              <span className={`launcher-badge badge-${sourceBadge(project).toLowerCase()}`}>
                {sourceBadge(project)}
              </span>
            </div>
          ))}
        </div>

        <aside className="launcher-preview">
          {selectedProject ? (
            <>
              <h2 className="launcher-preview-title">{selectedProject.name}</h2>
              <span className={`launcher-badge badge-${sourceBadge(selectedProject).toLowerCase()}`}>
                {sourceBadge(selectedProject)}
              </span>
              <dl className="launcher-preview-meta">
                <div><dt>Minecraft</dt><dd>{selectedProject.minecraft_version}</dd></div>
                <div><dt>Mod Loader</dt><dd>{selectedProject.mod_loader}</dd></div>
                <div><dt>Pack Version</dt><dd>{selectedProject.pack_version || '—'}</dd></div>
                <div><dt>Author</dt><dd>{selectedProject.author || '—'}</dd></div>
                <div><dt>Path</dt><dd className="launcher-preview-path">{selectedProject.path}</dd></div>
              </dl>
              {selectedProject.description && (
                <p className="launcher-preview-desc">{selectedProject.description}</p>
              )}
              <div className="launcher-preview-actions">
                <button className="btn-primary" onClick={openSelected}>Open</button>
                <button
                  className="btn-secondary"
                  onClick={() => onDeleteProject(selectedProject)}
                  title="Permanently remove this project"
                >
                  <TrashIcon size={16} /> Delete
                </button>
              </div>
              <p className="launcher-hint">Double-click a pack or press Enter to open it.</p>
            </>
          ) : (
            <div className="launcher-preview-empty">
              <p>Select a project to preview its details.</p>
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}
