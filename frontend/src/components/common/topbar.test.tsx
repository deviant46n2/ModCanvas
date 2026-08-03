import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { TopBar } from './topbar'

const base = {
  projectName: 'My Pack',
  minecraftVersion: '1.21.1',
  modLoader: 'Forge',
  packVersion: '1.0.0',
  isTesting: false,
  onSave: vi.fn(),
  onTest: vi.fn(),
  onDeployCompanion: vi.fn(),
  onExport: vi.fn(),
  onDelete: vi.fn(),
  onLoadPack: vi.fn(),
  onClosePack: vi.fn(),
}

describe('TopBar', () => {
  it('shows Load Pack as the primary action when the pack is not loaded', () => {
    render(<TopBar {...base} packLoaded={false} />)
    const load = screen.getByRole('button', { name: /load pack/i })
    const test = screen.getByRole('button', { name: 'Test' })
    expect(load.className).toContain('btn-primary')
    expect(test.className).toContain('btn-secondary')
  })

  it('promotes Test to primary and hides Load Pack once loaded', () => {
    render(<TopBar {...base} packLoaded={true} />)
    expect(screen.queryByRole('button', { name: /load pack/i })).toBeNull()
    expect(screen.getByRole('button', { name: 'Test' }).className).toContain('btn-primary')
  })

  it('shows a Testing label and disables Test while a test is running', () => {
    render(<TopBar {...base} packLoaded={true} isTesting={true} />)
    const test = screen.getByRole('button', { name: /testing/i })
    expect(test).toBeDisabled()
  })

  it('groups Close Pack, Deploy Companion, Export, and Delete under the Project menu', () => {
    render(<TopBar {...base} packLoaded={true} />)
    fireEvent.click(screen.getByRole('button', { name: /project/i }))
    expect(screen.getByRole('menuitem', { name: /close pack/i })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /deploy companion/i })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /export modpack/i })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /delete project/i })).toBeInTheDocument()
  })

  it('hides Close Pack from the menu when the pack is not loaded', () => {
    render(<TopBar {...base} packLoaded={false} />)
    fireEvent.click(screen.getByRole('button', { name: /project/i }))
    expect(screen.queryByRole('menuitem', { name: /close pack/i })).toBeNull()
  })

  it('fires the right handlers from the Project menu and closes it', () => {
    render(<TopBar {...base} packLoaded={true} />)
    fireEvent.click(screen.getByRole('button', { name: /project/i }))
    fireEvent.click(screen.getByRole('menuitem', { name: /export modpack/i }))
    expect(base.onExport).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('fires Delete from the menu (confirm dialog is the caller responsibility)', () => {
    render(<TopBar {...base} packLoaded={true} />)
    fireEvent.click(screen.getByRole('button', { name: /project/i }))
    fireEvent.click(screen.getByRole('menuitem', { name: /delete project/i }))
    expect(base.onDelete).toHaveBeenCalledTimes(1)
  })
})
