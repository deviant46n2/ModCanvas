import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ModsTab, type ModsTabProps } from './ModsTab'

vi.mock('react-window', () => ({
  List: ({ rowComponent: Row, rowCount, rowProps }: any) => (
    <div data-testid="virtual-list">
      {Array.from({ length: rowCount }, (_, i) => (
        <Row key={i} index={i} style={{}} {...rowProps} />
      ))}
    </div>
  ),
}))

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
    searchQuery: '',
    onSearchQueryChange: vi.fn(),
    onSearchMods: vi.fn(),
    searchResults: [],
    onAddMod: vi.fn(),
    onToggleMod: vi.fn().mockResolvedValue(undefined),
    onRemoveMod: vi.fn(),
    modMetadata: new Map(),
    projectModsForDeps: mods,
    getMissingDependencies: () => [],
    getModNameById: (id: string) => id,
    searchSource: 'modrinth',
    onSearchSourceChange: vi.fn(),
    installingIds: new Set(),
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
})
