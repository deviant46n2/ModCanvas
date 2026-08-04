import { DownloadIcon, PlusIcon, RefreshIcon, SearchIcon } from '../ui/icons'

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

interface SidebarProps {
  projects: Project[]
  selectedProject: Project | null
  onSelectProject: (project: Project) => void
  onOpenPrism: () => void
  onRefresh: () => void
  onImport: () => void
  onNewProject: () => void
}

import logo from '../../assets/logo.png'

export function Sidebar({
  projects,
  selectedProject,
  onSelectProject,
  onOpenPrism,
  onRefresh,
  onImport,
  onNewProject,
}: SidebarProps) {
  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <img className="sidebar-logo" src={logo} alt="ModCanvas logo" />
        <h1>ModCanvas</h1>
      </div>

      <div className="sidebar-section">
        <div className="section-header">
          <h3>Projects</h3>
          <div style={{ display: 'flex', gap: '4px' }}>
            <button className="btn-icon" onClick={onOpenPrism} title="Browse Modpacks in Prism Launcher" aria-label="Browse Modpacks in Prism Launcher">
              <SearchIcon size={16} />
            </button>
            <button className="btn-icon" onClick={onRefresh} title="Refresh Instances from Prism" aria-label="Refresh instances">
              <RefreshIcon size={16} />
            </button>
            <button className="btn-icon" onClick={onImport} title="Import Modpack" aria-label="Import modpack">
              <DownloadIcon size={16} />
            </button>
            <button className="btn-icon" onClick={onNewProject} title="Create new project" aria-label="Create new project">
              <PlusIcon size={16} />
            </button>
          </div>
        </div>
        <div className="project-list">
          {projects.map((project) => (
            <div
              key={project.id}
              className={`project-item ${selectedProject?.id === project.id ? 'active' : ''}`}
              onClick={() => onSelectProject(project)}
            >
              <div className="project-name">{project.name}</div>
              <div className="project-meta">
                MC {project.minecraft_version} &bull; {project.mod_loader}
              </div>
            </div>
          ))}
        </div>
      </div>
    </aside>
  )
}
