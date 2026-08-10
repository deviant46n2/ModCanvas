// App settings. Today that means exactly one thing: the CurseForge API key,
// required for CurseForge-only mods (e.g. FTB Quests) and CurseForge search
// and imports. Modrinth — the default for everything else — works keyless,
// which is why the wizard's curated list is Modrinth-first.

import { useEffect, useState } from 'react'
import { getCurseforgeApiKey, setCurseforgeApiKey } from '../../services/project'

interface SettingsModalProps {
  show: boolean
  onClose: () => void
}

export function SettingsModal({ show, onClose }: SettingsModalProps) {
  const [key, setKey] = useState('')
  const [hasKey, setHasKey] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    if (!show) return
    setMessage(null)
    setKey('')
    getCurseforgeApiKey()
      .then((k) => setHasKey(k !== null && k.length > 0))
      .catch(() => setHasKey(false))
  }, [show])

  if (!show) return null

  async function handleSave() {
    if (!key.trim()) return
    setSaving(true)
    setMessage(null)
    try {
      await setCurseforgeApiKey(key.trim())
      setHasKey(true)
      setKey('')
      setMessage('Saved. CurseForge-only mods (FTB Quests) and CurseForge search are now unlocked.')
    } catch (e: any) {
      setMessage(typeof e === 'string' ? e : e?.message || String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ width: 460, maxWidth: '90vw' }} onClick={(e) => e.stopPropagation()}>
        <h2>Settings</h2>
        <div className="form-group">
          <label>CurseForge API key</label>
          <input
            type="password"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder={hasKey ? 'A key is saved — paste a new one to replace it' : 'Paste your key'}
            aria-label="CurseForge API key"
          />
        </div>
        <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginBottom: 10 }}>
          Only CurseForge needs a key — Modrinth works without one. FTB Quests
          is CurseForge-only, so the wizard's core picks need it. Get a free
          key at <strong>console.curseforge.com</strong> → API Keys.
        </div>
        {message && <div style={{ fontSize: 13, marginBottom: 8 }}>{message}</div>}
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>Close</button>
          <button className="btn-primary" onClick={handleSave} disabled={saving || !key.trim()}>
            {saving ? 'Saving…' : 'Save key'}
          </button>
        </div>
      </div>
    </div>
  )
}
