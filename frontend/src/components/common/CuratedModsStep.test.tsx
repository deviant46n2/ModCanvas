import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { CuratedModsStep } from './CuratedModsStep'

vi.mock('../../services/mods', () => ({
  listCuratedMods: vi.fn(),
}))

vi.mock('../../services/project', () => ({
  openPrismForProject: vi.fn(),
}))

import { listCuratedMods } from '../../services/mods'
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

  it('offers the Prism handoff as the only install action — no in-app install', async () => {
    renderStep()
    await screen.findByText('Just Enough Items')
    expect(screen.getByRole('button', { name: 'Open Prism to install these' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /install selected/i })).toBeNull()
    expect(screen.queryByRole('checkbox')).toBeNull()
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
    await screen.findByText('FTB Quests')
    fireEvent.click(screen.getByRole('button', { name: 'Open Prism to install these' }))
    const link = await screen.findByRole('link', { name: 'FTB Quests' })
    expect(link).toHaveAttribute('href', 'https://www.curseforge.com/minecraft/mc-mods/ftb-quests')
  })

  it('shows the project page link on rows that have one', async () => {
    vi.mocked(listCuratedMods).mockResolvedValue([
      { source: 'curseforge', mod_id: '289412', slug: 'ftb-quests', name: 'FTB Quests', description: 'The quest book.', ticked: true, core: true, blocked_reason: null, page_url: 'https://www.curseforge.com/minecraft/mc-mods/ftb-quests' },
    ])
    renderStep()
    await screen.findByText('FTB Quests')
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
