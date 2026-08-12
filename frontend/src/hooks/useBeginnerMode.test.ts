import { describe, expect, it, vi, beforeEach } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { useBeginnerMode } from './useBeginnerMode'
import { getAppSetting, setAppSetting } from '../services/settings'

vi.mock('../services/settings', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/settings')>()
  return {
    ...actual,
    getAppSetting: vi.fn(),
    setAppSetting: vi.fn(),
  }
})

const mockGet = vi.mocked(getAppSetting)
const mockSet = vi.mocked(setAppSetting)

describe('useBeginnerMode', () => {
  beforeEach(() => {
    mockGet.mockReset()
    mockSet.mockReset()
  })

  it('reads the persisted flag on mount (null until resolved)', async () => {
    let resolveGet!: (v: string | null) => void
    mockGet.mockReturnValue(new Promise((res) => { resolveGet = res }))
    const { result } = renderHook(() => useBeginnerMode())
    expect(result.current.beginnerMode).toBeNull()
    await act(async () => { resolveGet('1') })
    await waitFor(() => expect(result.current.beginnerMode).toBe(true))
  })

  it('defaults to full IDE when the setting is unset or unreadable', async () => {
    mockGet.mockResolvedValue(null)
    const { result } = renderHook(() => useBeginnerMode())
    await waitFor(() => expect(result.current.beginnerMode).toBe(false))

    mockGet.mockRejectedValue(new Error('db error'))
    const { result: r2 } = renderHook(() => useBeginnerMode())
    await waitFor(() => expect(r2.current.beginnerMode).toBe(false))
  })

  it('persists the toggle through set_app_setting', async () => {
    mockGet.mockResolvedValue(null)
    mockSet.mockResolvedValue(undefined)
    const { result } = renderHook(() => useBeginnerMode())
    await waitFor(() => expect(result.current.beginnerMode).toBe(false))

    await act(async () => { result.current.setBeginnerMode(true) })
    expect(mockSet).toHaveBeenCalledWith('beginner_mode', '1')
    expect(result.current.beginnerMode).toBe(true)

    await act(async () => { result.current.setBeginnerMode(false) })
    expect(mockSet).toHaveBeenLastCalledWith('beginner_mode', '0')
    expect(result.current.beginnerMode).toBe(false)
  })

  it('reverts the optimistic set when persistence fails (honest state)', async () => {
    mockGet.mockResolvedValue(null)
    // Deferred rejection: the optimistic set must be observable BEFORE the
    // revert lands — that is the honest-state contract being tested.
    let rejectSet!: (e: Error) => void
    mockSet.mockReturnValue(new Promise((_res, rej) => { rejectSet = rej }))
    const { result } = renderHook(() => useBeginnerMode())
    await waitFor(() => expect(result.current.beginnerMode).toBe(false))

    await act(async () => { result.current.setBeginnerMode(true) })
    expect(result.current.beginnerMode).toBe(true) // optimistic, not yet reverted
    await act(async () => { rejectSet(new Error('disk full')) })
    await waitFor(() => expect(result.current.beginnerMode).toBe(false)) // reverted
  })
})
