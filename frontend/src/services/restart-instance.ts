// Instance restart orchestration primitives.
//
// Pure-ish and unit-testable: the poll loop takes an injected `check` so
// tests can drive it with a fake function instead of a live Tauri invoke.
import { invoke } from '@tauri-apps/api/core'

interface PrismInstance {
  id: string
  name: string
  mc_version: string
  loader: string
  game_dir: string
  status: string
}

/** True when an instance launched from ModCanvas is currently running. */
export async function isInstanceRunning(gameDir: string): Promise<boolean> {
  const insts = await invoke<PrismInstance[]>('list_mc_instances')
  return insts.some((i) => i.game_dir === gameDir && i.status === 'Running')
}

/**
 * Poll `check` every `pollMs` until it returns false or `timeoutMs` elapses.
 * Resolves when the instance has exited; rejects on timeout so the caller
 * can surface a real error instead of hanging on a dead companion.
 */
export async function waitForInstanceExit(
  check: () => Promise<boolean>,
  timeoutMs: number,
  pollMs = 1000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (!(await check())) return
    await new Promise((r) => setTimeout(r, pollMs))
  }
  throw new Error(
    `Timed out after ${Math.round(timeoutMs / 1000)}s waiting for the game to exit. ` +
      'Close it manually, then relaunch.',
  )
}
