// One curated-mod row in the wizard's step 4: name, description, and a project
// page link where the mod has one. PRISM-LEAN (s53): the row is display-only —
// installation happens in Prism's own downloader, so the checkbox/status/retry
// machinery is gone. The page link is the manual fallback for packs not tied
// to a Prism instance.

import type { CuratedMod } from '../../services/types'

interface CuratedModRowProps {
  mod: CuratedMod
}

export function CuratedModRow({ mod }: CuratedModRowProps) {
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
    </div>
  )
}
