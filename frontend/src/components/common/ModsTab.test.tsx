import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ModsTab, type ModsTabProps } from './ModsTab'

const mods = [
  { mod_id: 'a', slug: 'a', name: 'Alpha Mod', author: 'A', description: 'desc a', source: 'Modrinth', version: '1.0', enabled: true },
  { mod_id: 'b', slug: 'b', name: 'Beta Mod', author: 'B', description: 'desc b', source: 'CurseForge', version: '2.0', enabled: true },
  { mod_id: 'c', slug: 'c', name: 'Gamma Mod', author: 'C', description: 'desc c', source: 'Modrinth', version: '3.0', enabled: false },
]

function baseProps(overrides: Partial<ModsTabProps> = {}): ModsTabProps {
  return {
    projectMods: mods,
    filteredMods: mods,
    modFilterInput: '',
    onModFilterInputChange: vi.fn(),
    onDebouncedModFilter: vi.fn(),
    compatResult: null,
    onCompatResultClose: vi.fn(),
    isLoadingMetadata: false,
    isCheckingCompat: false,
    project: { id: 'p1' },
    onScanInstanceMods: vi.fn(),
    onLoadDependencies: vi.fn(),
    onCheckCompat: vi.fn(),
    onToggleMod: vi.fn().mockResolvedValue(undefined),
    onRemoveMod: vi.fn(),
    modMetadata: new Map(),
    projectModsForDeps: mods,
    getMissingDependencies: () => [],
    getModNameById: (id: string) => id,
    onInstallMissing: vi.fn(),
    installingMissing: new Set(),
    onInstallAllMissing: vi.fn(),
    ...overrides,
  }
}

describe('ModsTab', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders one compact row per filtered mod', () => {
    render(<ModsTab {...baseProps()} />)
    expect(screen.getByRole('checkbox', { name: 'Select Alpha Mod' })).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'Select Beta Mod' })).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'Select Gamma Mod' })).toBeInTheDocument()
    expect(screen.queryByText(/bulk mod actions/i)).toBeNull()
  })

  it('reveals the bulk bar with the right count when a row is selected', () => {
    render(<ModsTab {...baseProps()} />)
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Alpha Mod' }))
    expect(screen.getByText('1 selected')).toBeInTheDocument()
    expect(screen.getByRole('toolbar', { name: /bulk mod actions/i })).toBeInTheDocument()
  })

  it('header checkbox selects every filtered mod', () => {
    render(<ModsTab {...baseProps()} />)
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select all visible mods' }))
    expect(screen.getByText('3 selected')).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'Select Alpha Mod' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Select Gamma Mod' })).toBeChecked()
  })

  it('Disable selected toggles only the enabled mods in the selection', async () => {
    const onToggleMod = vi.fn().mockResolvedValue(undefined)
    render(<ModsTab {...baseProps({ onToggleMod })} />)
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select all visible mods' }))
    fireEvent.click(screen.getByRole('button', { name: /disable selected/i }))
    await vi.waitFor(() => {})
    expect(onToggleMod).toHaveBeenCalledTimes(2)
    expect(onToggleMod).toHaveBeenCalledWith(mods[0])
    expect(onToggleMod).toHaveBeenCalledWith(mods[1])
  })

  it('Enable selected toggles only the disabled mods in the selection', () => {
    const onToggleMod = vi.fn().mockResolvedValue(undefined)
    render(<ModsTab {...baseProps({ onToggleMod })} />)
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select all visible mods' }))
    fireEvent.click(screen.getByRole('button', { name: /enable selected/i }))
    expect(onToggleMod).toHaveBeenCalledTimes(1)
    expect(onToggleMod).toHaveBeenCalledWith(mods[2])
  })

  it('single-row quick toggle still works', () => {
    const onToggleMod = vi.fn().mockResolvedValue(undefined)
    render(<ModsTab {...baseProps({ onToggleMod })} />)
    fireEvent.click(screen.getByRole('button', { name: 'OFF' }))
    expect(onToggleMod).toHaveBeenCalledTimes(1)
    expect(onToggleMod).toHaveBeenCalledWith(mods[2])
  })

  const installableIssue = {
    severity: 'Warning',
    message: "'Alpha Mod' requires 'MissingLib' which is not in the project",
    affected_mods: ['a', 'missinglib'],
    affected_mod_names: ['Alpha Mod', 'MissingLib'],
    install: { mod_id: 'missinglib', slug: 'missinglib', name: 'MissingLib' },
  }

  it('compat panel renders an Install button on a resolvable missing dep and fires it', () => {
    const onInstallMissing = vi.fn().mockResolvedValue(undefined)
    render(<ModsTab {...baseProps({
      compatResult: { compatible: false, issues: [installableIssue], warnings: [] },
      onInstallMissing,
    })} />)
    fireEvent.click(screen.getByRole('button', { name: 'Install' }))
    expect(onInstallMissing).toHaveBeenCalledWith(installableIssue.install)
  })

  it('compat panel offers no Install button for an unresolvable dep', () => {
    render(<ModsTab {...baseProps({
      compatResult: { compatible: false, issues: [{ ...installableIssue, install: null }], warnings: [] },
    })} />)
    expect(screen.queryByRole('button', { name: 'Install' })).toBeNull()
  })

  it('batch button appears only when at least one missing dep resolved, and fires once', () => {
    const onInstallAllMissing = vi.fn().mockResolvedValue(undefined)
    render(<ModsTab {...baseProps({
      compatResult: { compatible: false, issues: [installableIssue], warnings: [] },
      onInstallAllMissing,
    })} />)
    fireEvent.click(screen.getByRole('button', { name: /install all missing/i }))
    expect(onInstallAllMissing).toHaveBeenCalledTimes(1)
  })

  it('batch button is absent when no missing dep resolved', () => {
    render(<ModsTab {...baseProps({
      compatResult: { compatible: false, issues: [{ ...installableIssue, install: null }], warnings: [] },
    })} />)
    expect(screen.queryByRole('button', { name: /install all missing/i })).toBeNull()
  })

  it('per-dep Install disables while that dep is installing', () => {
    render(<ModsTab {...baseProps({
      compatResult: { compatible: false, issues: [installableIssue], warnings: [] },
      installingMissing: new Set(['missinglib']),
    })} />)
    expect(screen.getByRole('button', { name: /^Installing…$/ })).toBeDisabled()
  })
})
