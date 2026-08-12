import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useFirstBootRouting } from './useFirstBootRouting'

vi.mock('../services/settings', () => ({
  getAppSetting: vi.fn(),
  setAppSetting: vi.fn(),
  FIRST_BOOT_KEY: 'first_boot_seen',
  BEGINNER_MODE_KEY: 'beginner_mode',
}))

import { getAppSetting, setAppSetting } from '../services/settings'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useFirstBootRouting', () => {
  it('opens the wizard exactly once for a fresh install (loaded, empty, unseen)', async () => {
    vi.mocked(getAppSetting).mockResolvedValue(null)
    const onOpen = vi.fn()
    const { result } = renderHook(() => useFirstBootRouting(true, 0, onOpen))

    await act(async () => {})
    expect(onOpen).toHaveBeenCalledTimes(1)
    expect(setAppSetting).toHaveBeenCalledWith('first_boot_seen', '1')

    // Re-render with the same args — the ref guard keeps it one-shot.
    act(() => result.current)
    expect(onOpen).toHaveBeenCalledTimes(1)
  })

  it('does not open the wizard when the intro was already seen', async () => {
    vi.mocked(getAppSetting).mockResolvedValue('1')
    const onOpen = vi.fn()
    renderHook(() => useFirstBootRouting(true, 0, onOpen))

    await act(async () => {})
    expect(onOpen).not.toHaveBeenCalled()
    expect(setAppSetting).not.toHaveBeenCalled()
  })

  it('does not open the wizard for a returning user with projects', async () => {
    const onOpen = vi.fn()
    renderHook(() => useFirstBootRouting(true, 3, onOpen))

    await act(async () => {})
    expect(onOpen).not.toHaveBeenCalled()
  })

  it('does nothing before the project list has loaded successfully', async () => {
    vi.mocked(getAppSetting).mockResolvedValue(null)
    const onOpen = vi.fn()
    const { rerender } = renderHook(
      ({ loaded, count }) => useFirstBootRouting(loaded, count, onOpen),
      { initialProps: { loaded: false, count: 0 } },
    )

    await act(async () => {})
    expect(onOpen).not.toHaveBeenCalled()

    // Load completes, list is genuinely empty → now it fires.
    rerender({ loaded: true, count: 0 })
    await act(async () => {})
    expect(onOpen).toHaveBeenCalledTimes(1)
  })

  it('does not open the wizard on a failed load (loaded stays false)', async () => {
    const onOpen = vi.fn()
    renderHook(() => useFirstBootRouting(false, 0, onOpen))

    await act(async () => {})
    expect(onOpen).not.toHaveBeenCalled()
  })
})
