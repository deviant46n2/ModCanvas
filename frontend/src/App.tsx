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

interface McInstance {
  id: string
  name: string
  mc_version: string
  loader: string
  loader_version: string | null
  game_dir: string
  status: string
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

  // Instance state
  const [instances, setInstances] = useState<McInstance[]>([])
  const [showNewInstance, setShowNewInstance] = useState(false)
  const [newInstanceName, setNewInstanceName] = useState('')
  const [newInstanceMcVersion, setNewInstanceMcVersion] = useState('1.21.1')
  const [newInstanceLoader, setNewInstanceLoader] = useState('vanilla')
  const [newInstanceLoaderVersion, setNewInstanceLoaderVersion] = useState('')
  const [selectedInstance, setSelectedInstance] = useState<McInstance | null>(null)
  const [username, setUsername] = useState(() => {
    return localStorage.getItem('mp_username') || 'Player'
  })
  const [instanceLogs, setInstanceLogs] = useState('')
  const [launchError, setLaunchError] = useState('')
  const [isLaunching, setIsLaunching] = useState(false)

  // Memory settings
  const [minMem, setMinMem] = useState('2G')
  const [maxMem, setMaxMem] = useState('4G')

  useEffect(() => {
    loadProjects()
    loadInstances()
  }, [])

  async function loadProjects() {
    try {
      const result = await invoke<Project[]>('list_projects')
      setProjects(result)
    } catch (e) {
      console.error('Failed to load projects:', e)
    }
  }

  async function loadInstances() {
    try {
      const result = await invoke<McInstance[]>('list_mc_instances')
      setInstances(result)
    } catch (e) {
      console.error('Failed to load instances:', e)
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

  async function createInstance() {
    try {
      const loaderVersion = newInstanceLoaderVersion.trim() || null
      const instance = await invoke<McInstance>('create_mc_instance', {
        name: newInstanceName,
        mcVersion: newInstanceMcVersion,
        loader: newInstanceLoader,
        loaderVersion: loaderVersion,
      })
      setInstances([...instances, instance])
      setShowNewInstance(false)
      setNewInstanceName('')
      setNewInstanceLoaderVersion('')
    } catch (e) {
      console.error('Failed to create instance:', e)
    }
  }

  async function launchInstance(id: string) {
    setLaunchError('')
    setIsLaunching(true)
    localStorage.setItem('mp_username', username)
    try {
      await invoke('launch_mc_instance', {
        instanceId: id,
        username: username,
        javaPath: null,
        minMem: minMem,
        maxMem: maxMem,
      })
      loadInstances()
    } catch (e: any) {
      console.error('Failed to launch instance:', e)
      setLaunchError(typeof e === 'string' ? e : e?.message || String(e))
    } finally {
      setIsLaunching(false)
    }
  }

  async function stopInstance(id: string) {
    try {
      await invoke('stop_mc_instance', { instanceId: id })
      loadInstances()
    } catch (e) {
      console.error('Failed to stop instance:', e)
    }
  }

  async function removeInstance(id: string) {
    try {
      await invoke('remove_mc_instance', { instanceId: id })
      setInstances(instances.filter(i => i.id !== id))
      if (selectedInstance?.id === id) setSelectedInstance(null)
    } catch (e) {
      console.error('Failed to remove instance:', e)
    }
  }

  async function loadLogs(id: string) {
    try {
      const logs = await invoke<string>('get_mc_logs', { instanceId: id })
      setInstanceLogs(logs)
    } catch (e) {
      console.error('Failed to load logs:', e)
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Running': return 'var(--success)'
      case 'Installing': return 'var(--warning)'
      case 'Stopped': return 'var(--text-muted)'
      case 'Crashed': return 'var(--error)'
      default: return 'var(--text-muted)'
    }
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="sidebar-header">
          <h1>Modpack Engine</h1>
        </div>

        <div className="sidebar-section">
          <div className="section-header">
            <h3>Projects</h3>
            <button className="btn-icon" onClick={() => setShowNewProject(true)}>+</button>
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
        </div>

        <div className="sidebar-section">
          <div className="section-header">
            <h3>Instances</h3>
            <button className="btn-icon" onClick={() => setShowNewInstance(true)}>+</button>
          </div>
          <div className="instance-list">
            {instances.map((instance) => (
              <div
                key={instance.id}
                className={`instance-item ${selectedInstance?.id === instance.id ? 'active' : ''}`}
                onClick={() => {
                  setSelectedInstance(instance)
                  loadLogs(instance.id)
                }}
              >
                <div className="instance-header">
                  <div className="instance-name">{instance.name}</div>
                  <div
                    className="instance-status"
                    style={{ color: getStatusColor(instance.status) }}
                  >
                    {instance.status}
                  </div>
                </div>
                <div className="instance-meta">
                  MC {instance.mc_version} • {instance.loader}
                </div>
              </div>
            ))}
          </div>
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
                <button className="btn-secondary" onClick={() => setShowNewProject(false)}>Cancel</button>
                <button className="btn-primary" onClick={createProject}>Create</button>
              </div>
            </div>
          </div>
        )}

        {showNewInstance && (
          <div className="modal-overlay" onClick={() => setShowNewInstance(false)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <h2>New Instance</h2>
              <div className="form-group">
                <label>Instance Name</label>
                <input
                  type="text"
                  value={newInstanceName}
                  onChange={(e) => setNewInstanceName(e.target.value)}
                  placeholder="My Instance"
                />
              </div>
              <div className="form-group">
                <label>Minecraft Version</label>
                <select value={newInstanceMcVersion} onChange={(e) => setNewInstanceMcVersion(e.target.value)}>
                  <option value="1.21.1">1.21.1</option>
                  <option value="1.21">1.21</option>
                  <option value="1.20.6">1.20.6</option>
                  <option value="1.20.4">1.20.4</option>
                  <option value="1.20.1">1.20.1</option>
                  <option value="1.19.2">1.19.2</option>
                </select>
              </div>
              <div className="form-group">
                <label>Loader</label>
                <select value={newInstanceLoader} onChange={(e) => setNewInstanceLoader(e.target.value)}>
                  <option value="vanilla">Vanilla</option>
                  <option value="fabric">Fabric</option>
                  <option value="quilt">Quilt</option>
                  <option value="forge">Forge</option>
                  <option value="neoforge">NeoForge</option>
                </select>
              </div>
              {newInstanceLoader !== 'vanilla' && (
                <div className="form-group">
                  <label>Loader Version (leave empty for latest)</label>
                  <input
                    type="text"
                    value={newInstanceLoaderVersion}
                    onChange={(e) => setNewInstanceLoaderVersion(e.target.value)}
                    placeholder="e.g. 0.16.10 (auto-resolves latest if empty)"
                  />
                </div>
              )}
              <div className="form-group">
                <label>Username</label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Player"
                />
              </div>
              <div className="modal-actions">
                <button className="btn-secondary" onClick={() => setShowNewInstance(false)}>Cancel</button>
                <button className="btn-primary" onClick={createInstance}>Create</button>
              </div>
            </div>
          </div>
        )}

        {selectedInstance ? (
          <div className="instance-workspace">
            <div className="workspace-header">
              <h2>{selectedInstance.name}</h2>
              <div className="workspace-meta">
                MC {selectedInstance.mc_version} • {selectedInstance.loader}
                {selectedInstance.loader_version && ` ${selectedInstance.loader_version}`}
              </div>
              <div className="instance-actions">
                {selectedInstance.status === 'Stopped' && (
                  <button
                    className="btn-success"
                    onClick={() => launchInstance(selectedInstance.id)}
                    disabled={isLaunching}
                  >
                    {isLaunching ? 'Launching...' : 'Launch'}
                  </button>
                )}
                {selectedInstance.status === 'Running' && (
                  <button className="btn-danger" onClick={() => stopInstance(selectedInstance.id)}>
                    Stop
                  </button>
                )}
                <button
                  className="btn-secondary"
                  onClick={() => removeInstance(selectedInstance.id)}
                >
                  Remove
                </button>
              </div>
            </div>

            {selectedInstance.status === 'Stopped' && (
              <div className="launch-settings">
                <h3>Launch Settings</h3>
                <div className="settings-row">
                  <div className="form-group">
                    <label>Min Memory</label>
                    <select value={minMem} onChange={(e) => setMinMem(e.target.value)}>
                      <option value="1G">1 GB</option>
                      <option value="2G">2 GB</option>
                      <option value="4G">4 GB</option>
                      <option value="6G">6 GB</option>
                      <option value="8G">8 GB</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Max Memory</label>
                    <select value={maxMem} onChange={(e) => setMaxMem(e.target.value)}>
                      <option value="2G">2 GB</option>
                      <option value="4G">4 GB</option>
                      <option value="6G">6 GB</option>
                      <option value="8G">8 GB</option>
                      <option value="12G">12 GB</option>
                      <option value="16G">16 GB</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Username</label>
                    <input
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="Player"
                    />
                  </div>
                </div>
              </div>
            )}

            {launchError && (
              <div className="launch-error">
                <strong>Launch Error:</strong>
                <pre>{launchError}</pre>
              </div>
            )}

            <div className="instance-logs">
              <div className="logs-header">
                <h3>Logs</h3>
                <button className="btn-icon" onClick={() => loadLogs(selectedInstance.id)}>
                  Refresh
                </button>
              </div>
              <pre className="log-output">{instanceLogs || 'No logs available'}</pre>
            </div>
          </div>
        ) : selectedProject ? (
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
              <p>Select a project or instance, or create a new one to get started.</p>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

export default App
