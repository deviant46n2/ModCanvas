// Transitive-dependency list in the wizard's step 4: after the curated mods
// install, a compat check surfaces the libraries they dragged in (e.g. FTB
// Library, Rhino, Architectury) — each one-click installable here. Extracted
// from CuratedModsStep (the 300-line rule).

import type { CompatibilityInstall } from '../../services/types'

interface CuratedDepsListProps {
  deps: CompatibilityInstall[]
  installingDeps: Set<string>
  onInstall: (dep: CompatibilityInstall) => void
}

export function CuratedDepsList({ deps, installingDeps, onInstall }: CuratedDepsListProps) {
  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 6 }}>
        Some mods need a library to work — install them too:
      </div>
      {deps.map((dep) => (
        <div key={dep.mod_id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 10px', marginBottom: 4 }}>
          <span style={{ flex: 1 }}>{dep.name}</span>
          <button
            className="btn-primary btn-sm"
            onClick={() => onInstall(dep)}
            disabled={installingDeps.has(dep.mod_id)}
          >
            {installingDeps.has(dep.mod_id) ? 'Installing…' : 'Install'}
          </button>
        </div>
      ))}
    </div>
  )
}
