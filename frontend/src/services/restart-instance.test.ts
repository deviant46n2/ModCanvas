import { describe, it, expect, vi, afterEach } from 'vitest'
import { waitForInstanceExit } from './restart-instance'

describe('waitForInstanceExit', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('resolves once the check reports the instance is gone', async () => {
    vi.useFakeTimers()
    const check = vi
      .fn<() => Promise<boolean>>()
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false)

    const p = waitForInstanceExit(check, 10_000, 1000)
    // Two polls report "still running", the third reports "stopped".
    await vi.advanceTimersByTimeAsync(2500)
    await expect(p).resolves.toBeUndefined()
    expect(check).toHaveBeenCalledTimes(3)
  })

  it('rejects with a clear error when the game never exits before the timeout', async () => {
    vi.useFakeTimers()
    const check = vi.fn<() => Promise<boolean>>().mockResolvedValue(true)

    const p = waitForInstanceExit(check, 3000, 1000)
    // Attach the assertion before advancing so the rejection is handled the
    // moment it fires (no unhandled-rejection window).
    const assertion = expect(p).rejects.toThrow(/Timed out after 3s/)
    await vi.advanceTimersByTimeAsync(4000)
    await assertion
  })

  it('resolves immediately when the instance is already stopped', async () => {
    const check = vi.fn<() => Promise<boolean>>().mockResolvedValue(false)
    await expect(waitForInstanceExit(check, 5000, 1000)).resolves.toBeUndefined()
    expect(check).toHaveBeenCalledTimes(1)
  })
})
