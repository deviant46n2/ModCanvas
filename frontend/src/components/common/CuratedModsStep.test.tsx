import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { CuratedModsStep } from './CuratedModsStep'

vi.mock('../../services/mods', () => ({
  listCuratedMods: vi.fn(),
  installModrinthMod: vi.fn(),
  checkCompatibility: vi.fn(),
}))

import { listCuratedMods, installModrinthMod, checkCompatibility } from '../../services/mods'

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
  path: '/tmp/PrismLauncher/instances/Test/minecraft',
  source: 'modcanvas',
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(listCuratedMods).mockResolvedValue([
    { source: 'modrinth', mod_id: 'kubejs', slug: 'kubejs', name: 'KubeJS', description: 'Recipe scripting.', ticked: true, core: true, blocked_reason: null, page_url: null },
    { source: 'modrinth', mod_id: 'jei', slug: 'jei', name: 'Just Enough Items', description: 'See recipes.', ticked: true, core: false, blocked_reason: null, page_url: null },
    { source: 'modrinth', mod_id: 'controllable', slug: 'controllable', name: 'Controllable', description: 'Controller.', ticked: false, core: false, blocked_reason: null, page_url: null },
  ])
  vi.mocked(installModrinthMod).mockResolvedValue({})
  vi.mocked(checkCompatibility).mockResolvedValue({ compatible: true, issues: [], warnings: [] })
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

describe('CuratedModsStep (PRISM-LEAN)', () => {
  it('renders the curated list with core and optional sections', async () => {
    renderStep()
    await screen.findByText('Just Enough Items')
    expect(screen.getByText('Needed by ModCanvas')).toBeInTheDocument()
    expect(screen.getByText('Goes great with your pack')).toBeInTheDocument()
    expect(screen.getByText('KubeJS')).toBeInTheDocument()
    expect(screen.getByText('Controllable')).toBeInTheDocument()
  })

  it('CurseForge picks are NOT rendered as rows — the guide step owns them; continue still routes there', async () => {
    vi.mocked(listCuratedMods).mockResolvedValue([
      { source: 'modrinth', mod_id: 'kubejs', slug: 'kubejs', name: 'KubeJS', description: 'Recipe scripting.', ticked: true, core: true, blocked_reason: null, page_url: null },
      { source: 'curseforge', mod_id: '289412', slug: 'ftb-quests', name: 'FTB Quests', description: 'The quest book.', ticked: true, core: true, blocked_reason: null, page_url: null },
    ])
    const props = renderStep()
    await screen.findByText('KubeJS')
    // The CF pick is not a row here (s55: non-actionable row in an action
    // list = broken affordance); the header points to the next step instead.
    expect(screen.queryByText('The quest book.')).toBeNull()
    expect(screen.getByText(/quest book mod — comes in the next step/i)).toBeInTheDocument()
    // The wizard is still routed to the Prism guide step.
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    await waitFor(() => {
      expect(props.onContinue).toHaveBeenCalledWith(true)
    })
  })

  it('continue without a CurseForge pick goes straight to the green check', async () => {
    const props = renderStep()
    await screen.findByText('Just Enough Items')
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    await waitFor(() => {
      expect(props.onContinue).toHaveBeenCalledWith(false)
    })
  })

  it('one-click installs a Modrinth pick in-app and marks it installed', async () => {
    renderStep()
    await screen.findByText('Just Enough Items')
    fireEvent.click(screen.getByRole('button', { name: 'Install KubeJS' }))
    await waitFor(() => {
      expect(installModrinthMod).toHaveBeenCalledWith({
        projectId: 'p1',
        modId: 'kubejs',
        slug: 'kubejs',
        name: 'KubeJS',
        description: 'Recipe scripting.',
      })
    })
    expect(await screen.findByRole('button', { name: 'KubeJS installed' })).toBeDisabled()
  })

  it('install failure surfaces the error and leaves the row installable', async () => {
    vi.mocked(installModrinthMod).mockRejectedValueOnce('registry down')
    renderStep()
    await screen.findByText('Just Enough Items')
    fireEvent.click(screen.getByRole('button', { name: 'Install KubeJS' }))
    await screen.findByText('registry down')
    expect(screen.getByRole('button', { name: 'Install KubeJS' })).toBeInTheDocument()
  })

  it('closes the dep loop inline: a pick\'s missing required dep gets a one-click Install', async () => {
    vi.mocked(checkCompatibility).mockResolvedValue({
      compatible: false,
      issues: [{
        severity: 'Warning',
        message: "'KubeJS' requires 'Rhino' which is not in the project",
        affected_mods: ['kubejs', 'rhino'],
        affected_mod_names: ['KubeJS', 'Rhino'],
        install: { mod_id: 'rhino', slug: 'rhino', name: 'Rhino' },
      }],
      warnings: [],
    })
    renderStep()
    await screen.findByText("'KubeJS' requires 'Rhino' which is not in the project")
    fireEvent.click(screen.getByRole('button', { name: 'Install Rhino' }))
    await waitFor(() => {
      expect(installModrinthMod).toHaveBeenCalledWith({
        projectId: 'p1',
        modId: 'rhino',
        slug: 'rhino',
        name: 'Rhino',
      })
    })
  })

  it('an unresolvable dep issue renders without an install button (no lie)', async () => {
    vi.mocked(listCuratedMods).mockResolvedValue([])
    vi.mocked(checkCompatibility).mockResolvedValue({
      compatible: false,
      issues: [{
        severity: 'Warning',
        message: "'X' requires 'Y' which is not in the project",
        affected_mods: ['x', 'y'],
        affected_mod_names: ['X', 'Y'],
        install: null,
      }],
      warnings: [],
    })
    renderStep()
    await screen.findByText(/requires 'Y'/)
    expect(screen.queryByRole('button', { name: /^Install/ })).toBeNull()
  })

  it('renders blocked_reason on a pick whose metadata could not be verified', async () => {
    vi.mocked(listCuratedMods).mockResolvedValue([
      { source: 'modrinth', mod_id: 'kubejs', slug: 'kubejs', name: 'KubeJS', description: 'Recipe scripting.', ticked: true, core: true, blocked_reason: 'Modrinth metadata fetch failed', page_url: null },
    ])
    renderStep()
    await screen.findByText('KubeJS')
    expect(screen.getByText('Modrinth metadata fetch failed')).toBeInTheDocument()
  })

  it('shows the project page link on rows that have one', async () => {
    vi.mocked(listCuratedMods).mockResolvedValue([
      { source: 'modrinth', mod_id: 'kubejs', slug: 'kubejs', name: 'KubeJS', description: 'Recipe scripting.', ticked: true, core: true, blocked_reason: null, page_url: 'https://modrinth.com/mod/kubejs' },
    ])
    renderStep()
    await screen.findByText('KubeJS')
    expect(screen.getByRole('link', { name: 'Project page' })).toHaveAttribute(
      'href',
      'https://modrinth.com/mod/kubejs',
    )
  })

  it('continue auto-installs the ticked Modrinth picks, skips unticked + CF, refreshes, then advances', async () => {
    vi.mocked(listCuratedMods).mockResolvedValue([
      { source: 'modrinth', mod_id: 'kubejs', slug: 'kubejs', name: 'KubeJS', description: 'Recipe scripting.', ticked: true, core: true, blocked_reason: null, page_url: null },
      { source: 'modrinth', mod_id: 'jei', slug: 'jei', name: 'Just Enough Items', description: 'See recipes.', ticked: true, core: false, blocked_reason: null, page_url: null },
      { source: 'modrinth', mod_id: 'controllable', slug: 'controllable', name: 'Controllable', description: 'Controller.', ticked: false, core: false, blocked_reason: null, page_url: null },
      { source: 'curseforge', mod_id: '289412', slug: 'ftb-quests', name: 'FTB Quests', description: 'The quest book.', ticked: true, core: true, blocked_reason: null, page_url: null },
    ])
    const { onRefresh, onContinue } = renderStep()
    await screen.findByText('Just Enough Items')
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    await waitFor(() => {
      // ticked Modrinth picks install automatically (keyless API);
      // unticked opt-ins and CF picks do not.
      expect(installModrinthMod).toHaveBeenCalledWith(expect.objectContaining({ modId: 'kubejs' }))
      expect(installModrinthMod).toHaveBeenCalledWith(expect.objectContaining({ modId: 'jei' }))
      expect(installModrinthMod).not.toHaveBeenCalledWith(expect.objectContaining({ modId: 'controllable' }))
      expect(installModrinthMod).not.toHaveBeenCalledWith(expect.objectContaining({ modId: '289412' }))
      expect(onRefresh).toHaveBeenCalledTimes(1)
      expect(onContinue).toHaveBeenCalledTimes(1)
      expect(onContinue).toHaveBeenCalledWith(true)
    })
  })

  it('auto-install skips picks already installed via their row button', async () => {
    const { onRefresh, onContinue } = renderStep()
    await screen.findByText('Just Enough Items')
    fireEvent.click(screen.getByRole('button', { name: 'Install KubeJS' }))
    await waitFor(() => {
      expect(installModrinthMod).toHaveBeenCalledWith(expect.objectContaining({ modId: 'kubejs' }))
    })
    vi.mocked(installModrinthMod).mockClear()
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    await waitFor(() => {
      expect(installModrinthMod).not.toHaveBeenCalledWith(expect.objectContaining({ modId: 'kubejs' }))
      expect(installModrinthMod).toHaveBeenCalledWith(expect.objectContaining({ modId: 'jei' }))
      expect(onRefresh).toHaveBeenCalledTimes(1)
      expect(onContinue).toHaveBeenCalledTimes(1)
    })
  })

  it('an auto-install failure surfaces the error but still advances (the green check stays honest)', async () => {
    vi.mocked(installModrinthMod)
      .mockRejectedValueOnce('registry down')
      .mockResolvedValue({})
    const { onContinue } = renderStep()
    await screen.findByText('Just Enough Items')
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    await screen.findByText(/couldn't install some mods/i)
    expect(onContinue).toHaveBeenCalledTimes(1)
  })

  it('skip advances without installing or refreshing', async () => {
    const { onRefresh, onContinue } = renderStep()
    await screen.findByText('Just Enough Items')
    fireEvent.click(screen.getByRole('button', { name: 'Skip' }))
    expect(installModrinthMod).not.toHaveBeenCalled()
    expect(onRefresh).not.toHaveBeenCalled()
    expect(onContinue).toHaveBeenCalledWith(false)
  })
})
