import { useState } from 'react'
import { useLootTables } from '../../hooks/useLootTables'
import type { DiscoveredLootTable } from '../../services/loot'

/**
 * Loot tab MVP (P3-LOOT, roadmap §13): read-only scan + list + detail.
 * UI-layer only — per the 3-layer rule this component never scans files or
 * calls the backend directly; the scan lives in Rust (`loot/` module), the
 * hook mediates. The editor (weighted pools, conditions, JSON emission) is
 * the remaining P3-LOOT build — this surface is deliberately read-only and
 * honest about it.
 *
 * States mirror the Pack Health honesty discipline: scanning / error /
 * empty / loaded. No fake rows.
 */
export function LootTab({ projectId, projectPath }: { projectId: string; projectPath: string }) {
  const { scanning, error, tables } = useLootTables(projectPath)
  const [selected, setSelected] = useState<DiscoveredLootTable | null>(null)

  // Future scan inputs (editor integration); reserved, not dead props.
  void projectId

  return (
    <div className="loot-tab" data-testid="loot-tab">
      {scanning ? (
        <div className="loot-status">Scanning loot tables…</div>
      ) : error ? (
        <div className="loot-status loot-error">{error}</div>
      ) : tables.length === 0 ? (
        <div className="loot-empty">
          <h2>Loot tables</h2>
          <p>No loot tables found in this pack (scanned data and mod jars).</p>
        </div>
      ) : (
        <div className="loot-layout">
          <div className="loot-list" role="listbox" aria-label="Loot tables">
            <h2>Loot tables ({tables.length})</h2>
            {tables.map((t) => (
              <button
                key={t.id}
                role="option"
                aria-selected={selected?.id === t.id}
                className={`loot-row ${selected?.id === t.id ? 'active' : ''}`}
                onClick={() => setSelected(t)}
              >
                <span className="loot-row-id">{t.id}</span>
                <span className="loot-row-meta">
                  {t.pools} pool{t.pools === 1 ? '' : 's'} · {t.entries} entr{t.entries === 1 ? 'y' : 'ies'}
                  {!t.editable && ' · jar'}
                </span>
              </button>
            ))}
          </div>
          <div className="loot-detail">
            {selected ? (
              <>
                <h3>{selected.id}</h3>
                <dl className="loot-detail-facts">
                  <dt>Type</dt>
                  <dd>{selected.table_type}</dd>
                  <dt>Pools</dt>
                  <dd>{selected.pools}</dd>
                  <dt>Entries</dt>
                  <dd>{selected.entries}</dd>
                  <dt>Source</dt>
                  <dd className="loot-source" title={selected.source}>{selected.source}</dd>
                </dl>
                <p className="loot-note">
                  Read-only — the loot-table editor (pools, conditions, JSON) is not built (P3-LOOT).
                </p>
              </>
            ) : (
              <p className="loot-placeholder">Select a loot table to inspect it.</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
