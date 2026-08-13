import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { WizardStepper, type CreateProjectInput } from './WizardStepper'

vi.mock('../../services/instances', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/instances')>()
  return {
    ...actual,
    createMcInstance: vi.fn(),
    resolveLoaderVersion: vi.fn(),
  }
})

import { createMcInstance, resolveLoaderVersion } from '../../services/instances'

const created = {
  id: 'p1',
  name: 'My First Pack',
  description: '',
  minecraft_version: '1.21.1',
  mod_loader: 'NeoForge',
  pack_version: '1.0.0',
  author: '',
  created_at: '',
  updated_at: '',
  path: '/prism/instances/My_First_Pack/minecraft',
  source: 'modcanvas',
}

async function renderWizard(overrides: Partial<Parameters<typeof WizardStepper>[0]> = {}) {
  const onCreate = vi.fn<(input: CreateProjectInput) => Promise<typeof created>>().mockResolvedValue(created)
  render(
    <WizardStepper
      show
      presetTemplateId="ide-tour"
      postCreate
      onClose={() => {}}
      onCreate={onCreate}
      onRefresh={vi.fn().mockResolvedValue(undefined)}
      packLoaded={false}
      onDone={() => {}}
      onGuidedQuest={() => {}}
      {...overrides}
    />,
  )
  return onCreate
}

async function createPack() {
  fireEvent.change(screen.getByPlaceholderText('My First Pack'), { target: { value: 'My First Pack' } })
  fireEvent.click(screen.getByText('Create & continue'))
  await waitFor(() => expect(createMcInstance).toHaveBeenCalledTimes(1))
}

describe('WizardStepper', () => {
  beforeEach(() => {
    vi.clearAllMocks()
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
  })

  it('cannot create without a name', () => {
    renderWizard()
    const create = screen.getByText('Create & continue') as HTMLButtonElement
    expect(create.disabled).toBe(true)
  })

  it('resolves the loader version, creates the instance, and creates the pack on it with the preset template', async () => {
    const onCreate = await renderWizard()

    await createPack()

    expect(resolveLoaderVersion).toHaveBeenCalledWith('1.21.1', 'NeoForge')
    expect(createMcInstance).toHaveBeenCalledWith('My First Pack', '1.21.1', 'NeoForge', '21.1.248')
    expect(onCreate).toHaveBeenCalledWith({
      name: 'My First Pack',
      mcVersion: '1.21.1',
      modLoader: 'NeoForge',
      path: '/prism/instances/My_First_Pack/minecraft',
      templateId: 'ide-tour',
    })
  })

  it('an unresolvable loader version fails loudly and keeps the wizard open', async () => {
    const onCreate = await renderWizard()
    vi.mocked(resolveLoaderVersion).mockResolvedValue(null)

    fireEvent.change(screen.getByPlaceholderText('My First Pack'), { target: { value: 'My First Pack' } })
    fireEvent.click(screen.getByText('Create & continue'))

    await waitFor(() =>
      expect(screen.getByText(/Couldn't determine the latest NeoForge version/)).toBeTruthy(),
    )
    expect(createMcInstance).not.toHaveBeenCalled()
    expect(onCreate).not.toHaveBeenCalled()
  })

  it('a blank preset (null template) creates an empty pack and skips the post-create steps', async () => {
    const onDone = vi.fn()
    const onCreate = await renderWizard({ presetTemplateId: null, postCreate: false, onDone })

    await createPack()

    expect(onCreate).toHaveBeenCalledWith({
      name: 'My First Pack',
      mcVersion: '1.21.1',
      modLoader: 'NeoForge',
      path: '/prism/instances/My_First_Pack/minecraft',
      templateId: null,
    })
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('guided path runs the post-create steps: curated skip advances to the guided-quest step', async () => {
    const onGuidedQuest = vi.fn()
    const onDone = vi.fn()
    await renderWizard({ onGuidedQuest, onDone })

    await createPack()

    // Curated mods step: Skip advances to the guided-quest step.
    fireEvent.click(screen.getByText('Skip'))
    fireEvent.click(screen.getByText('Add my first quest'))
    expect(onGuidedQuest).toHaveBeenCalledTimes(1)
    expect(onDone).not.toHaveBeenCalled()
  })

  it('guided path create failure shows the error and keeps the wizard open', async () => {
    await renderWizard()
    vi.mocked(createMcInstance).mockRejectedValueOnce(new Error('scaffold refused: instance already has a quest book'))

    fireEvent.change(screen.getByPlaceholderText('My First Pack'), { target: { value: 'My First Pack' } })
    fireEvent.click(screen.getByText('Create & continue'))

    await waitFor(() =>
      expect(screen.getByText(/instance already has a quest book/)).toBeTruthy(),
    )
    expect(screen.getByText('Create & continue')).toBeTruthy()
  })
})
