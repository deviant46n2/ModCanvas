// Wizard step 4: curated mod picks (roadmap §9.3 step 4). The list comes
// backend-filtered to what the pack's loader/version actually supports; the
// user keeps the pre-ticked defaults or trims them. Installs run sequentially
// (each is a network download), then a compatibility check surfaces any
// transitive dependencies the curated mods dragged in, each one-click
// installable — the same payload the Mods tab's compat panel uses.

import { useCallback, useEffect, useState } from 'react'
import { installModFromSearch, checkCompatibility, listCuratedMods } from '../../services/mods'
import { setCurseforgeApiKey } from '../../services/project'
import type { CuratedMod, CompatibilityInstall } from '../../services/types'
import type { Project } from '../../services/types'
import { CuratedModRow, type ModStatus } from './CuratedModRow'
import { CuratedDepsList } from './CuratedDepsList'

interface CuratedModsStepProps {
  project: Project
  /** Re-run the load pipeline so the green check sees the new mods. */
  onRefresh: () => Promise<void>
  onContinue: () => void
}

export function CuratedModsStep({ project, onRefresh, onContinue }: CuratedModsStepProps) {
  const [mods, setMods] = useState<CuratedMod[] | null>(null)
  const [ticked, setTicked] = useState<Set<string>>(new Set())
  const [status, setStatus] = useState<Record<string, ModStatus>>({})
  const [failure, setFailure] = useState<Record<string, string>>({})
  const [deps, setDeps] = useState<CompatibilityInstall[] | null>(null)
  const [installingDeps, setInstallingDeps] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  // Re-fetch trigger for the list (e.g. after the user adds a CF API key).
  const [refreshKey, setRefreshKey] = useState(0)
  const [apiKey, setApiKey] = useState('')
  const [savingKey, setSavingKey] = useState(false)
  const [keySaved, setKeySaved] = useState(false)

  useEffect(() => {
    let alive = true
    listCuratedMods(project.id)
      .then((list) => {
        if (!alive) return
        setMods(list)
        setTicked(new Set(list.filter((m) => m.ticked && !m.blocked_reason).map((m) => m.slug)))
      })
      .catch((e) => {
        if (alive) setFailure({ _list: String(e) })
      })
    return () => {
      alive = false
    }
  }, [project.id, refreshKey])

  async function handleSaveKey() {
    if (!apiKey.trim()) return
    setSavingKey(true)
    try {
      await setCurseforgeApiKey(apiKey.trim())
      setKeySaved(true)
      setApiKey('')
    } catch (e: any) {
      setFailure({ _key: typeof e === 'string' ? e : e?.message || String(e) })
    } finally {
      setSavingKey(false)
    }
  }

  function handleRecheck() {
    setKeySaved(false)
    setFailure((f) => {
      const { _key, ...rest } = f
      return rest
    })
    setRefreshKey((k) => k + 1)
  }

  const toggle = useCallback((slug: string) => {
    setTicked((prev) => {
      const next = new Set(prev)
      if (next.has(slug)) next.delete(slug)
      else next.add(slug)
      return next
    })
  }, [])

  async function installOne(install: {
    source: 'modrinth' | 'curseforge'
    modId: string
    slug: string
    name: string
  }): Promise<{ ok: boolean; error?: string }> {
    try {
      await installModFromSearch({
        projectId: project.id,
        source: install.source,
        modId: install.modId,
        slug: install.slug,
        name: install.name,
        author: '',
        description: '',
        version: undefined,
        icon: null,
      })
      return { ok: true }
    } catch (e: any) {
      const msg = typeof e === 'string' ? e : e?.message || String(e)
      return { ok: false, error: msg }
    }
  }

  async function installSelected() {
    if (!mods || busy) return
    setBusy(true)
    setFailure({})
    const selected = mods.filter((m) => ticked.has(m.slug))
    // Sequential: each is a download + jar scan; parallel would hammer the
    // registry and the disk at once.
    for (const mod of selected) {
      setStatus((s) => ({ ...s, [mod.slug]: 'installing' }))
      const result = await installOne({
        source: mod.source,
        modId: mod.mod_id,
        slug: mod.slug,
        name: mod.name,
      })
      setStatus((s) => ({ ...s, [mod.slug]: result.ok ? 'installed' : 'failed' }))
      if (!result.ok) {
        setFailure((f) => ({ ...f, [mod.slug]: result.error ?? 'Install failed' }))
      }
    }
    // Transitive dependencies the curated mods dragged in.
    try {
      const result = await checkCompatibility(project.id)
      setDeps(result.issues.map((i) => i.install).filter((p): p is CompatibilityInstall => p !== null))
    } catch {
      setDeps([])
    }
    setBusy(false)
  }

  async function installDep(dep: CompatibilityInstall) {
    setInstallingDeps((prev) => new Set(prev).add(dep.mod_id))
    const result = await installOne({ source: dep.source, modId: dep.mod_id, slug: dep.slug, name: dep.name })
    setInstallingDeps((prev) => {
      const next = new Set(prev)
      next.delete(dep.mod_id)
      return next
    })
    if (result.ok) setDeps((prev) => (prev ? prev.filter((d) => d.mod_id !== dep.mod_id) : prev))
    else setFailure((f) => ({ ...f, [dep.mod_id]: result.error ?? 'Dependency install failed' }))
  }

  async function handleContinue() {
    if (done) return
    setDone(true)
    try {
      await onRefresh()
    } catch {
      /* a failed refresh degrades to a shorter green check, not a dead end */
    }
    onContinue()
  }

  async function retryMod(mod: CuratedMod) {
    setStatus((s) => ({ ...s, [mod.slug]: 'installing' }))
    const result = await installOne({ source: mod.source, modId: mod.mod_id, slug: mod.slug, name: mod.name })
    setStatus((s) => ({ ...s, [mod.slug]: result.ok ? 'installed' : 'failed' }))
    setFailure((f) => {
      if (result.ok) {
        const { [mod.slug]: _gone, ...rest } = f
        return rest
      }
      return { ...f, [mod.slug]: result.error ?? 'Install failed' }
    })
  }

  const installingAny = Object.values(status).some((s) => s === 'installing')
  const canContinue = deps !== null && deps.length === 0 && !busy
  const anyFailed = Object.keys(status).some((k) => status[k] === 'failed')

  const coreMods = mods?.filter((m) => m.core) ?? []
  const funMods = mods?.filter((m) => !m.core) ?? []

  return (
    <div>
      <div style={{ color: 'var(--color-text-secondary)', fontSize: 14, marginBottom: 10 }}>
        The first two are what ModCanvas itself works with — without them your
        quest book and recipes stay invisible in-game. The rest go great with
        any pack. Everything is optional and pre-filtered to your version and
        loader.
      </div>

      {mods?.some((m) => m.blocked_reason) && (
        <div className="launch-error" style={{ marginBottom: 10, padding: 10 }}>
          <div style={{ fontSize: 13, marginBottom: 6 }}>
            <strong>FTB Quests</strong> lives only on CurseForge, which needs a free API key
            — everything else in this list installs without one. Get a key at{' '}
            <strong>console.curseforge.com</strong>, paste it below, then re-check:
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="CurseForge API key"
              style={{ flex: 1, fontFamily: 'monospace' }}
              aria-label="CurseForge API key"
            />
            <button className="btn-secondary btn-sm" onClick={handleSaveKey} disabled={savingKey || !apiKey.trim()}>
              {savingKey ? 'Saving…' : 'Save key'}
            </button>
            {keySaved && (
              <button className="btn-primary btn-sm" onClick={handleRecheck}>Re-check</button>
            )}
          </div>
          {failure._key && <div style={{ fontSize: 12, color: 'var(--color-warning)', marginTop: 4 }}>{failure._key}</div>}
        </div>
      )}

      {failure._list && <div className="launch-error" style={{ marginBottom: 8 }}><pre className="copyable">{failure._list}</pre></div>}

      {mods === null && <div style={{ color: 'var(--color-text-tertiary)' }}>Loading suggestions…</div>}

      {coreMods.length > 0 && (
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-accent)', margin: '10px 0 6px' }}>
          Needed by ModCanvas
        </div>
      )}
      {coreMods.map((mod) => (
        <CuratedModRow
          key={mod.slug}
          mod={mod}
          ticked={ticked.has(mod.slug)}
          status={status[mod.slug] ?? 'pending'}
          failure={failure[mod.slug]}
          installingAny={installingAny}
          onToggle={toggle}
          onRetry={retryMod}
        />
      ))}

      {funMods.length > 0 && (
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-tertiary)', margin: '10px 0 6px' }}>
          Goes great with your pack
        </div>
      )}
      {funMods.map((mod) => (
        <CuratedModRow
          key={mod.slug}
          mod={mod}
          ticked={ticked.has(mod.slug)}
          status={status[mod.slug] ?? 'pending'}
          failure={failure[mod.slug]}
          installingAny={installingAny}
          onToggle={toggle}
          onRetry={retryMod}
        />
      ))}

      {deps !== null && deps.length > 0 && (
        <CuratedDepsList deps={deps} installingDeps={installingDeps} onInstall={installDep} />
      )}

      {anyFailed && (
        <div style={{ fontSize: 12, color: 'var(--color-warning)', marginTop: 4 }}>
          Install failed — see the error above and Retry. CurseForge issues usually mean
          your API key: check it in Settings (gear icon in the top bar).
        </div>
      )}

      <div className="modal-actions" style={{ marginTop: 16 }}>
        <button className="btn-secondary" onClick={onContinue} disabled={busy || done}>
          Skip
        </button>
        {deps === null ? (
          <button className="btn-primary" onClick={installSelected} disabled={busy || mods === null || ticked.size === 0}>
            {installingAny ? 'Installing…' : 'Install selected'}
          </button>
        ) : (
          <button className="btn-primary" onClick={handleContinue} disabled={!canContinue}>
            {canContinue ? 'Continue' : 'Waiting…'}
          </button>
        )}
      </div>
    </div>
  )
}
