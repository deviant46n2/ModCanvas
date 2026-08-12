import { useMemo, useState } from 'react'
import { useLootTables } from '../../hooks/useLootTables'
import { useLootEditor } from '../../hooks/useLootEditor'
import { useBehaviorItemPicker } from '../../hooks/useBehaviorItemPicker'
import { LootTableEditor } from './LootTableEditor'
import { NewLootTableForm } from './NewLootTableForm'
import { createLootTable, starterLootTableContent, type DiscoveredLootTable } from '../../services/loot'
import { getAdapter } from '../../adapters'
import { normalizeLoader } from '../../core/recipe/loader'

/**
 * Loot tab (P3-LOOT, roadmap §13): the s44 read-only scan surface, now with
 * the editor for pack-editable tables and a New Table form. Jar tables stay
 * read-only. UI-layer only: scanning/reading/creating/saving all go through
 * hooks + services per the 3-layer rule; this component never calls the
 * backend directly.
 */
export function LootTab({
  projectId,
  projectPath,
  minecraftVersion,
  modLoader,
}: {
  projectId: string
  projectPath: string
  minecraftVersion: string
  modLoader: string
}) {
  const { scanning, error, tables, refresh } = useLootTables(projectPath)
  const editor = useLootEditor(projectPath)
  const { items, tags, getTextureUrl } = useBehaviorItemPicker(projectPath)
  const [selected, setSelected] = useState<DiscoveredLootTable | null>(null)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')

  const dirName = useMemo(
    () => getAdapter(minecraftVersion ?? '1.21.1', normalizeLoader(modLoader)).getLootDirName(),
    [minecraftVersion, modLoader],
  )

  void projectId

  const openTable = (t: DiscoveredLootTable) => {
    setSelected(t)
    setCreating(false)
    if (t.editable) {
      editor.close()
      editor.open(t)
    } else {
      editor.close()
    }
  }

  const createTable = async (namespace: string, name: string) => {
    setCreateError('')
    try {
      const row = await createLootTable(
        projectPath,
        namespace,
        name,
        dirName,
        starterLootTableContent(namespace),
      )
      setCreating(false)
      refresh()
      setSelected(row)
      editor.open(row)
    } catch (e) {
      setCreateError(String(e))
    }
  }

  return (
    <div className="loot-tab" data-testid="loot-tab">
      {scanning ? (
        <div className="loot-status">Scanning loot tables…</div>
      ) : error ? (
        <div className="loot-status loot-error">{error}</div>
      ) : (
        <div className="loot-layout">
          <div className="loot-list" role="listbox" aria-label="Loot tables">
            <div className="loot-list-head">
              <h2>Loot tables ({tables.length})</h2>
              {!creating && (
                <button className="loot-btn loot-btn-small" onClick={() => { setCreating(true); editor.close(); setSelected(null) }}>
                  + New table
                </button>
              )}
            </div>
            {creating && (
              <NewLootTableForm
                dirName={dirName}
                onCancel={() => { setCreating(false); setCreateError('') }}
                onCreate={createTable}
              />
            )}
            {createError && <p className="loot-error">{createError}</p>}
            {tables.length === 0 && !creating && (
              <p className="loot-empty">No loot tables found in this pack (scanned data and mod jars).</p>
            )}
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
              <p className="loot-placeholder">
                Select a loot table to inspect or edit it — or create a new one.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
