import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { TopBar } from './topbar'
import { HistoryProvider } from '../../hooks/history-provider'

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
  onBackToProjects: vi.fn(),
  onOpenSettings: vi.fn(),
  onRefresh: vi.fn(),
  onForceReindex: vi.fn(),
  onClosePack: vi.fn(),
}

describe('TopBar', () => {
  it('shows Test as secondary and Refresh disabled when the pack is not loaded', () => {
    render(<HistoryProvider><TopBar {...base} packLoaded={false} /></HistoryProvider>)
    const test = screen.getByRole('button', { name: 'Test' })
    const refresh = screen.getByRole('button', { name: 'Refresh' })
    expect(test.className).toContain('btn-secondary')
    expect(refresh).toBeDisabled()
  })

  it('promotes Test to primary and enables Refresh once loaded', () => {
    render(<HistoryProvider><TopBar {...base} packLoaded={true} /></HistoryProvider>)
    expect(screen.getByRole('button', { name: 'Test' }).className).toContain('btn-primary')
    expect(screen.getByRole('button', { name: 'Refresh' })).not.toBeDisabled()
  })

  it('shows a Testing label and disables Test while a test is running', () => {
    render(<HistoryProvider><TopBar {...base} packLoaded={true} isTesting={true} /></HistoryProvider>)
    const test = screen.getByRole('button', { name: /testing/i })
    expect(test).toBeDisabled()
  })

  it('groups Refresh, Force Re-index, Close Pack, Deploy Companion, Export, and Delete under the Project menu', () => {
    render(<HistoryProvider><TopBar {...base} packLoaded={true} /></HistoryProvider>)
    fireEvent.click(screen.getByRole('button', { name: 'Project' }))
    expect(screen.getByRole('menuitem', { name: /refresh/i })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /force full re-index/i })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /close pack/i })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /deploy companion/i })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /export modpack/i })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /delete project/i })).toBeInTheDocument()
  })

  it('hides Close Pack from the menu when the pack is not loaded', () => {
    render(<HistoryProvider><TopBar {...base} packLoaded={false} /></HistoryProvider>)
    fireEvent.click(screen.getByRole('button', { name: 'Project' }))
    expect(screen.queryByRole('menuitem', { name: /close pack/i })).toBeNull()
  })

  it('fires the right handlers from the Project menu and closes it', () => {
    render(<HistoryProvider><TopBar {...base} packLoaded={true} /></HistoryProvider>)
    fireEvent.click(screen.getByRole('button', { name: 'Project' }))
    fireEvent.click(screen.getByRole('menuitem', { name: /export modpack/i }))
    expect(base.onExport).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('fires Refresh from the Project menu', () => {
    render(<HistoryProvider><TopBar {...base} packLoaded={true} /></HistoryProvider>)
    fireEvent.click(screen.getByRole('button', { name: 'Project' }))
    fireEvent.click(screen.getByRole('menuitem', { name: /refresh/i }))
    expect(base.onRefresh).toHaveBeenCalledTimes(1)
  })

  it('fires the back-to-projects handler from the header button', () => {
    render(<HistoryProvider><TopBar {...base} packLoaded={true} /></HistoryProvider>)
    fireEvent.click(screen.getByRole('button', { name: /projects/i }))
    expect(base.onBackToProjects).toHaveBeenCalledTimes(1)
  })

  it('fires Delete from the menu (confirm dialog is the caller responsibility)', () => {
    render(<HistoryProvider><TopBar {...base} packLoaded={true} /></HistoryProvider>)
    fireEvent.click(screen.getByRole('button', { name: 'Project' }))
    fireEvent.click(screen.getByRole('menuitem', { name: /delete project/i }))
    expect(base.onDelete).toHaveBeenCalledTimes(1)
  })
})
