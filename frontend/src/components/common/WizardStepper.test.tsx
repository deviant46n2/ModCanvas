import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { WizardStepper, type CreateProjectInput } from './WizardStepper'

vi.mock('../../services/instances', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/instances')>()
  return {
    ...actual,
    listMcInstances: vi.fn(),
  }
})
vi.mock('../../services/project', () => ({
  listProjectTemplates: vi.fn(),
}))

import { listMcInstances } from '../../services/instances'
import { listProjectTemplates } from '../../services/project'
import type { MinecraftInstance } from '../../services/instances'

const instances: MinecraftInstance[] = [
  {
    id: 'i1',
    name: 'Starter World',
    mc_version: '1.21.1',
    loader: 'NeoForge',
    loader_version: '21.1.45',
    game_dir: '/prism/instances/starter-world/minecraft',
    status: 'Offline',
  },
  {
    id: 'i2',
    name: 'Busy Instance',
    mc_version: '1.21.1',
    loader: 'NeoForge',
    loader_version: null,
    game_dir: '/prism/instances/busy/minecraft',
    status: 'Running',
  },
]

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(listMcInstances).mockResolvedValue(instances)
  vi.mocked(listProjectTemplates).mockResolvedValue([
    { id: 'exploration', name: 'Exploration Starter', description: 'A starter chapter.' },
  ])
})

async function renderWizard() {
  const onCreate = vi.fn<(input: CreateProjectInput) => Promise<void>>().mockResolvedValue(undefined)
  render(<WizardStepper show onClose={() => {}} onCreate={onCreate} />)
  await screen.findByText('Starter World')
  return onCreate
}

describe('WizardStepper', () => {
  it('instance path derives version/loader/path from the picked instance and passes the template', async () => {
    const onCreate = await renderWizard()

    fireEvent.click(screen.getByText('Starter World'))
    fireEvent.click(screen.getByText('Next'))
    fireEvent.click(screen.getByText('Exploration Starter'))
    fireEvent.click(screen.getByText('Next'))
    fireEvent.click(screen.getByText('Create Pack'))

    await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(1))
    expect(onCreate).toHaveBeenCalledWith({
      name: 'Starter World',
      mcVersion: '1.21.1',
      modLoader: 'NeoForge',
      path: '/prism/instances/starter-world/minecraft',
      templateId: 'exploration',
    })
  })

  it('running instances are not offered as candidates', async () => {
    await renderWizard()
    expect(screen.queryByText('Busy Instance')).toBeNull()
    expect(screen.getByText('Starter World')).toBeTruthy()
  })

  it('scratch path keeps the classic form and starts empty', async () => {
    const onCreate = await renderWizard()

    fireEvent.click(screen.getByText('Start from scratch'))
    const name = screen.getByPlaceholderText('My Modpack')
    fireEvent.change(name, { target: { value: 'My First Pack' } })
    fireEvent.click(screen.getByText('Next'))
    // Start empty (no template) is the default for the veteran path.
    fireEvent.click(screen.getByText('Next'))
    fireEvent.click(screen.getByText('Create Pack'))

    await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(1))
    expect(onCreate).toHaveBeenCalledWith({
      name: 'My First Pack',
      mcVersion: '1.21.1',
      modLoader: 'Forge',
      path: '~/modpacks/my-first-pack',
      templateId: null,
    })
  })

  it('cannot advance step 1 without a choice', async () => {
    await renderWizard()
    const next = screen.getByText('Next') as HTMLButtonElement
    expect(next.disabled).toBe(true)
  })
})
