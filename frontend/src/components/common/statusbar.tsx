// Workspace status bar: WebSocket server state on the left, live Test /
// Deploy Companion feedback on the right. System state lives here so the
// toolbar and banners don't have to grow to carry it.
import type { WsConnectionStatus } from '../../services/api'
import { RefreshIcon } from '../ui/icons'

interface WorkspaceStatusBarProps {
  wsStatus: WsConnectionStatus
  onRestartWebSocket: () => void
  isTesting: boolean
  testProgress: string
  testError: string
  deployCompanionMessage: string
}

const DEPLOY_GLYPHS = /^[\u2713\u2714\u2717\u2718]\s*/

export function WorkspaceStatusBar({
  wsStatus,
  onRestartWebSocket,
  isTesting,
  testProgress,
  testError,
  deployCompanionMessage,
}: WorkspaceStatusBarProps) {
  const deployOk = /^[\u2713\u2714]/.test(deployCompanionMessage)
  const deployErr = /^[\u2717\u2718]/.test(deployCompanionMessage)
  const deployClass = deployOk ? 'ok' : deployErr ? 'error' : 'info'
  const deployText = deployCompanionMessage.replace(DEPLOY_GLYPHS, '')
  const errorFirstLine = testError.split('\n')[0]

  return (
    <footer className="workspace-statusbar">
      <div className="workspace-statusbar-group">
        <span
          className={`ws-status ${wsStatus.connected ? 'connected' : 'disconnected'}`}
          title={`WebSocket server \u2022 Port ${wsStatus.port} \u2022 ${wsStatus.client_count} client${wsStatus.client_count === 1 ? '' : 's'}`}
        >
          <span className={`status-dot ${wsStatus.connected ? 'running' : 'stopped'}`} />
          <span>{wsStatus.connected ? 'Minecraft Connected' : 'Offline / Idle'}</span>
        </span>
        <button
          className="ws-action-btn"
          onClick={onRestartWebSocket}
          title="Restart WebSocket server"
          aria-label="Restart WebSocket server"
        >
          <RefreshIcon size={12} />
        </button>
      </div>
      <div className="workspace-statusbar-group workspace-statusbar-right">
        {isTesting && (
          <span className="statusbar-message info" role="status">
            <span className="statusbar-spinner" aria-hidden="true" />
            Testing... {testProgress}
          </span>
        )}
        {!isTesting && testProgress && !testError && (
          <span className="statusbar-message ok" role="status">
            {testProgress}
          </span>
        )}
        {testError && (
          <>
            <span className="statusbar-message error statusbar-error-text" role="alert" title={testError}>
              Test failed: {errorFirstLine}
            </span>
            <button
              className="btn-copy"
              onClick={() => navigator.clipboard.writeText(testError)}
              aria-label="Copy error text"
            >
              Copy
            </button>
          </>
        )}
        {deployCompanionMessage && (
          <span className={`statusbar-message ${deployClass}`} role="status">
            {deployText}
          </span>
        )}
      </div>
    </footer>
  )
}
