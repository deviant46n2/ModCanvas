import { useState } from 'react'
import { listProjects, createProject, saveProject, deleteProject } from '../services/api'

export interface Project {
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

const LAST_PROJECT_KEY = 'modcanvas:last-project-id'

export function useProjectState() {
  const [projects, setProjects] = useState<Project[]>([])
  const [selectedProject, setSelectedProject] = useState<Project | null>(null)
  const [showNewProject, setShowNewProject] = useState(false)
  const [newProjectName, setNewProjectName] = useState('')
  const [mcVersion, setMcVersion] = useState('1.21.1')
  const [modLoader, setModLoader] = useState('Forge')
  const [confirmCloseProject, setConfirmCloseProject] = useState(false)

  function persistSelection(id: string | null) {
    try {
      if (id) localStorage.setItem(LAST_PROJECT_KEY, id)
      else localStorage.removeItem(LAST_PROJECT_KEY)
    } catch {
      /* storage may be unavailable */
    }
  }

  /** Remember the selected project so it can be reopened on next launch. */
  function rememberProject(project: Project | null) {
    setSelectedProject(project)
    persistSelection(project?.id ?? null)
  }

  async function loadProjects() {
    try {
      const result = await listProjects()
      setProjects(result)
      return result
    } catch (e) {
      console.error('Failed to load projects:', e)
      return []
    }
  }

  /** Return the last-selected project id, if any. */
  function getLastProjectId(): string | null {
    try {
      return localStorage.getItem(LAST_PROJECT_KEY)
    } catch {
      return null
    }
  }

  async function handleCreateProject() {
    try {
      const project = await createProject(
        newProjectName,
        mcVersion,
        modLoader,
        `~/modpacks/${newProjectName.toLowerCase().replace(/\s+/g, '-')}`,
      )
      setProjects([project, ...projects])
      rememberProject(project)
      setShowNewProject(false)
      setNewProjectName('')
    } catch (e) {
      console.error('Failed to create project:', e)
    }
  }

  async function handleSaveProject() {
    if (!selectedProject) return
    try {
      await saveProject(selectedProject.id)
    } catch (e) {
      console.error('Failed to save project:', e)
    }
  }

  async function handleConfirmDelete(): Promise<boolean> {
    try {
      await deleteProject(selectedProject!.id)
      await loadProjects()
      rememberProject(null)
      return true
    } catch (e) {
      console.error('Failed to delete project:', e)
      return false
    } finally {
      setConfirmCloseProject(false)
    }
  }

  function handleCloseDelete() {
    setConfirmCloseProject(false)
  }

  function handleCloseProject() {
    rememberProject(null)
  }

  return {
    projects,
    selectedProject,
    setSelectedProject: rememberProject,
    showNewProject, setShowNewProject,
    newProjectName, setNewProjectName,
    mcVersion, setMcVersion,
    modLoader, setModLoader,
    confirmCloseProject, setConfirmCloseProject,
    loadProjects,
    getLastProjectId,
    handleCreateProject,
    handleSaveProject,
    handleConfirmDelete,
    handleCloseDelete,
    handleCloseProject,
  }
}
