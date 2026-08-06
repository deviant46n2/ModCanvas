// Connection pill state derivation — pure and unit-testable.
//
// The pill shows only states the app can actually determine, and every
// non-green state carries the action to reach green. Signals:
// - serverUp: the app's own socket reached the WS hub.
// - companionConnected: a companion peer is attached to the hub.
// - deployed: the companion jar exists in the instance's mods folder.
// - stale: a newer companion build exists in the repo than the deployed jar.
// - instanceRunning: an instance launched from ModCanvas has a live game
//   child. External launches are deliberately NOT tracked — we only claim
//   what we own ("no instance launched from ModCanvas"), never "no instance
//   running".
export type ConnectionState =
  | 'connected'
  | 'bridge-offline'
  | 'not-deployed'
  | 'running-no-companion'
  | 'offline'

export interface ConnectionSignals {
  serverUp: boolean
  companionConnected: boolean
  deployed: boolean
  stale: boolean
  instanceRunning: boolean
}

export interface ConnectionStateView {
  state: ConnectionState
  label: string
  detail: string
  className: 'connected' | 'disconnected' | 'attention'
  dotClass: 'running' | 'stopped' | 'attention'
}

export function deriveConnectionState(s: ConnectionSignals): ConnectionState {
  if (s.companionConnected) return 'connected'
  if (!s.serverUp) return 'bridge-offline'
  if (!s.deployed) return 'not-deployed'
  if (s.instanceRunning) return 'running-no-companion'
  return 'offline'
}

const STALE_NOTE =
  ' The deployed companion is an old build — rebuild it and redeploy.'

export function connectionStateView(s: ConnectionSignals): ConnectionStateView {
  const state = deriveConnectionState(s)
  switch (state) {
    case 'connected':
      return {
        state,
        label: 'Instance Connected',
        detail: 'The companion mod is connected to the bridge.',
        className: 'connected',
        dotClass: 'running',
      }
    case 'bridge-offline':
      return {
        state,
        label: 'Bridge offline',
        detail:
          'The WebSocket bridge is unavailable. Press the restart button to bring it back up.',
        className: 'disconnected',
        dotClass: 'stopped',
      }
    case 'not-deployed':
      return {
        state,
        label: 'Companion not deployed',
        detail:
          'The companion mod is not in the instance. Press Deploy Companion, then launch the instance from ModCanvas.',
        className: 'disconnected',
        dotClass: 'stopped',
      }
    case 'running-no-companion':
      return {
        state,
        label: 'Instance running, companion missing',
        detail:
          'The instance is up but the companion never connected. Check the game log for a mod load error.' +
          (s.stale ? STALE_NOTE : ''),
        className: 'attention',
        dotClass: 'attention',
      }
    case 'offline':
      return {
        state,
        label: 'Instance Offline',
        detail:
          'No instance launched from ModCanvas. Launch the instance here to connect the companion.' +
          (s.stale ? STALE_NOTE : ''),
        className: 'disconnected',
        dotClass: 'stopped',
      }
  }
}
