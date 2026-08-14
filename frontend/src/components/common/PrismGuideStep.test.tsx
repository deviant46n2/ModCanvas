import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { PrismGuideStep } from './PrismGuideStep'

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
    { source: 'curseforge', mod_id: '289412', slug: 'ftb-quests', name: 'FTB Quests', description: 'The quest book.', ticked: true, core: true, blocked_reason: null, page_url: null },
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
  render(<PrismGuideStep {...props} />)
  return props
}

describe('PrismGuideStep (s55: FTB Quests becomes its own wizard step)', () => {
  it('renders the exact Prism install instructions, naming the three required deps', async () => {
    renderStep()
    await screen.findByText(/FTB Quests installs in Prism/i)
    // The full walkthrough (s55 corrections, from the student's live run):
    // select instance → Edit → Mods → Download Mods → switch to CurseForge.
    expect(screen.getByText('Edit')).toBeInTheDocument()
    expect(screen.getByText('Download Mods')).toBeInTheDocument()
    expect(screen.getByText('CurseForge')).toBeInTheDocument()
    expect(screen.getByText('FTB Library')).toBeInTheDocument()
    expect(screen.getByText('FTB Teams')).toBeInTheDocument()
    expect(screen.getByText('Architectury')).toBeInTheDocument()
    // Forced learning: the only action is Continue — no Skip on this step.
    expect(screen.queryByRole('button', { name: 'Skip' })).toBeNull()
  })

  it('opens Prism focused on the project instance', async () => {
    renderStep()
    await screen.findByText(/FTB Quests installs in Prism/i)
    fireEvent.click(screen.getByRole('button', { name: 'Open Prism' }))
    await waitFor(() => {
      expect(openPrismForProject).toHaveBeenCalledWith('p1')
    })
  })

  it('falls back to a manual project-page link when Prism cannot be opened', async () => {
    vi.mocked(listCuratedMods).mockResolvedValue([
      { source: 'curseforge', mod_id: '289412', slug: 'ftb-quests', name: 'FTB Quests', description: 'The quest book.', ticked: true, core: true, blocked_reason: null, page_url: 'https://www.curseforge.com/minecraft/mc-mods/ftb-quests' },
    ])
    vi.mocked(openPrismForProject).mockRejectedValue('Prism is not installed')
    renderStep()
    await screen.findByText(/FTB Quests installs in Prism/i)
    fireEvent.click(screen.getByRole('button', { name: 'Open Prism' }))
    const link = await screen.findByRole('link', { name: 'FTB Quests' })
    expect(link).toHaveAttribute('href', 'https://www.curseforge.com/minecraft/mc-mods/ftb-quests')
  })

  it('continue refreshes the pack (picking up Prism-installed mods) then advances to the green check', async () => {
    const { onRefresh, onContinue } = renderStep()
    await screen.findByText(/FTB Quests installs in Prism/i)
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    await waitFor(() => {
      expect(onRefresh).toHaveBeenCalledTimes(1)
      expect(onContinue).toHaveBeenCalledTimes(1)
    })
  })

  it('degrades to the default copy when the curated list cannot be loaded', async () => {
    vi.mocked(listCuratedMods).mockRejectedValue('network down')
    renderStep()
    await screen.findByText(/FTB Quests installs in Prism/i)
    expect(screen.getByRole('button', { name: 'Open Prism' })).toBeInTheDocument()
  })
})
