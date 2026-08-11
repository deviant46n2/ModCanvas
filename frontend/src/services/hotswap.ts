// Hotswap reload orchestration (P2-HOTSWAP): after a save, the app pins the
// game log position, broadcasts the reload to the companion, then verifies
// FTB's own evidence line landed AFTER the pin. A reload without evidence is
// reported FAIL — never claimed. The companion sends the command; the app
// owns the truth (its own process's log is not readable client-side).

import { invoke } from '@tauri-apps/api/core'
import { wsIpcSendEvent } from './ipc'
import { formatSyncEvent } from '../core/sync/loop-guard'

export interface ReloadEvidence {
  passed: boolean
  evidence: string | null
  rotated: boolean
}

export type ReloadOutcome =
  | { status: 'passed'; evidence?: string }
  | { status: 'failed' }
  | { status: 'rotated' }
  | { status: 'no-companion' }

export function pinReloadLog(projectId: string): Promise<number> {
  return invoke<number>('pin_reload_log', { projectId })
}

export function verifyReloadLog(projectId: string, offset: number): Promise<ReloadEvidence> {
  return invoke<ReloadEvidence>('verify_reload_log', { projectId, offset })
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** Broadcast a quest reload and verify it landed. The pin happens BEFORE the
 *  broadcast — the evidence line must be newer than the pin, or a world-load
 *  line would false-pass. `tries` polls of `pollMs` after the send. */
export async function reloadQuestsInGame(
  projectId: string,
  opts?: { pollMs?: number; tries?: number },
): Promise<ReloadOutcome> {
  const pollMs = opts?.pollMs ?? 1000
  const tries = opts?.tries ?? 6

  const offset = await pinReloadLog(projectId)
  const event = formatSyncEvent('RELOAD_QUESTS', 'WORKBENCH', {})
  const delivered = await wsIpcSendEvent(event.event, undefined, { ...event })

  // Zero companion peers received it: no game attached (or a stale companion
  // that predates routing). Honest skip, not a claim.
  if (delivered === 0) return { status: 'no-companion' }

  for (let i = 0; i < tries; i++) {
    await sleep(pollMs)
    const r = await verifyReloadLog(projectId, offset)
    if (r.rotated) return { status: 'rotated' }
    if (r.passed) return { status: 'passed', evidence: r.evidence ?? undefined }
  }
  return { status: 'failed' }
}
