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
      installedMods={null}
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

  it('guided path runs the post-create steps: curated skip advances to the green check', async () => {
    const onDone = vi.fn()
    await renderWizard({ onDone })

    await createPack()

    // Curated mods step: Skip advances to the green-check step.
    fireEvent.click(screen.getByText('Skip'))
    expect(onDone).not.toHaveBeenCalled()
    expect(screen.getByText(/green check/)).toBeInTheDocument()
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

  it('reopening the wizard resets to a fresh session (no stale step or project)', async () => {
    // s49 regression: the wizard stays mounted when hidden, so every open
    // must reset — a previous session's step/project leaked into the next
    // pick ("immediately step 3", "project not found" from a stale id).
    const { rerender } = render(
      <WizardStepper
        show
        presetTemplateId="ide-tour"
        postCreate
        onClose={() => {}}
        onCreate={vi.fn().mockResolvedValue(created)}
        onRefresh={vi.fn().mockResolvedValue(undefined)}
        packLoaded={false}
        onDone={() => {}}
        installedMods={null}
      />,
    )

    // Advance to the curated step (create), then to the green check.
    fireEvent.change(screen.getByPlaceholderText('My First Pack'), { target: { value: 'My First Pack' } })
    fireEvent.click(screen.getByText('Create & continue'))
    await waitFor(() => expect(createMcInstance).toHaveBeenCalledTimes(1))
    fireEvent.click(screen.getByText('Skip'))
    expect(screen.getByText(/green check/)).toBeTruthy()

    // Close and reopen — must land on step 1 with an empty name.
    rerender(
      <WizardStepper
        show={false}
        presetTemplateId="ide-tour"
        postCreate
        onClose={() => {}}
        onCreate={vi.fn().mockResolvedValue(created)}
        onRefresh={vi.fn().mockResolvedValue(undefined)}
        packLoaded={false}
        onDone={() => {}}
        installedMods={null}
      />,
    )
    rerender(
      <WizardStepper
        show
        presetTemplateId="ide-tour"
        postCreate
        onClose={() => {}}
        onCreate={vi.fn().mockResolvedValue(created)}
        onRefresh={vi.fn().mockResolvedValue(undefined)}
        packLoaded={false}
        onDone={() => {}}
        installedMods={null}
      />,
    )

    await waitFor(() => expect(screen.getByPlaceholderText('My First Pack')).toBeTruthy())
    expect((screen.getByPlaceholderText('My First Pack') as HTMLInputElement).value).toBe('')
    expect(screen.queryByText(/green check/)).toBeNull()
  })
})
