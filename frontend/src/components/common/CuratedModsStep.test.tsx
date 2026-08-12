import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { CuratedModsStep } from './CuratedModsStep'

vi.mock('../../services/mods', () => ({
  listCuratedMods: vi.fn(),
  installModFromSearch: vi.fn(),
  checkCompatibility: vi.fn(),
}))

vi.mock('../../services/project', () => ({
  setCurseforgeApiKey: vi.fn(),
}))

import { listCuratedMods, installModFromSearch, checkCompatibility } from '../../services/mods'
import { setCurseforgeApiKey } from '../../services/project'

const project = {
  id: 'p1',
  name: 'Test Pack',
  description: '',
  minecraft_version: '1.21.1',
  mod_loader: 'NeoForge',
  pack_version: '1.0.0',
  author: '',
  created_at: '',
  updated_at: '',
  path: '/tmp/instance',
  source: 'modcanvas',
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(listCuratedMods).mockResolvedValue([
    { source: 'modrinth', mod_id: 'kubejs', slug: 'kubejs', name: 'KubeJS', description: 'Recipe scripting.', ticked: true, core: true, blocked_reason: null, page_url: null },
    { source: 'modrinth', mod_id: 'jei', slug: 'jei', name: 'Just Enough Items', description: 'See recipes.', ticked: true, core: false, blocked_reason: null, page_url: null },
    { source: 'modrinth', mod_id: 'controllable', slug: 'controllable', name: 'Controllable', description: 'Controller.', ticked: false, core: false, blocked_reason: null, page_url: null },
  ])
  vi.mocked(installModFromSearch).mockResolvedValue({ name: 'installed' })
  vi.mocked(checkCompatibility).mockResolvedValue({ compatible: false, issues: [], warnings: [] })
})

function renderStep(over = {}) {
  const props = {
    project,
    onRefresh: vi.fn().mockResolvedValue(undefined),
    onContinue: vi.fn(),
    ...over,
  }
  render(<CuratedModsStep {...props} />)
  return props
}

describe('CuratedModsStep', () => {
  it('renders the filtered list with pre-ticked defaults', async () => {
    renderStep()
    const jei = await screen.findByText('Just Enough Items')
    expect(jei).toBeInTheDocument()
    const jeiBox = screen.getByRole('checkbox', { name: 'Install Just Enough Items' })
    expect(jeiBox).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Install Controllable' })).not.toBeChecked()
  })

  it('renders core picks in their own section', async () => {
    renderStep()
    await screen.findByText('Just Enough Items')
    expect(screen.getByText('Needed by ModCanvas')).toBeInTheDocument()
    expect(screen.getByText('Goes great with your pack')).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'Install KubeJS' })).toBeChecked()
  })

  it('shows a blocked CurseForge pick disabled with its reason, never ticked', async () => {
    vi.mocked(listCuratedMods).mockResolvedValue([
      {
        source: 'curseforge', mod_id: '', slug: '', name: 'FTB Quests',
        description: 'The quest book.', ticked: false, core: true,
        blocked_reason: 'needs a CurseForge API key — add one in Settings (gear icon)',
        page_url: 'https://www.curseforge.com/minecraft/mc-mods/ftb-quests',
      },
    ])
    renderStep()
    const ftb = await screen.findAllByText('FTB Quests')
    expect(ftb.length).toBeGreaterThan(0)
    // The blocked row carries its reason AND the guidance box appears with
    // an inline key field so the user can unlock the pick right here.
    expect(screen.getAllByText(/needs a CurseForge API key/).length).toBeGreaterThan(0)
    expect(screen.getByPlaceholderText('CurseForge API key')).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'Install FTB Quests' })).toBeDisabled()
    // The blocked box also offers the manual-download page (s48).
    expect(screen.getByRole('link', { name: /curseforge.com\/minecraft\/mc-mods\/ftb-quests/ })).toBeInTheDocument()
  })

  it('saving a key offers a re-check that refetches the list', async () => {
    vi.mocked(listCuratedMods).mockResolvedValue([
      {
        source: 'curseforge', mod_id: '', slug: '', name: 'FTB Quests',
        description: 'The quest book.', ticked: false, core: true,
        blocked_reason: 'needs a CurseForge API key',
        page_url: null,
      },
    ])
    vi.mocked(setCurseforgeApiKey).mockResolvedValue('kernel keyring')
    renderStep()
    await screen.findAllByText('FTB Quests')
    fireEvent.change(screen.getByPlaceholderText('CurseForge API key'), { target: { value: 'cf-secret' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save key' }))
    const recheck = await screen.findByRole('button', { name: 'Re-check' })
    fireEvent.click(recheck)
    // The refetch calls the service again with the same project.
    await waitFor(() => {
      expect(listCuratedMods).toHaveBeenCalledTimes(2)
    })
  })

  it('install selected installs only ticked mods, then surfaces transitive deps', async () => {
    vi.mocked(checkCompatibility).mockResolvedValue({
      compatible: false,
      issues: [
        {
          severity: 'Warning',
          message: "'JEI' requires 'cloth-config' which is not in the project",
          affected_mods: ['jei', 'cloth-config'],
          affected_mod_names: ['JEI', 'Cloth Config'],
          install: { source: 'modrinth', mod_id: 'cloth-config', slug: 'cloth-config', name: 'Cloth Config' },
        },
      ],
      warnings: [],
    })
    renderStep()
    await screen.findByText('Just Enough Items')
    fireEvent.click(screen.getByRole('button', { name: /install selected/i }))

    await waitFor(() => {
      expect(installModFromSearch).toHaveBeenCalledTimes(1)
    })
    // Unticked mod is not installed.
    expect(installModFromSearch).toHaveBeenCalledWith(expect.objectContaining({ modId: 'jei' }))
    expect(installModFromSearch).not.toHaveBeenCalledWith(expect.objectContaining({ modId: 'controllable' }))

    // The transitive dep shows with its own one-click install.
    const depButton = await screen.findByRole('button', { name: 'Install' })
    fireEvent.click(depButton)
    await waitFor(() => {
      expect(installModFromSearch).toHaveBeenCalledWith(expect.objectContaining({ modId: 'cloth-config' }))
    })
  })

  it('skip goes straight to continue without installing', async () => {
    const { onContinue } = renderStep()
    await screen.findByText('Just Enough Items')
    fireEvent.click(screen.getByRole('button', { name: 'Skip' }))
    expect(installModFromSearch).not.toHaveBeenCalled()
    expect(onContinue).toHaveBeenCalled()
  })

  it('failed installs offer a per-mod Retry that re-runs the install', async () => {
    // One ticked mod, so the failure is unambiguous.
    vi.mocked(listCuratedMods).mockResolvedValue([
      { source: 'curseforge', mod_id: '289412', slug: 'ftb-quests', name: 'FTB Quests', description: 'The quest book.', ticked: true, core: true, blocked_reason: null, page_url: null },
    ])
    vi.mocked(installModFromSearch)
      .mockRejectedValueOnce('Invalid CurseForge project id: curseforge:289412')
      .mockResolvedValueOnce({ name: 'installed' })
    renderStep()
    await screen.findByText('FTB Quests')
    fireEvent.click(screen.getByRole('button', { name: /install selected/i }))

    // The failure surfaces with the real error and a Retry button.
    const retry = await screen.findByRole('button', { name: 'Retry' })
    expect(screen.getByText(/Invalid CurseForge project id/)).toBeInTheDocument()
    expect(screen.getByText(/check it in Settings/)).toBeInTheDocument()

    fireEvent.click(retry)
    await waitFor(() => {
      expect(installModFromSearch).toHaveBeenCalledTimes(2)
    })
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull()
    expect(screen.getByText('Installed ✓')).toBeInTheDocument()
  })

  it('continue after installs refreshes the pack then advances', async () => {
    const { onRefresh, onContinue } = renderStep()
    await screen.findByText('Just Enough Items')
    fireEvent.click(screen.getByRole('button', { name: /install selected/i }))
    // Dep check returns no issues -> Continue becomes available.
    const cont = await screen.findByRole('button', { name: 'Continue' })
    fireEvent.click(cont)
    await waitFor(() => {
      expect(onRefresh).toHaveBeenCalledTimes(1)
      expect(onContinue).toHaveBeenCalledTimes(1)
    })
  })
})
