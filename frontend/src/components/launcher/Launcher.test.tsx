import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Launcher } from './Launcher'
import type { Project } from '../../services/types'

function project(over: Partial<Project> = {}): Project {
  return {
    id: 'p1',
    name: 'Test Pack',
    description: 'A test pack',
    minecraft_version: '1.21.1',
    mod_loader: 'NeoForge',
    pack_version: '1.0.0',
    author: 'dev',
    created_at: '',
    updated_at: '',
    path: '/tmp/packs/test',
    source: 'modcanvas',
    ...over,
  }
}

const base = {
  projects: [] as Project[],
  selectedProject: null as Project | null,
  onSelectProject: vi.fn(),
  onOpenProject: vi.fn(),
  onRefresh: vi.fn(),
  onOpenPrism: vi.fn(),
  onImport: vi.fn(),
  onNewProject: vi.fn(),
  onDeleteProject: vi.fn(),
}

describe('Launcher', () => {
  it('shows an empty state when there are no projects', () => {
    render(<Launcher {...base} />)
    expect(screen.getByText(/no projects yet/i)).toBeInTheDocument()
  })

  it('renders projects with source badges', () => {
    const { container } = render(
      <Launcher
        {...base}
        projects={[
          project(),
          project({ id: 'p2', name: 'Prism Pack', source: 'prism' }),
        ]}
      />,
    )
    expect(screen.getByText('Test Pack')).toBeInTheDocument()
    expect(screen.getByText('Prism Pack')).toBeInTheDocument()
    expect(container.querySelectorAll('.badge-modcanvas')).toHaveLength(1)
    expect(container.querySelectorAll('.badge-prism')).toHaveLength(1)
  })

  it('selects a project on single-click without opening it', () => {
    const onSelectProject = vi.fn()
    const onOpenProject = vi.fn()
    render(
      <Launcher
        {...base}
        onSelectProject={onSelectProject}
        onOpenProject={onOpenProject}
        projects={[project()]}
      />,
    )
    fireEvent.click(screen.getByText('Test Pack'))
    expect(onSelectProject).toHaveBeenCalledTimes(1)
    expect(onSelectProject).toHaveBeenCalledWith(expect.objectContaining({ id: 'p1' }))
    expect(onOpenProject).not.toHaveBeenCalled()
  })

  it('opens a project on double-click', () => {
    const onOpenProject = vi.fn()
    render(
      <Launcher
        {...base}
        onOpenProject={onOpenProject}
        projects={[project()]}
        selectedProject={project()}
      />,
    )
    fireEvent.doubleClick(screen.getByRole('option', { name: /test pack/i }))
    expect(onOpenProject).toHaveBeenCalledTimes(1)
  })

  it('opens the selected project via Enter on the list item', () => {
    const onOpenProject = vi.fn()
    render(
      <Launcher
        {...base}
        onOpenProject={onOpenProject}
        projects={[project()]}
        selectedProject={project()}
      />,
    )
    fireEvent.keyDown(screen.getByRole('option', { name: /test pack/i }), { key: 'Enter' })
    expect(onOpenProject).toHaveBeenCalledTimes(1)
  })

  it('opens the selected project from the preview Open button', () => {
    const onOpenProject = vi.fn()
    render(
      <Launcher
        {...base}
        onOpenProject={onOpenProject}
        projects={[project()]}
        selectedProject={project()}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Open' }))
    expect(onOpenProject).toHaveBeenCalledTimes(1)
  })

  it('shows selected project metadata in the preview pane', () => {
    render(
      <Launcher
        {...base}
        projects={[project()]}
        selectedProject={project({ minecraft_version: '1.20.1' })}
      />,
    )
    expect(screen.getByText('1.20.1')).toBeInTheDocument()
    expect(screen.getByText('/tmp/packs/test')).toBeInTheDocument()
  })

  it('requests deletion of the selected project', () => {
    const onDeleteProject = vi.fn()
    render(
      <Launcher
        {...base}
        onDeleteProject={onDeleteProject}
        projects={[project()]}
        selectedProject={project()}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /delete/i }))
    expect(onDeleteProject).toHaveBeenCalledTimes(1)
  })

  it('wires the header actions', () => {
    const onRefresh = vi.fn()
    const onOpenPrism = vi.fn()
    const onImport = vi.fn()
    const onNewProject = vi.fn()
    render(
      <Launcher
        {...base}
        onRefresh={onRefresh}
        onOpenPrism={onOpenPrism}
        onImport={onImport}
        onNewProject={onNewProject}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /refresh/i }))
    fireEvent.click(screen.getByRole('button', { name: /prism/i }))
    fireEvent.click(screen.getByRole('button', { name: /import/i }))
    fireEvent.click(screen.getByRole('button', { name: /new project/i }))
    expect(onRefresh).toHaveBeenCalledTimes(1)
    expect(onOpenPrism).toHaveBeenCalledTimes(1)
    expect(onImport).toHaveBeenCalledTimes(1)
    expect(onNewProject).toHaveBeenCalledTimes(1)
  })
})
