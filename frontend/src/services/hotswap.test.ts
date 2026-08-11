import { it, expect, vi, beforeEach } from 'vitest'
import { reloadQuestsInGame } from './hotswap'
import * as ipc from './ipc'

// The orchestration is the honesty gate of P2-HOTSWAP: pin BEFORE broadcast,
// evidence line must land AFTER the pin, and a reload is never claimed
// without it. These tests lock the four outcomes against mocked I/O.

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }))
vi.mock('./ipc', () => ({ wsIpcSendEvent: vi.fn() }))

import { invoke } from '@tauri-apps/api/core'

const invokeMock = invoke as unknown as ReturnType<typeof vi.fn>
const sendMock = ipc.wsIpcSendEvent as unknown as ReturnType<typeof vi.fn>

const EVIDENCE_LINE = '[11Aug2026 12:14:44.590] [Server thread/INFO] [FTB Quests/]: Loading quests from /config/ftbquests/quests'

beforeEach(() => {
  vi.clearAllMocks()
})

it('pins the log BEFORE broadcasting — the evidence must land after the pin', async () => {
  const calls: string[] = []
  invokeMock.mockImplementation((cmd: string) => {
    calls.push(cmd)
    if (cmd === 'pin_reload_log') return Promise.resolve(100)
    if (cmd === 'verify_reload_log') return Promise.resolve({ passed: true, evidence: EVIDENCE_LINE, rotated: false })
    return Promise.resolve(undefined)
  })
  sendMock.mockResolvedValue(1)

  const outcome = await reloadQuestsInGame('proj-1', { pollMs: 5, tries: 2 })

  expect(outcome.status).toBe('passed')
  expect(calls[0]).toBe('pin_reload_log')
  expect(sendMock).toHaveBeenCalledTimes(1)
  expect(sendMock.mock.calls[0][0]).toBe('RELOAD_QUESTS')
  // Verify reads from the pinned offset — never a whole-log read.
  expect(invokeMock).toHaveBeenCalledWith('verify_reload_log', { projectId: 'proj-1', offset: 100 })
})

it('reports FAIL when no evidence lands in the poll window', async () => {
  invokeMock.mockImplementation((cmd: string) => {
    if (cmd === 'pin_reload_log') return Promise.resolve(100)
    if (cmd === 'verify_reload_log') return Promise.resolve({ passed: false, evidence: null, rotated: false })
    return Promise.resolve(undefined)
  })
  sendMock.mockResolvedValue(1)

  const outcome = await reloadQuestsInGame('proj-1', { pollMs: 5, tries: 3 })
  expect(outcome.status).toBe('failed')
  expect(invokeMock).toHaveBeenCalledTimes(4) // 1 pin + 3 verifies
})

it('reports rotated immediately — inconclusive is never claimed', async () => {
  invokeMock.mockImplementation((cmd: string) => {
    if (cmd === 'pin_reload_log') return Promise.resolve(100)
    if (cmd === 'verify_reload_log') return Promise.resolve({ passed: false, evidence: null, rotated: true })
    return Promise.resolve(undefined)
  })
  sendMock.mockResolvedValue(1)

  const outcome = await reloadQuestsInGame('proj-1', { pollMs: 5, tries: 5 })
  expect(outcome.status).toBe('rotated')
  expect(invokeMock).toHaveBeenCalledTimes(2) // pin + 1 verify, no further polls
})

it('reports no-companion and skips verification when zero peers received the broadcast', async () => {
  invokeMock.mockImplementation((cmd: string) => {
    if (cmd === 'pin_reload_log') return Promise.resolve(100)
    return Promise.resolve(undefined)
  })
  sendMock.mockResolvedValue(0)

  const outcome = await reloadQuestsInGame('proj-1', { pollMs: 5, tries: 3 })
  expect(outcome.status).toBe('no-companion')
  expect(invokeMock).toHaveBeenCalledTimes(1) // pin only — no verify without a send
})
