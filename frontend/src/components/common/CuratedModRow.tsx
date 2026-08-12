// One curated-mod row in the wizard's step 4: checkbox, description, and the
// install state (installing / installed / failed-with-Retry). Blocked picks
// (e.g. CurseForge without an API key) render grayed with their reason.
// Extracted from CuratedModsStep (the 300-line rule).

import type { CuratedMod } from '../../services/types'

export type ModStatus = 'pending' | 'installing' | 'installed' | 'failed'

interface CuratedModRowProps {
  mod: CuratedMod
  ticked: boolean
  status: ModStatus
  failure: string | undefined
  installingAny: boolean
  onToggle: (slug: string) => void
  onRetry: (mod: CuratedMod) => void
}

export function CuratedModRow({
  mod,
  ticked,
  status,
  failure,
  installingAny,
  onToggle,
  onRetry,
}: CuratedModRowProps) {
  const blocked = mod.blocked_reason !== null
  const failed = status === 'failed'

  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px',
        border: blocked
          ? '1px dashed var(--color-border-default)'
          : ticked ? '1px solid var(--color-accent)' : '1px solid var(--color-border-default)',
        borderRadius: 8, marginBottom: 6,
        cursor: blocked ? 'not-allowed' : 'pointer',
        opacity: blocked ? 0.6 : 1,
      }}
      onClick={() => !blocked && onToggle(mod.slug)}
    >
      <input
        type="checkbox"
        checked={ticked}
        onChange={() => onToggle(mod.slug)}
        disabled={blocked}
        aria-label={`Install ${mod.name}`}
      />
      <div style={{ flex: 1 }}>
        <strong>{mod.name}</strong>
        <div style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>{mod.description}</div>
      </div>
      {blocked && <span style={{ fontSize: 12, color: 'var(--color-warning)' }}>{mod.blocked_reason}</span>}
      {!blocked && status === 'installing' && <span style={{ color: 'var(--color-text-tertiary)' }}>Installing…</span>}
      {!blocked && status === 'installed' && <span style={{ color: 'var(--color-success)' }}>Installed ✓</span>}
      {!blocked && failed && (
        <>
          <span style={{ color: 'var(--color-warning)', fontSize: 12, maxWidth: 200 }} title={failure}>
            {failure ?? 'Install failed'}
          </span>
          <button
            className="btn-secondary btn-sm"
            onClick={(e) => {
              e.stopPropagation()
              onRetry(mod)
            }}
            disabled={installingAny}
          >
            Retry
          </button>
        </>
      )}
    </div>
  )
}
