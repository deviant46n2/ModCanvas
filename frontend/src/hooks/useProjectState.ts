import { useState } from 'react'
import { listProjects, createProject, saveProject, deleteProject } from '../services/api'
import type { CreateProjectInput } from '../services/types'

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
  const [showWizard, setShowWizard] = useState(false)
  const [confirmCloseProject, setConfirmCloseProject] = useState(false)
  // True once listProjects() has SUCCEEDED (success path only). The launcher
  // boots with an empty list, so `projects.length === 0` is ambiguous until
  // this flips — first-boot routing waits on it and must not fire on a
  // failed load (which would wrongly open the wizard for a user whose
  // projects just failed to list).
  const [projectsLoaded, setProjectsLoaded] = useState(false)

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
      setProjectsLoaded(true)
      return result
    } catch (e) {
      console.error('Failed to load projects:', e)
      return []
    }
  }

  /**
   * Create a project and surface it in the launcher. `input` is derived by
   * the First-Pack wizard (or the classic flow); errors propagate to the
   * caller so the wizard can show them — the wizard must stay open on a
   * failed create (e.g. scaffold refused an instance that already has a
   * quest book).
   */
  async function handleCreateProject(input: CreateProjectInput): Promise<Project> {
    const project = await createProject(
      input.name,
      input.mcVersion,
      input.modLoader,
      input.path,
      input.templateId,
    )
    setProjects([project, ...projects])
    // Select it in the launcher; useAppState.handleCreateProject decides
    // whether to open it (which runs the full load pipeline). The wizard
    // stays open through its post-create steps (curated mods, green check)
    // and closes itself on Done/Launch.
    setSelectedProject(project)
    return project
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
    showWizard, setShowWizard,
    confirmCloseProject, setConfirmCloseProject,
    projectsLoaded,
    loadProjects,
    getLastProjectId,
    handleCreateProject,
    handleSaveProject,
    handleConfirmDelete,
    handleCloseDelete,
  }
}
