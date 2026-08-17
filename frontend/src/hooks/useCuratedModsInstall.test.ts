import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useCuratedModsInstall } from './useCuratedModsInstall'
import { listCuratedMods, installModrinthMod, checkCompatibility } from '../services/mods'
import { usePackHealthStore } from '../core/pack-health/pack-health-store'
import type { CuratedMod, Project } from '../services/types'

vi.mock('../services/mods', () => ({
  listCuratedMods: vi.fn(),
  installModrinthMod: vi.fn(),
  checkCompatibility: vi.fn(),
}))

const listMock = listCuratedMods as unknown as ReturnType<typeof vi.fn>
const installMock = installModrinthMod as unknown as ReturnType<typeof vi.fn>
const compatMock = checkCompatibility as unknown as ReturnType<typeof vi.fn>

function project(): Project {
  return {
    id: 'proj-1',
    name: 'Test Pack',
    path: '/tmp/pack',
    minecraft_version: '1.21.1',
    mod_loader: 'neoforge',
    pack_format: 'modcanvas',
    pack_version: '1.0.0',
    author: '',
    description: '',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    source: 'modcanvas',
  } as unknown as Project
}

function mod(over: Partial<CuratedMod> = {}): CuratedMod {
  return {
    mod_id: 'mod:1',
    slug: 'mod-1',
    name: 'Mod 1',
    description: 'desc',
    source: 'modrinth',
    core: false,
    ticked: false,
    blocked_reason: null,
    page_url: null,
    ...over,
  } as CuratedMod
}

describe('useCuratedModsInstall', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    listMock.mockResolvedValue([])
    compatMock.mockResolvedValue({ issues: [] })
    installMock.mockResolvedValue(undefined)
    usePackHealthStore.getState().setDepIssues([])
  })

  it('loads the curated list on mount', async () => {
    listMock.mockResolvedValue([mod({ mod_id: 'a', slug: 'a', name: 'A' })])
    const { result } = renderHook(() => useCuratedModsInstall(project()))

    expect(result.current.mods).toBeNull()
    await waitFor(() => expect(result.current.mods).toHaveLength(1))
    expect(result.current.error).toBeNull()
  })

  it('surfaces a load error honestly', async () => {
    listMock.mockRejectedValue('boom')
    const { result } = renderHook(() => useCuratedModsInstall(project()))

    await waitFor(() => expect(result.current.error).toBe('boom'))
    expect(result.current.mods).toBeNull()
  })

  it('one-click install marks the mod installed and refreshes deps', async () => {
    const { result } = renderHook(() => useCuratedModsInstall(project()))

    await act(async () => {
      await result.current.handleInstall(mod({ mod_id: 'sodium', slug: 'sodium', name: 'Sodium' }))
    })

    expect(installMock).toHaveBeenCalledWith(
      expect.objectContaining({ modId: 'sodium', slug: 'sodium', name: 'Sodium' }),
    )
    expect(result.current.installed.has('sodium')).toBe(true)
    expect(compatMock).toHaveBeenCalledTimes(2) // mount + post-install refresh
  })

  it('continue installs ticked picks then gate-only required mods, no double install', async () => {
    listMock.mockResolvedValue([])
    const { result } = renderHook(() => useCuratedModsInstall(project()))
    await waitFor(() => expect(result.current.mods).not.toBeNull())

    // KubeJS is both a ticked pick AND a CORE_MOD_PATTERNS gate entry — the
    // gate loop must skip it (pickIds guard). Rhino (KubeJS's required dep)
    // is gate-only and not on disk — it must install.
    const tickedPick = mod({ mod_id: 'kubejs', slug: 'kubejs', name: 'KubeJS', ticked: true })
    await act(async () => {
      await result.current.handleContinue([tickedPick], [])
    })

    const calls = installMock.mock.calls.map((c) => c[0].modId)
    // KubeJS exactly once (pick loop only — never the gate loop).
    expect(calls.filter((id) => id === 'kubejs')).toHaveLength(1)
    expect(calls).toContain('rhino')
    expect(result.current.installed.has('kubejs')).toBe(true)
    expect(result.current.installed.has('rhino')).toBe(true)
  })

  it('does not gate-install a required mod already on disk', async () => {
    const { result } = renderHook(() => useCuratedModsInstall(project()))

    await act(async () => {
      // installedMods = scanned jar names — kubejs is present, so the gate
      // loop must skip it entirely (no picks at all).
      await result.current.handleContinue([], ['kubejs-neoforge-2101.7.2.jar'])
    })

    const calls = installMock.mock.calls.map((c) => c[0].modId)
    expect(calls).not.toContain('kubejs')
    expect(calls).toContain('rhino')
  })

  it('aggregates install failures into the error, keeps going', async () => {
    installMock.mockImplementation(({ modId }: { modId: string }) => {
      if (modId === 'good') return Promise.resolve()
      return Promise.reject('network down')
    })
    const { result } = renderHook(() => useCuratedModsInstall(project()))

    await act(async () => {
      await result.current.handleContinue(
        [mod({ mod_id: 'good', slug: 'good', name: 'Good' }), mod({ mod_id: 'bad', slug: 'bad', name: 'Bad' })],
        null,
      )
    })

    expect(result.current.error).toContain('Bad')
    expect(result.current.error).toContain('network down')
    expect(result.current.installed.has('good')).toBe(true)
    expect(result.current.installed.has('bad')).toBe(false)
    expect(result.current.autoInstalling).toBe(false)
  })

  it('clears the auto-install state after the loop', async () => {
    const { result } = renderHook(() => useCuratedModsInstall(project()))

    await act(async () => {
      await result.current.handleContinue([mod({ mod_id: 'a', slug: 'a', name: 'A', ticked: true })], null)
    })

    // The transient autoInstalling=true is React render state (unobservable
    // synchronously); the contract is that it is false and progress cleared
    // once the loop completes.
    expect(result.current.autoInstalling).toBe(false)
    expect(result.current.autoProgress).toBeNull()
    expect(installMock).toHaveBeenCalled()
  })
})