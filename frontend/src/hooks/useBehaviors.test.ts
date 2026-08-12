import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useBehaviors } from './useBehaviors'
import { listBehaviors, saveBehaviors, compileBehavior } from '../services/behavior'
import type { Behavior } from '../services/behavior'

vi.mock('../services/behavior', () => ({
  listBehaviors: vi.fn(),
  saveBehaviors: vi.fn(),
  compileBehavior: vi.fn(),
}))

const listMock = listBehaviors as unknown as ReturnType<typeof vi.fn>
const saveMock = saveBehaviors as unknown as ReturnType<typeof vi.fn>
const compileMock = compileBehavior as unknown as ReturnType<typeof vi.fn>

function kit(over: Partial<Behavior> = {}): Behavior {
  return {
    id: 'starter:kit',
    name: 'Starter Kit',
    trigger: { kind: 'player_joins_game' },
    conditions: [],
    actions: [{ kind: 'give_item', item: 'minecraft:diamond', count: 1 }],
    ...over,
  }
}

describe('useBehaviors', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    listMock.mockResolvedValue([])
    saveMock.mockResolvedValue(undefined)
    compileMock.mockResolvedValue({ ok: { script: 'x', warnings: [] } })
  })

  it('loads behaviors with loading then loaded state', async () => {
    listMock.mockResolvedValue([kit()])
    const { result } = renderHook(() => useBehaviors('proj-1'))

    expect(result.current.loading).toBe(true)
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.behaviors).toHaveLength(1)
    expect(result.current.dirty).toBe(false)
  })

  it('surfaces a load error honestly', async () => {
    listMock.mockRejectedValue('boom')
    const { result } = renderHook(() => useBehaviors('proj-1'))

    await waitFor(() => expect(result.current.error).toBe('boom'))
    expect(result.current.loading).toBe(false)
  })

  it('marks the list dirty only when it diverges from saved', async () => {
    listMock.mockResolvedValue([kit()])
    const { result } = renderHook(() => useBehaviors('proj-1'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    // Same content, new array — not dirty.
    act(() => result.current.setBehaviors([kit()]))
    expect(result.current.dirty).toBe(false)

    // Real edit — dirty.
    act(() => result.current.setBehaviors([kit({ name: 'Edited' })]))
    expect(result.current.dirty).toBe(true)
  })

  it('save reports ok and clears dirty', async () => {
    listMock.mockResolvedValue([kit()])
    const { result } = renderHook(() => useBehaviors('proj-1'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    act(() => result.current.setBehaviors([kit({ name: 'Edited' })]))
    expect(result.current.dirty).toBe(true)

    let res: { ok: boolean; error: string | null } | null = null
    await act(async () => {
      res = await result.current.save()
    })
    expect(res).toEqual({ ok: true, error: null })
    expect(result.current.dirty).toBe(false)
    expect(saveMock).toHaveBeenCalledWith('proj-1', [kit({ name: 'Edited' })])
  })

  it('save reports failure without clearing dirty', async () => {
    listMock.mockResolvedValue([kit()])
    saveMock.mockRejectedValue('disk full')
    const { result } = renderHook(() => useBehaviors('proj-1'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    act(() => result.current.setBehaviors([kit({ name: 'Edited' })]))
    let res: { ok: boolean; error: string | null } | null = null
    await act(async () => {
      res = await result.current.save()
    })
    expect(res).toEqual({ ok: false, error: 'disk full' })
    expect(result.current.dirty).toBe(true)
  })
})
