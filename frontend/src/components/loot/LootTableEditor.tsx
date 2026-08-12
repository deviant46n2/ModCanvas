import { useState } from 'react'
import { RecipeItemPicker } from '../recipe/RecipeItemPicker'
import type { RecipePickValue } from '../recipe/ItemBrowser'
import type { ItemRegistryEntry, ItemTagInfo } from '../../services/api'
import type { LootEntryModel, LootPoolModel, LootTableModel } from '../../core/loot/model'
import { findLootItemFindings } from '../../core/loot/validation'
import type { LootEditorStatus } from '../../hooks/useLootEditor'
import { LootEntryRow, RollsInput } from './loot-entry-row'
import { LootConditionList } from './LootConditionList'

interface LootTableEditorProps {
  table: LootTableModel
  status: LootEditorStatus
  dirty: boolean
  items: ItemRegistryEntry[]
  tags: ItemTagInfo[]
  getTextureUrl: (itemId: string) => string | null
  onSave: () => void
  onClose: () => void
  onMutate: (updater: (t: LootTableModel) => LootTableModel) => void
}

/** The loot-table editor surface (P3-LOOT). Edits pools, rolls, entry
 *  weights/qualities and item names (via the shared ItemBrowser); conditions
 *  are preserved opaquely — the MVP adds/removes whole condition blocks via
 *  templates, never edits inside them (roadmap scoping decision). Warnings
 *  for dead item references are surfaced, never a save gate (s46 lesson). */
export function LootTableEditor({
  table,
  status,
  dirty,
  items,
  tags,
  getTextureUrl,
  onSave,
  onClose,
  onMutate,
}: LootTableEditorProps) {
  const [pickerFor, setPickerFor] = useState<{ pool: number; entry: number } | null>(null)
  const findings = findLootItemFindings(table, new Set(items.map((i) => i.id)))
  const dead = findings.filter((f) => !f.resolved)
  const saving = status.state === 'saving'

  const setEntry = (poolIdx: number, entryIdx: number, patch: Partial<LootEntryModel>) => {
    onMutate((t) => {
      const pools = [...t.pools]
      pools[poolIdx] = {
        ...pools[poolIdx],
        entries: pools[poolIdx].entries.map((e, i) => (i === entryIdx ? { ...e, ...patch } : e)),
      }
      return { ...t, pools }
    })
  }

  const setPool = (poolIdx: number, patch: Partial<LootPoolModel>) => {
    onMutate((t) => {
      const pools = t.pools.map((p, i) => (i === poolIdx ? { ...p, ...patch } : p))
      return { ...t, pools }
    })
  }

  const addPool = () => {
    onMutate((t) => ({
      ...t,
      pools: [
        ...t.pools,
        {
          rolls: { kind: 'count', value: 1 },
          entries: [],
          conditions: [],
          extra: {},
        },
      ],
    }))
  }

  const removePool = (poolIdx: number) => {
    onMutate((t) => ({ ...t, pools: t.pools.filter((_, i) => i !== poolIdx) }))
  }

  const addEntry = (poolIdx: number) => {
    setPool(poolIdx, {
      entries: [
        ...table.pools[poolIdx].entries,
        { type: 'minecraft:item', weight: 1, functions: [], extra: {} },
      ],
    })
  }

  const removeEntry = (poolIdx: number, entryIdx: number) => {
    setPool(poolIdx, {
      entries: table.pools[poolIdx].entries.filter((_, i) => i !== entryIdx),
    })
  }

  const pickItem = (value: RecipePickValue) => {
    if (!pickerFor) return
    const { pool, entry } = pickerFor
    setEntry(pool, entry, { name: value.item })
    setPickerFor(null)
  }

  return (
    <div className="loot-editor" data-testid="loot-editor">
      <div className="loot-editor-header">
        <h3>Loot table</h3>
        <div className="loot-editor-actions">
          {dirty && <span className="loot-editor-dirty">unsaved changes</span>}
          <button className="loot-btn" onClick={onSave} disabled={!dirty || saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button className="loot-btn loot-btn-ghost" onClick={onClose} disabled={saving}>
            Close
          </button>
        </div>
      </div>

      {status.state === 'saved' && (
        <div className="loot-status loot-saved">Saved.</div>
      )}
      {status.state === 'error' && (
        <div className="loot-status loot-error">{status.message}</div>
      )}

      {dead.length > 0 && (
        <div className="loot-warnings" data-testid="loot-warnings">
          <strong>Unresolved item references</strong>
          <ul>
            {dead.map((f, i) => (
              <li key={i}>
                <code>{f.itemId}</code> at {f.where}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="loot-editor-pools">
        {table.pools.map((pool, poolIdx) => (
          <div className="loot-pool" key={poolIdx} data-testid={`loot-pool-${poolIdx}`}>
            <div className="loot-pool-header">
              <span className="loot-pool-title">Pool {poolIdx + 1}</span>
              <button className="loot-btn loot-btn-ghost loot-btn-small" onClick={() => removePool(poolIdx)}>
                Remove pool
              </button>
            </div>

            <div className="loot-pool-fields">
              <label className="loot-field">
                Rolls
                <RollsInput pool={pool} onPool={(patch) => setPool(poolIdx, patch)} />
              </label>
              <label className="loot-field">
                Bonus rolls
                <input
                  type="number"
                  step="0.5"
                  value={pool.bonus_rolls ?? 0}
                  onChange={(e) => setPool(poolIdx, { bonus_rolls: Number(e.target.value) })}
                />
              </label>
            </div>

            <div className="loot-entries">
              <div className="loot-entries-head">
                <span>Entries</span>
                <button className="loot-btn loot-btn-ghost loot-btn-small" onClick={() => addEntry(poolIdx)}>
                  + Add item entry
                </button>
              </div>
              {pool.entries.length === 0 && <p className="loot-empty-line">No entries.</p>}
              {pool.entries.map((entry, entryIdx) => (
                <LootEntryRow
                  key={entryIdx}
                  entry={entry}
                  getTextureUrl={getTextureUrl}
                  onChange={(patch) => setEntry(poolIdx, entryIdx, patch)}
                  onPick={() => setPickerFor({ pool: poolIdx, entry: entryIdx })}
                  onRemove={() => removeEntry(poolIdx, entryIdx)}
                />
              ))}
            </div>

            <LootConditionList pool={pool} onPool={(patch) => setPool(poolIdx, patch)} />
          </div>
        ))}
        <button className="loot-btn loot-btn-ghost" onClick={addPool}>
          + Add pool
        </button>
      </div>

      {pickerFor && (
        <RecipeItemPicker
          items={items}
          tags={tags}
          getTextureUrl={getTextureUrl}
          onSelect={pickItem}
          onClose={() => setPickerFor(null)}
          allowTags={false}
        />
      )}
    </div>
  )
}
