// Workspace status bar: WebSocket server state on the left, live Test /
// Deploy Companion feedback on the right. System state lives here so the
// toolbar and banners don't have to grow to carry it.
import { useEffect, useState } from 'react'
import type { ConnectionStateView } from '../../services/connection-status'
import { getEngineStats, subscribeEngineStats } from '../../services/engine-render'
import { getBakedTextureKeys } from '../../services/texture-loader'
import { PowerIcon, RefreshIcon } from '../ui/icons'

interface WorkspaceStatusBarProps {
  connection: ConnectionStateView
  onRestartWebSocket: () => void
  onRestartInstance: () => void
  isRestarting: boolean
  isTesting: boolean
  testProgress: string
  testError: string
  deployCompanionMessage: string
}

const DEPLOY_GLYPHS = /^[\u2713\u2714\u2717\u2718]\s*/

export function WorkspaceStatusBar({
  connection,
  onRestartWebSocket,
  onRestartInstance,
  isRestarting,
  isTesting,
  testProgress,
  testError,
  deployCompanionMessage,
}: WorkspaceStatusBarProps) {
  const [engineStats, setEngineStats] = useState(() => getEngineStats())
  useEffect(() => subscribeEngineStats(() => setEngineStats(getEngineStats())), [])
  const deployOk = /^[\u2713\u2714]/.test(deployCompanionMessage)
  const deployErr = /^[\u2717\u2718]/.test(deployCompanionMessage)
  const deployClass = deployOk ? 'ok' : deployErr ? 'error' : 'info'
  const deployText = deployCompanionMessage.replace(DEPLOY_GLYPHS, '')
  const errorFirstLine = testError.split('\n')[0]

  const bakedCount = getBakedTextureKeys().length
  const engineLabel = engineStats.connected
    ? `Engine \u2713 ${engineStats.sent} sent / ${engineStats.rendered} done (${engineStats.queue} queued, ${bakedCount} baked)`
    : engineStats.rendered > 0
      ? `Engine cached (${engineStats.rendered}${bakedCount > 0 ? `, ${bakedCount} baked` : ''})`
      : `Engine idle (${bakedCount} baked)`

  return (
    <footer className="workspace-statusbar">
      <div className="workspace-statusbar-group">
        <span
          className={`ws-status ${connection.className}`}
          title={connection.detail}
        >
          <span className={`status-dot ${connection.dotClass}`} />
          <span>{connection.label}</span>
        </span>
        <button
          className="ws-action-btn"
          onClick={onRestartInstance}
          disabled={isTesting || isRestarting}
          title="Restart game instance (stop the game, then relaunch — re-deploys the companion)"
          aria-label="Restart game instance"
        >
          <PowerIcon size={12} />
        </button>
        <button
          className="ws-action-btn"
          onClick={onRestartWebSocket}
          title="Restart WebSocket server"
          aria-label="Restart WebSocket server"
        >
          <RefreshIcon size={12} />
        </button>
        <span
          className={`ws-status ${engineStats.connected ? 'connected' : 'disconnected'}`}
          title="Companion engine icon rendering (RENDER_ITEMS_REQUEST/RESULT)"
        >
          <span className={`status-dot ${engineStats.connected ? 'running' : 'stopped'}`} />
          <span>{engineLabel}</span>
        </span>
      </div>
      <div className="workspace-statusbar-group workspace-statusbar-right">
        {isRestarting && !isTesting && (
          <span className="statusbar-message info" role="status">
            <span className="statusbar-spinner" aria-hidden="true" />
            Restarting... {testProgress}
          </span>
        )}
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
