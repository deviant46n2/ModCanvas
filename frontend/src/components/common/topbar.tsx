import type { WsConnectionStatus } from '../../services/api'

interface TopBarProps {
  projectName: string
  minecraftVersion: string
  modLoader: string
  packVersion: string
  wsStatus: WsConnectionStatus
  onRestartWebSocket: () => void
  deployCompanionMessage: string
  isTesting: boolean
  onSave: () => void
  onTest: () => void
  onDeployCompanion: () => void
  onExport: () => void
  onDelete: () => void
  packLoaded: boolean
  onLoadPack: () => void
  onClosePack: () => void
}

export function TopBar({
  projectName,
  minecraftVersion,
  modLoader,
  packVersion,
  wsStatus,
  onRestartWebSocket,
  deployCompanionMessage,
  isTesting,
  onSave,
  onTest,
  onDeployCompanion,
  onExport,
  onDelete,
  packLoaded,
  onLoadPack,
  onClosePack,
}: TopBarProps) {
  return (
    <div className="workspace-header">
      <h2>{projectName}</h2>
      <div className="workspace-meta">
        MC {minecraftVersion} &bull; {modLoader} &bull; v{packVersion}
      </div>
      <div className="workspace-status">
        <span
          className={`ws-status ${wsStatus.connected ? 'connected' : 'disconnected'}`}
          title={`WebSocket: ${wsStatus.connected ? 'Minecraft Connected' : 'Offline / Idle'} \u2022 Port: ${wsStatus.port} \u2022 Clients: ${wsStatus.client_count}`}
        >
          <span className={`status-dot ${wsStatus.connected ? 'running' : 'stopped'}`} />
          <span>{wsStatus.connected ? 'Minecraft Connected' : 'Offline / Idle'}</span>
        </span>
        <button
          className="ws-restart-btn"
          onClick={onRestartWebSocket}
          title="Restart WebSocket &amp; refresh status"
        >
          Restart Server
        </button>
      </div>
      <div className="instance-actions">
        {packLoaded ? (
          <button className="btn-danger" onClick={onClosePack}>
            Close Pack
          </button>
        ) : (
          <button className="btn-primary" onClick={onLoadPack}>
            Load Pack
          </button>
        )}
        <button className="btn-secondary" onClick={onSave}>Save</button>
        <button className="btn-success" onClick={onTest} disabled={isTesting}>
          {isTesting ? 'Testing...' : 'Test'}
        </button>
        <button className="btn-secondary" onClick={onDeployCompanion}>Deploy Companion</button>
        <button className="btn-secondary" onClick={onExport}>Export</button>
        <button className="btn-danger" onClick={onDelete}>
          Delete
        </button>
      </div>
      {deployCompanionMessage && (
        <div className="deploy-companion-message" style={{ marginTop: 8, fontSize: 13, color: deployCompanionMessage.startsWith('\u2717') ? '#e74c3c' : '#27ae60' }}>
          {deployCompanionMessage.replace(/^[\u2713\u2714\u2717\u2718]\s*/, '')}
        </div>
      )}
    </div>
  )
}
