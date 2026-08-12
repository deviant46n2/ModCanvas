import { useState } from 'react'
import { useLootTables } from '../../hooks/useLootTables'
import { useLootEditor } from '../../hooks/useLootEditor'
import { useBehaviorItemPicker } from '../../hooks/useBehaviorItemPicker'
import { LootTableEditor } from './LootTableEditor'
import type { DiscoveredLootTable } from '../../services/loot'

/**
 * Loot tab (P3-LOOT, roadmap §13): the s44 read-only scan surface, now with
 * the editor for pack-editable tables. Jar tables stay read-only — a jar
 * cannot be edited in place. UI-layer only: scanning/reading/saving all go
 * through hooks + services per the 3-layer rule; this component never calls
 * the backend directly.
 */
export function LootTab({ projectId, projectPath }: { projectId: string; projectPath: string }) {
  const { scanning, error, tables } = useLootTables(projectPath)
  const editor = useLootEditor(projectPath)
  const { items, tags, getTextureUrl } = useBehaviorItemPicker(projectPath)
  const [selected, setSelected] = useState<DiscoveredLootTable | null>(null)

  void projectId

  const openTable = (t: DiscoveredLootTable) => {
    setSelected(t)
    if (t.editable) {
      editor.close()
      editor.open(t)
    } else {
      editor.close()
    }
  }

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
                onClick={() => openTable(t)}
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
              selected.editable && editor.table ? (
                <LootTableEditor
                  table={editor.table}
                  status={editor.status}
                  dirty={editor.dirty}
                  items={items}
                  tags={tags}
                  getTextureUrl={getTextureUrl}
                  onSave={editor.save}
                  onClose={editor.close}
                  onMutate={editor.mutate}
                />
              ) : selected.editable && editor.status.state === 'error' ? (
                <>
                  <h3>{selected.id}</h3>
                  <div className="loot-status loot-error">{editor.status.message}</div>
                </>
              ) : (
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
                  {selected.editable ? (
                    <p className="loot-note">Loading table…</p>
                  ) : (
                    <p className="loot-note">
                      From a mod jar — read-only. Duplicate the table into the pack's
                      <code> data/</code> to edit it.
                    </p>
                  )}
                </>
              )
            ) : (
              <p className="loot-placeholder">Select a loot table to inspect or edit it.</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
