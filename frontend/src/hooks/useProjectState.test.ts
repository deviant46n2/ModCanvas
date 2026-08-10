import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useProjectState } from './useProjectState'
import type { Project } from './useProjectState'

vi.mock('../services/api', () => ({
  listProjects: vi.fn(),
  createProject: vi.fn(),
  saveProject: vi.fn(),
  deleteProject: vi.fn(),
}))

import { listProjects, createProject, deleteProject } from '../services/api'

const project = (over: Partial<Project> = {}): Project => ({
  id: 'p1',
  name: 'Test Pack',
  description: '',
  minecraft_version: '1.21.1',
  mod_loader: 'NeoForge',
  pack_version: '1.0.0',
  author: '',
  created_at: '',
  updated_at: '',
  path: '/tmp/packs/test',
  source: 'modcanvas',
  ...over,
})

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  vi.mocked(listProjects).mockResolvedValue([project()])
})

describe('useProjectState', () => {
  it('openPack sets openProject, mirrors selection, and persists the id', () => {
    const { result } = renderHook(() => useProjectState())
    act(() => result.current.openPack(project()))
    expect(result.current.openProject?.id).toBe('p1')
    expect(result.current.selectedProject?.id).toBe('p1')
    expect(localStorage.getItem('modcanvas:last-project-id')).toBe('p1')
  })

  it('closePack clears openProject and the persisted id', () => {
    const { result } = renderHook(() => useProjectState())
    act(() => result.current.openPack(project()))
    act(() => result.current.closePack())
    expect(result.current.openProject).toBeNull()
    expect(localStorage.getItem('modcanvas:last-project-id')).toBeNull()
  })

  it('selectProject only updates the launcher selection, never the open pack', () => {
    const { result } = renderHook(() => useProjectState())
    act(() => result.current.selectProject(project({ id: 'p2' })))
    expect(result.current.selectedProject?.id).toBe('p2')
    expect(result.current.openProject).toBeNull()
    expect(localStorage.getItem('modcanvas:last-project-id')).toBeNull()
  })

  it('getLastProjectId returns the persisted id', () => {
    localStorage.setItem('modcanvas:last-project-id', 'p1')
    const { result } = renderHook(() => useProjectState())
    expect(result.current.getLastProjectId()).toBe('p1')
  })

  it('handleCreateProject creates with the given input and selects the new project', async () => {
    const created = project({ id: 'p9', name: 'New Pack' })
    vi.mocked(createProject).mockResolvedValue(created)
    const { result } = renderHook(() => useProjectState())
    const input = {
      name: 'New Pack',
      mcVersion: '1.21.1',
      modLoader: 'NeoForge',
      path: '~/modpacks/new-pack',
      templateId: 'exploration',
    }

    await act(async () => {
      const returned = await result.current.handleCreateProject(input)
      expect(returned.id).toBe('p9')
    })
    expect(createProject).toHaveBeenCalledWith(
      'New Pack', '1.21.1', 'NeoForge', '~/modpacks/new-pack', 'exploration',
    )
    expect(result.current.selectedProject?.id).toBe('p9')
    expect(result.current.openProject).toBeNull()
    expect(result.current.showWizard).toBe(false)
  })

  it('handleConfirmDelete removes the selected project and clears selection', async () => {
    vi.mocked(deleteProject).mockResolvedValue(undefined)
    const { result } = renderHook(() => useProjectState())
    act(() => result.current.selectProject(project({ id: 'p2' })))

    let ok = false
    await act(async () => {
      ok = await result.current.handleConfirmDelete()
    })
    expect(ok).toBe(true)
    expect(deleteProject).toHaveBeenCalledWith('p2')
    expect(result.current.selectedProject).toBeNull()
    expect(result.current.openProject).toBeNull()
  })

  it('handleConfirmDelete closes an open pack when it is the delete target', async () => {
    vi.mocked(deleteProject).mockResolvedValue(undefined)
    const { result } = renderHook(() => useProjectState())
    act(() => result.current.openPack(project({ id: 'p1' })))

    let ok = false
    await act(async () => {
      ok = await result.current.handleConfirmDelete()
    })
    expect(ok).toBe(true)
    expect(result.current.openProject).toBeNull()
    expect(localStorage.getItem('modcanvas:last-project-id')).toBeNull()
  })
})
