import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { WizardStepper, type CreateProjectInput } from './WizardStepper'

vi.mock('../../services/instances', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/instances')>()
  return {
    ...actual,
    listMcInstances: vi.fn(),
    createMcInstance: vi.fn(),
    resolveLoaderVersion: vi.fn(),
  }
})
vi.mock('../../services/project', () => ({
  listProjectTemplates: vi.fn(),
}))

import { listMcInstances, createMcInstance, resolveLoaderVersion } from '../../services/instances'
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
    { id: 'exploration', name: 'First Steps — Play & Shape Your Pack', description: 'A starter chapter.' },
  ])
})

const created = {
  id: 'p1',
  name: 'Starter World',
  description: '',
  minecraft_version: '1.21.1',
  mod_loader: 'NeoForge',
  pack_version: '1.0.0',
  author: '',
  created_at: '',
  updated_at: '',
  path: '/prism/instances/starter-world/minecraft',
  source: 'modcanvas',
}

async function renderWizard() {
  const onCreate = vi.fn<(input: CreateProjectInput) => Promise<typeof created>>().mockResolvedValue(created)
  render(
    <WizardStepper
      show
      onClose={() => {}}
      onCreate={onCreate}
      onRefresh={vi.fn().mockResolvedValue(undefined)}
      packLoaded={false}
      onDone={() => {}}
      onGuidedQuest={() => {}}
    />,
  )
  await screen.findByText('Starter World')
  return onCreate
}

describe('WizardStepper', () => {
  it('instance path derives version/loader/path from the picked instance and passes the template', async () => {
    const onCreate = await renderWizard()

    fireEvent.click(screen.getByText('Starter World'))
    fireEvent.click(screen.getByText('Next'))
    fireEvent.click(screen.getByText('First Steps — Play & Shape Your Pack'))
    fireEvent.click(screen.getByText('Next'))
    fireEvent.click(screen.getByText('Create & continue'))

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
    fireEvent.click(screen.getByText('Create & continue'))

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

  it('create-a-new-instance path resolves the loader version, creates the instance, and creates the pack on it', async () => {
    const onCreate = await renderWizard()
    vi.mocked(resolveLoaderVersion).mockResolvedValue('21.1.248')
    vi.mocked(createMcInstance).mockResolvedValue({
      id: 'i-new',
      name: 'My First Pack',
      mc_version: '1.21.1',
      loader: 'NeoForge',
      loader_version: '21.1.248',
      game_dir: '/prism/instances/My_First_Pack/minecraft',
      status: 'Offline',
    })

    fireEvent.click(screen.getByText('Create a new instance'))
    fireEvent.change(screen.getByPlaceholderText('My First Pack'), { target: { value: 'My First Pack' } })
    fireEvent.click(screen.getByText('Next'))
    fireEvent.click(screen.getByText('First Steps — Play & Shape Your Pack'))
    fireEvent.click(screen.getByText('Next'))
    fireEvent.click(screen.getByText('Create & continue'))

    await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(1))
    // The loader version comes from the resolver, the pack lands ON the new
    // instance's game dir — launchable by construction.
    expect(resolveLoaderVersion).toHaveBeenCalledWith('1.21.1', 'NeoForge')
    expect(createMcInstance).toHaveBeenCalledWith('My First Pack', '1.21.1', 'NeoForge', '21.1.248')
    expect(onCreate).toHaveBeenCalledWith({
      name: 'My First Pack',
      mcVersion: '1.21.1',
      modLoader: 'NeoForge',
      path: '/prism/instances/My_First_Pack/minecraft',
      templateId: 'exploration',
    })
  })

  it('step 5 is the guided-first-quest handoff: primary button fires onGuidedQuest, skip advances to green check', async () => {
    const onGuidedQuest = vi.fn()
    const onDone = vi.fn()
    const onCreate = vi.fn<(input: CreateProjectInput) => Promise<typeof created>>().mockResolvedValue(created)
    render(
      <WizardStepper
        show
        onClose={() => {}}
        onCreate={onCreate}
        onRefresh={vi.fn().mockResolvedValue(undefined)}
        packLoaded={false}
        onDone={onDone}
        onGuidedQuest={onGuidedQuest}
      />,
    )
    await screen.findByText('Starter World')
    fireEvent.click(screen.getByText('Starter World'))
    fireEvent.click(screen.getByText('Next'))
    fireEvent.click(screen.getByText('First Steps — Play & Shape Your Pack'))
    fireEvent.click(screen.getByText('Next'))
    fireEvent.click(screen.getByText('Create & continue'))
    await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(1))
    // Curated mods step: Skip advances to step 5 (guided quest).
    fireEvent.click(screen.getByText('Skip'))
    fireEvent.click(screen.getByText('Add my first quest'))
    expect(onGuidedQuest).toHaveBeenCalledTimes(1)
    expect(onDone).not.toHaveBeenCalled()
  })
})
