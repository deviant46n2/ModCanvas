// One curated-mod row in the wizard's curated step (step 2). PRISM-LEAN
// (s54/s55): Modrinth picks install in-app with one click (keyless — the
// honest one-click); CurseForge picks (FTB Quests) are NOT rendered as rows
// (s55 — the dedicated Prism guide step owns them), so rows here always carry
// an install button or nothing. `blocked_reason` renders as a warning so a
// pick whose metadata couldn't be verified is never silently absent (s37).

import type { CuratedMod } from '../../services/types'

interface CuratedModRowProps {
  mod: CuratedMod
  /** One-click install handler (Modrinth picks only; undefined for CF picks). */
  onInstall?: (mod: CuratedMod) => Promise<void>
  installing: boolean
  installed: boolean
}

export function CuratedModRow({ mod, onInstall, installing, installed }: CuratedModRowProps) {
  const canInstall = !!onInstall && !installed
  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px',
        border: '1px solid var(--color-border-default)',
        borderRadius: 8, marginBottom: 6,
      }}
    >
      <div style={{ flex: 1 }}>
        <strong>{mod.name}</strong>
        <div style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>{mod.description}</div>
        {mod.blocked_reason && (
          <div style={{ fontSize: 12, color: 'var(--color-warning, #d97706)', marginTop: 4 }}>
            {mod.blocked_reason}
          </div>
        )}
      </div>
      {mod.page_url && (
        <a
          href={mod.page_url}
          target="_blank"
          rel="noreferrer"
          style={{ fontSize: 12, color: 'var(--color-accent)', whiteSpace: 'nowrap' }}
          onClick={(e) => e.stopPropagation()}
        >
          Project page
        </a>
      )}
      {onInstall && (
        <button
          className={installed || installing ? 'btn-primary btn-sm' : 'btn-secondary btn-sm'}
          onClick={() => canInstall && !installing && onInstall(mod)}
          disabled={installing || installed}
          aria-label={installed ? `${mod.name} installed` : installing ? `Installing ${mod.name}` : `Install ${mod.name}`}
        >
          {installed ? 'Installed ✓' : installing ? 'Installing…' : 'Install'}
        </button>
      )}
    </div>
  )
}
