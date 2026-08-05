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
  /** Origin: `"modcanvas"` (manual / imported) or `"prism"` (Prism-synced). */
  source: string
}

const LAST_PROJECT_KEY = 'modcanvas:last-project-id'

export function useProjectState() {
  const [projects, setProjects] = useState<Project[]>([])
  // The pack currently open in the workspace. When null the launcher is shown;
  // opening = full load (see useAppState.openPack).
  const [openProject, setOpenProject] = useState<Project | null>(null)
  // The project highlighted in the launcher for the metadata preview. This is
  // purely a selection concept — it never triggers a load.
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

  /** Return the last-opened project id, if any. */
  function getLastProjectId(): string | null {
    try {
      return localStorage.getItem(LAST_PROJECT_KEY)
    } catch {
      return null
    }
  }

  /** Open a pack: enters the workspace. The full cache-aware load pipeline is
   *  run by useAppState.openPack. */
  function openPack(project: Project) {
    setOpenProject(project)
    setSelectedProject(project)
    persistSelection(project.id)
  }

  /** Close the open pack and return to the launcher. */
  function closePack() {
    setOpenProject(null)
    persistSelection(null)
  }

  /** Launcher preview highlight only — does not open the pack. */
  function selectProject(project: Project | null) {
    setSelectedProject(project)
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

  async function handleCreateProject(): Promise<Project | null> {
    try {
      const project = await createProject(
        newProjectName,
        mcVersion,
        modLoader,
        `~/modpacks/${newProjectName.toLowerCase().replace(/\s+/g, '-')}`,
      )
      setProjects([project, ...projects])
      // Select it in the launcher; useAppState.handleCreateProject decides
      // whether to open it (which runs the full load pipeline).
      setSelectedProject(project)
      setShowNewProject(false)
      setNewProjectName('')
      return project
    } catch (e) {
      console.error('Failed to create project:', e)
      return null
    }
  }

  async function handleSaveProject() {
    if (!openProject) return
    try {
      await saveProject(openProject.id)
    } catch (e) {
      console.error('Failed to save project:', e)
    }
  }

  async function handleConfirmDelete(): Promise<boolean> {
    const target = openProject ?? selectedProject
    if (!target) return false
    try {
      await deleteProject(target.id)
      await loadProjects()
      if (openProject?.id === target.id) {
        setOpenProject(null)
        setSelectedProject(null)
        persistSelection(null)
      } else {
        setSelectedProject(null)
      }
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
    openProject,
    selectedProject,
    selectProject,
    openPack,
    closePack,
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
  }
}
