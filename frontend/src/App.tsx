import { useState, useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'
import './App.css'

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

function App() {
  const [projects, setProjects] = useState<Project[]>([])
  const [selectedProject, setSelectedProject] = useState<Project | null>(null)
  const [showNewProject, setShowNewProject] = useState(false)
  const [newProjectName, setNewProjectName] = useState('')
  const [mcVersion, setMcVersion] = useState('1.21.1')
  const [modLoader, setModLoader] = useState('Forge')
  const [activeTab, setActiveTab] = useState<'mods' | 'configs' | 'progression' | 'quests'>('mods')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<any[]>([])

  useEffect(() => {
    loadProjects()
  }, [])

  async function loadProjects() {
    try {
      const result = await invoke<Project[]>('list_projects')
      setProjects(result)
    } catch (e) {
      console.error('Failed to load projects:', e)
    }
  }

  async function createProject() {
    try {
      const project = await invoke<Project>('create_project', {
        name: newProjectName,
        minecraftVersion: mcVersion,
        modLoader: modLoader,
        path: `~/modpacks/${newProjectName.toLowerCase().replace(/\s+/g, '-')}`,
      })
      setProjects([project, ...projects])
      setSelectedProject(project)
      setShowNewProject(false)
      setNewProjectName('')
    } catch (e) {
      console.error('Failed to create project:', e)
    }
  }

  async function searchMods() {
    if (!searchQuery || !selectedProject) return
    try {
      const results = await invoke<any[]>('search_mods', {
        query: searchQuery,
        loader: selectedProject.mod_loader,
        mcVersion: selectedProject.minecraft_version,
      })
      setSearchResults(results)
    } catch (e) {
      console.error('Failed to search mods:', e)
    }
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="sidebar-header">
          <h1>Modpack Engine</h1>
          <button className="btn-primary" onClick={() => setShowNewProject(true)}>
            + New Project
          </button>
        </div>
        <div className="project-list">
          {projects.map((project) => (
            <div
              key={project.id}
              className={`project-item ${selectedProject?.id === project.id ? 'active' : ''}`}
              onClick={() => setSelectedProject(project)}
            >
              <div className="project-name">{project.name}</div>
              <div className="project-meta">
                MC {project.minecraft_version} • {project.mod_loader}
              </div>
            </div>
          ))}
        </div>
      </aside>

      <main className="main-content">
        {showNewProject && (
          <div className="modal-overlay" onClick={() => setShowNewProject(false)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <h2>New Project</h2>
              <div className="form-group">
                <label>Project Name</label>
                <input
                  type="text"
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  placeholder="My Modpack"
                />
              </div>
              <div className="form-group">
                <label>Minecraft Version</label>
                <select value={mcVersion} onChange={(e) => setMcVersion(e.target.value)}>
                  <option value="1.21.1">1.21.1</option>
                  <option value="1.20.1">1.20.1</option>
                  <option value="1.19.2">1.19.2</option>
                  <option value="1.18.2">1.18.2</option>
                </select>
              </div>
              <div className="form-group">
                <label>Mod Loader</label>
                <select value={modLoader} onChange={(e) => setModLoader(e.target.value)}>
                  <option value="Forge">Forge</option>
                  <option value="NeoForge">NeoForge</option>
                  <option value="Fabric">Fabric</option>
                  <option value="Quilt">Quilt</option>
                </select>
              </div>
              <div className="modal-actions">
                <button className="btn-secondary" onClick={() => setShowNewProject(false)}>
                  Cancel
                </button>
                <button className="btn-primary" onClick={createProject}>
                  Create
                </button>
              </div>
            </div>
          </div>
        )}

        {selectedProject ? (
          <div className="project-workspace">
            <div className="workspace-header">
              <h2>{selectedProject.name}</h2>
              <div className="workspace-meta">
                MC {selectedProject.minecraft_version} • {selectedProject.mod_loader} • v{selectedProject.pack_version}
              </div>
            </div>
            <div className="workspace-tabs">
              {(['mods', 'configs', 'progression', 'quests'] as const).map((tab) => (
                <button
                  key={tab}
                  className={`tab ${activeTab === tab ? 'active' : ''}`}
                  onClick={() => setActiveTab(tab)}
                >
                  {tab.charAt(0).toUpperCase() + tab.slice(1)}
                </button>
              ))}
            </div>
            <div className="workspace-content">
              {activeTab === 'mods' && (
                <div className="mods-panel">
                  <div className="search-bar">
                    <input
                      type="text"
                      placeholder="Search mods on Modrinth..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && searchMods()}
                    />
                    <button onClick={searchMods}>Search</button>
                  </div>
                  <div className="search-results">
                    {searchResults.map((mod) => (
                      <div key={mod.mod_id} className="mod-card">
                        <div className="mod-name">{mod.name}</div>
                        <div className="mod-author">{mod.author}</div>
                        <div className="mod-desc">{mod.description}</div>
                        <div className="mod-meta">
                          <span>{mod.downloads.toLocaleString()} downloads</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {activeTab === 'configs' && (
                <div className="placeholder-panel">
                  <h3>Configuration Editor</h3>
                  <p>Select a config file to edit. Coming soon.</p>
                </div>
              )}
              {activeTab === 'progression' && (
                <div className="placeholder-panel">
                  <h3>Progression Designer</h3>
                  <p>Visual progression graph editor. Coming soon.</p>
                </div>
              )}
              {activeTab === 'quests' && (
                <div className="placeholder-panel">
                  <h3>Quest Designer</h3>
                  <p>Visual quest graph editor. Coming soon.</p>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="welcome">
            <div className="welcome-content">
              <h2>Welcome to Modpack Engine</h2>
              <p>Select a project or create a new one to get started.</p>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

export default App
