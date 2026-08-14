import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useModState } from './useModState'
import { checkCompatibility, installModrinthMod } from '../services/api'

vi.mock('../services/api', () => ({
  getProjectMods: vi.fn().mockResolvedValue([]),
  getProjectModMetadata: vi.fn().mockResolvedValue([]),
  getDepNames: vi.fn().mockResolvedValue([]),
  checkCompatibility: vi.fn().mockResolvedValue({ compatible: true, issues: [] }),
  addMod: vi.fn().mockResolvedValue({}),
  removeMod: vi.fn().mockResolvedValue({}),
  scanInstanceMods: vi.fn().mockResolvedValue(0),
  installModrinthMod: vi.fn().mockResolvedValue({}),
}))

vi.mock('../components/ui/Toast', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}))

const project = {
  id: 'p1',
  name: 'Test Pack',
  description: '',
  minecraft_version: '1.21.1',
  mod_loader: 'neoforge',
  pack_version: '1.0.0',
  author: '',
  created_at: '',
  updated_at: '',
  path: '/tmp/instance',
  source: 'modcanvas',
}

describe('useModState', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const installPayload = {
    mod_id: 'missinglib',
    slug: 'missinglib',
    name: 'MissingLib',
  }

  it('installMissingDependency installs the payload and re-runs the check on success', async () => {
    const { result } = renderHook(() => useModState(project))
    await act(async () => {
      await result.current.installMissingDependency(installPayload)
    })
    expect(installModrinthMod).toHaveBeenCalledWith(expect.objectContaining({
      projectId: 'p1',
      modId: 'missinglib',
    }))
    expect(checkCompatibility).toHaveBeenCalledTimes(1)
  })

  it('installMissingDependency does not re-run the check when the install fails', async () => {
    vi.mocked(installModrinthMod).mockRejectedValueOnce('registry down')
    const { result } = renderHook(() => useModState(project))
    await act(async () => {
      await result.current.installMissingDependency(installPayload)
    })
    expect(checkCompatibility).not.toHaveBeenCalled()
  })

  it('installAllMissingDependencies installs every resolved dep once, skips unresolvable, re-checks once', async () => {
    const { result } = renderHook(() => useModState(project))
    act(() => {
      result.current.setCompatResult({
        compatible: false,
        issues: [
          { severity: 'Warning', message: 'm1', affected_mods: [], affected_mod_names: [], install: installPayload },
          { severity: 'Warning', message: 'm2', affected_mods: [], affected_mod_names: [], install: null },
          { severity: 'Warning', message: 'm3', affected_mods: [], affected_mod_names: [], install: { mod_id: 'dep2', slug: 'dep2', name: 'Dep Two' } },
        ],
        warnings: [],
      })
    })
    await act(async () => {
      await result.current.installAllMissingDependencies()
    })
    expect(installModrinthMod).toHaveBeenCalledTimes(2)
    expect(installModrinthMod).toHaveBeenNthCalledWith(1, expect.objectContaining({ modId: 'missinglib' }))
    expect(installModrinthMod).toHaveBeenNthCalledWith(2, expect.objectContaining({ modId: 'dep2' }))
    // One re-check after the whole batch, not one per install.
    expect(checkCompatibility).toHaveBeenCalledTimes(1)
  })
})
