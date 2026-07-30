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

export function useProjectState() {
  const [projects, setProjects] = useState<Project[]>([])
  const [selectedProject, setSelectedProject] = useState<Project | null>(null)
  const [showNewProject, setShowNewProject] = useState(false)
  const [newProjectName, setNewProjectName] = useState('')
  const [mcVersion, setMcVersion] = useState('1.21.1')
  const [modLoader, setModLoader] = useState('Forge')
  const [confirmCloseProject, setConfirmCloseProject] = useState(false)

  async function loadProjects() {
    try {
      const result = await listProjects()
      setProjects(result)
    } catch (e) {
      console.error('Failed to load projects:', e)
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
      setSelectedProject(project)
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
      setSelectedProject(null)
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

  return {
    projects,
    selectedProject,
    setSelectedProject,
    showNewProject, setShowNewProject,
    newProjectName, setNewProjectName,
    mcVersion, setMcVersion,
    modLoader, setModLoader,
    confirmCloseProject, setConfirmCloseProject,
    loadProjects,
    handleCreateProject,
    handleSaveProject,
    handleConfirmDelete,
    handleCloseDelete,
  }
}
