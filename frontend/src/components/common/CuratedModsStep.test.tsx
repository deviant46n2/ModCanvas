import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { CuratedModsStep } from './CuratedModsStep'

vi.mock('../../services/mods', () => ({
  listCuratedMods: vi.fn(),
  installModrinthMod: vi.fn(),
}))

vi.mock('../../services/project', () => ({
  openPrismForProject: vi.fn(),
}))

import { listCuratedMods, installModrinthMod } from '../../services/mods'
import { openPrismForProject } from '../../services/project'

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
  vi.mocked(openPrismForProject).mockResolvedValue(undefined)
  vi.mocked(installModrinthMod).mockResolvedValue({})
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

  it('Modrinth picks get a one-click Install; CurseForge picks get the Prism guide instead', async () => {
    vi.mocked(listCuratedMods).mockResolvedValue([
      { source: 'modrinth', mod_id: 'kubejs', slug: 'kubejs', name: 'KubeJS', description: 'Recipe scripting.', ticked: true, core: true, blocked_reason: null, page_url: null },
      { source: 'curseforge', mod_id: '289412', slug: 'ftb-quests', name: 'FTB Quests', description: 'The quest book.', ticked: true, core: true, blocked_reason: null, page_url: null },
    ])
    renderStep()
    await screen.findByText('KubeJS')
    expect(screen.getByRole('button', { name: 'Install KubeJS' })).toBeInTheDocument()
    // CF pick has no in-app install button — the app can't back a CF download.
    expect(screen.queryByRole('button', { name: /install ftb quests/i })).toBeNull()
    expect(screen.getByText(/FTB Quests installs in Prism/i)).toBeInTheDocument()
    expect(screen.getByText('FTB Library')).toBeInTheDocument()
    expect(screen.getByText('FTB Teams')).toBeInTheDocument()
    expect(screen.getByText('Architectury')).toBeInTheDocument()
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

  it('renders blocked_reason on a pick whose metadata could not be verified', async () => {
    vi.mocked(listCuratedMods).mockResolvedValue([
      { source: 'curseforge', mod_id: '289412', slug: 'ftb-quests', name: 'FTB Quests', description: 'The quest book.', ticked: true, core: true, blocked_reason: 'CurseForge metadata fetch failed', page_url: null },
    ])
    renderStep()
    await screen.findAllByText('FTB Quests')
    expect(screen.getByText('CurseForge metadata fetch failed')).toBeInTheDocument()
  })

  it('opens Prism focused on the project instance', async () => {
    renderStep()
    await screen.findByText('Just Enough Items')
    fireEvent.click(screen.getByRole('button', { name: 'Open Prism to install these' }))
    await waitFor(() => {
      expect(openPrismForProject).toHaveBeenCalledWith('p1')
    })
  })

  it('falls back to manual project-page links when the pack has no Prism instance', async () => {
    vi.mocked(openPrismForProject).mockRejectedValue(
      'This pack is not tied to a Prism instance — install its mods manually from the project pages instead.',
    )
    vi.mocked(listCuratedMods).mockResolvedValue([
      { source: 'curseforge', mod_id: '289412', slug: 'ftb-quests', name: 'FTB Quests', description: 'The quest book.', ticked: true, core: true, blocked_reason: null, page_url: 'https://www.curseforge.com/minecraft/mc-mods/ftb-quests' },
    ])
    renderStep()
    await screen.findAllByText('FTB Quests')
    fireEvent.click(screen.getByRole('button', { name: 'Open Prism to install these' }))
    const link = await screen.findByRole('link', { name: 'FTB Quests' })
    expect(link).toHaveAttribute('href', 'https://www.curseforge.com/minecraft/mc-mods/ftb-quests')
  })

  it('shows the project page link on rows that have one', async () => {
    vi.mocked(listCuratedMods).mockResolvedValue([
      { source: 'curseforge', mod_id: '289412', slug: 'ftb-quests', name: 'FTB Quests', description: 'The quest book.', ticked: true, core: true, blocked_reason: null, page_url: 'https://www.curseforge.com/minecraft/mc-mods/ftb-quests' },
    ])
    renderStep()
    await screen.findAllByText('FTB Quests')
    expect(screen.getByRole('link', { name: 'Project page' })).toHaveAttribute(
      'href',
      'https://www.curseforge.com/minecraft/mc-mods/ftb-quests',
    )
  })

  it('continue refreshes the pack (picking up Prism-installed mods) then advances', async () => {
    const { onRefresh, onContinue } = renderStep()
    await screen.findByText('Just Enough Items')
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    await waitFor(() => {
      expect(onRefresh).toHaveBeenCalledTimes(1)
      expect(onContinue).toHaveBeenCalledTimes(1)
    })
  })

  it('skip advances without refreshing', async () => {
    const { onRefresh, onContinue } = renderStep()
    await screen.findByText('Just Enough Items')
    fireEvent.click(screen.getByRole('button', { name: 'Skip' }))
    expect(onRefresh).not.toHaveBeenCalled()
    expect(onContinue).toHaveBeenCalled()
  })
})
