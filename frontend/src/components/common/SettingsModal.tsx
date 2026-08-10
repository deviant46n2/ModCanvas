// App settings. Today that means exactly one thing: the CurseForge API key,
// required for CurseForge-only mods (e.g. FTB Quests) and CurseForge search
// and imports. Modrinth — the default for everything else — works keyless,
// which is why the wizard's curated list is Modrinth-first.
//
// Security contract (key_store.rs): the key lives in the OS keychain, never
// in the binary, never plaintext by default. When no system keychain daemon
// exists the app falls back to its database (mode 0600) and SAYS SO here.
// The renderer never receives the key value back over IPC.

import { useEffect, useState } from 'react'
import { getKeyStorage, setCurseforgeApiKey, clearCurseforgeApiKey } from '../../services/project'

interface SettingsModalProps {
  show: boolean
  onClose: () => void
}

function storeLabel(store: string): string | null {
  if (store === 'keychain') return 'Stored in your system keychain.'
  if (store === 'database') {
    return 'Stored in the app database (fallback — no system keychain detected). Still protected: the file is owner-only.'
  }
  return null
}

export function SettingsModal({ show, onClose }: SettingsModalProps) {
  const [key, setKey] = useState('')
  const [hasKey, setHasKey] = useState(false)
  const [store, setStore] = useState('none')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    if (!show) return
    setMessage(null)
    setKey('')
    getKeyStorage()
      .then((info) => {
        setHasKey(info.has_key)
        setStore(info.store)
      })
      .catch(() => {
        setHasKey(false)
        setStore('none')
      })
  }, [show])

  if (!show) return null

  async function handleSave() {
    if (!key.trim()) return
    setSaving(true)
    setMessage(null)
    try {
      const used = await setCurseforgeApiKey(key.trim())
      setHasKey(true)
      setStore(used)
      setKey('')
      setMessage(
        used === 'keychain'
          ? 'Saved to your system keychain. CurseForge features are unlocked.'
          : 'Saved (fallback storage — see note above). CurseForge features are unlocked.',
      )
    } catch (e: any) {
      setMessage(typeof e === 'string' ? e : e?.message || String(e))
    } finally {
      setSaving(false)
    }
  }

  async function handleClear() {
    setSaving(true)
    setMessage(null)
    try {
      await clearCurseforgeApiKey()
      setHasKey(false)
      setStore('none')
      setMessage('Key removed.')
    } catch (e: any) {
      setMessage(typeof e === 'string' ? e : e?.message || String(e))
    } finally {
      setSaving(false)
    }
  }

  const status = storeLabel(store)

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ width: 460, maxWidth: '90vw' }} onClick={(e) => e.stopPropagation()}>
        <h2>Settings</h2>
        {status && (
          <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginBottom: 10 }}>
            {status}
          </div>
        )}
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
          key at <strong>console.curseforge.com</strong> → API Keys. Your key
          stays on this machine, in your system keychain.
        </div>
        {message && <div style={{ fontSize: 13, marginBottom: 8 }}>{message}</div>}
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>Close</button>
          {hasKey && (
            <button className="btn-secondary" onClick={handleClear} disabled={saving}>
              Clear key
            </button>
          )}
          <button className="btn-primary" onClick={handleSave} disabled={saving || !key.trim()}>
            {saving ? 'Saving…' : 'Save key'}
          </button>
        </div>
      </div>
    </div>
  )
}
