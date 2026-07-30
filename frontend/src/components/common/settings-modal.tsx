interface SettingsModalProps {
  show: boolean
  onClose: () => void
  curseforgeApiKey: string
  onApiKeyChange: (key: string) => void
  settingsSaving: boolean
  settingsMessage: string
  onSave: () => Promise<void>
}

export function SettingsModal({
  show,
  onClose,
  curseforgeApiKey,
  onApiKeyChange,
  settingsSaving,
  settingsMessage,
  onSave,
}: SettingsModalProps) {
  if (!show) return null
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Settings</h2>
        <p style={{ marginBottom: '16px', color: 'var(--color-text-secondary)' }}>
          Configure API keys and application settings.
        </p>

        <div style={{ marginTop: '16px' }}>
          <h3 style={{ marginBottom: '12px', fontSize: '14px' }}>CurseForge API</h3>
          <p style={{ fontSize: '13px', color: 'var(--color-text-tertiary)', marginBottom: '12px' }}>
            A CurseForge API key enables resolving mods that are only available on CurseForge.
            Get your key at <a href="https://console.curseforge.com/#/api-keys" target="_blank" rel="noopener noreferrer">console.curseforge.com</a>
          </p>
          <div className="form-group">
            <label>API Key</label>
            <input
              type="password"
              className="config-input"
              value={curseforgeApiKey}
              onChange={(e) => onApiKeyChange(e.target.value)}
              placeholder="Enter your CurseForge API key"
            />
          </div>
          {settingsMessage && (
            <div style={{ marginTop: '8px', fontSize: '13px', color: settingsMessage.startsWith('Error') ? 'var(--color-error)' : 'var(--color-success)' }}>
              {settingsMessage}
            </div>
          )}
        </div>

        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={onSave} disabled={settingsSaving}>
            {settingsSaving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </div>
    </div>
  )
}
