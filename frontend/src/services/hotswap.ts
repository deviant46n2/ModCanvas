// Hotswap reload orchestration (P2-HOTSWAP): after a save, the app pins the
// game log position, broadcasts the reload to the companion, then verifies
// the reload's own evidence line(s) landed AFTER the pin. A reload without
// evidence is reported FAIL — never claimed. The companion sends the
// command; the app owns the truth (its own process's log is not readable
// client-side).
//
// Evidence shapes are PER-TYPE (s44): quests = one line ("Loading quests
// from"); kubejs = TWO lines ("KubeJS server scripts in" + "Server resource
// reload complete!") because the reload is a two-command sequence. The kind
// string is passed through to the Rust matcher unchanged.

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

/** The Rust-side evidence matcher name (hotswap.rs ReloadKind). */
export type ReloadKind = 'quests' | 'kubejs'

export function pinReloadLog(projectId: string): Promise<number> {
  return invoke<number>('pin_reload_log', { projectId })
}

export function verifyReloadLog(projectId: string, offset: number, kind: ReloadKind): Promise<ReloadEvidence> {
  return invoke<ReloadEvidence>('verify_reload_log', { projectId, offset, kind })
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** Generic reload orchestration: pin BEFORE the broadcast, then verify the
 *  kind's evidence landed AFTER the pin (a world-load line would false-pass
 *  an unpinned read). `tries` polls of `pollMs` after the send. */
async function reloadInGame(
  projectId: string,
  reloadEvent: string,
  kind: ReloadKind,
  opts?: { pollMs?: number; tries?: number },
): Promise<ReloadOutcome> {
  const pollMs = opts?.pollMs ?? 1000
  const tries = opts?.tries ?? 6

  const offset = await pinReloadLog(projectId)
  const event = formatSyncEvent(reloadEvent, 'WORKBENCH', {})
  const delivered = await wsIpcSendEvent(event.event, undefined, { ...event })

  // Zero companion peers received it: no game attached (or a stale companion
  // that predates routing). Honest skip, not a claim.
  if (delivered === 0) return { status: 'no-companion' }

  for (let i = 0; i < tries; i++) {
    await sleep(pollMs)
    const r = await verifyReloadLog(projectId, offset, kind)
    if (r.rotated) return { status: 'rotated' }
    if (r.passed) return { status: 'passed', evidence: r.evidence ?? undefined }
  }
  return { status: 'failed' }
}

/** Broadcast a quest reload and verify FTB's evidence line landed. */
export async function reloadQuestsInGame(
  projectId: string,
  opts?: { pollMs?: number; tries?: number },
): Promise<ReloadOutcome> {
  return reloadInGame(projectId, 'RELOAD_QUESTS', 'quests', opts)
}

/** Broadcast the KubeJS script reload + datapack apply, and verify BOTH
 *  evidence lines landed (the two-command sequence, s44). */
export async function reloadKubeJSInGame(
  projectId: string,
  opts?: { pollMs?: number; tries?: number },
): Promise<ReloadOutcome> {
  return reloadInGame(projectId, 'RELOAD_KUBEJS_SCRIPTS', 'kubejs', opts)
}
