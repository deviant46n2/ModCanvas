import { describe, it, expect } from 'vitest'
import { deriveConnectionState, connectionStateView } from './connection-status'
import type { ConnectionSignals } from './connection-status'

const base: ConnectionSignals = {
  serverUp: true,
  companionConnected: false,
  deployed: true,
  stale: false,
  instanceRunning: false,
}

describe('deriveConnectionState', () => {
  it('connected wins over everything', () => {
    expect(deriveConnectionState({ ...base, companionConnected: true, serverUp: false })).toBe('connected')
    expect(deriveConnectionState({ ...base, companionConnected: true, deployed: false })).toBe('connected')
  })

  it('bridge-offline when the app socket cannot reach the server', () => {
    expect(deriveConnectionState({ ...base, serverUp: false })).toBe('bridge-offline')
  })

  it('not-deployed beats instance-running and offline', () => {
    expect(deriveConnectionState({ ...base, deployed: false, instanceRunning: true })).toBe('not-deployed')
    expect(deriveConnectionState({ ...base, deployed: false })).toBe('not-deployed')
  })

  it('running-no-companion only when WE launched a live instance', () => {
    expect(deriveConnectionState({ ...base, instanceRunning: true })).toBe('running-no-companion')
  })

  it('plain offline otherwise', () => {
    expect(deriveConnectionState(base)).toBe('offline')
  })
})

describe('connectionStateView', () => {
  it('labels each state with the manual to reach green', () => {
    expect(connectionStateView(base).label).toBe('Instance Offline')
    expect(connectionStateView(base).detail).toContain('Launch the instance here')

    expect(connectionStateView({ ...base, serverUp: false }).label).toBe('Bridge offline')
    expect(connectionStateView({ ...base, serverUp: false }).detail).toContain('restart')

    expect(connectionStateView({ ...base, deployed: false }).label).toBe('Companion not deployed')
    expect(connectionStateView({ ...base, deployed: false }).detail).toContain('Deploy Companion')

    expect(connectionStateView({ ...base, instanceRunning: true }).label).toBe('Instance running, companion missing')
    expect(connectionStateView({ ...base, instanceRunning: true }).className).toBe('attention')

    expect(connectionStateView({ ...base, companionConnected: true }).label).toBe('Instance Connected')
    expect(connectionStateView({ ...base, companionConnected: true }).className).toBe('connected')
  })

  it('surfaces the stale jar note in diagnostic states', () => {
    const stale = { ...base, stale: true }
    expect(connectionStateView(stale).detail).toContain('old build')
    expect(connectionStateView({ ...stale, instanceRunning: true }).detail).toContain('old build')
    // Connected never mentions staleness.
    expect(connectionStateView({ ...stale, companionConnected: true }).detail).not.toContain('old build')
  })
})
