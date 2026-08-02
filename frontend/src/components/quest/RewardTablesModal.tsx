import { useState } from 'react'
import type { QuestGraphData, RewardTableData, QuestRewardData } from '../../services/api'
import { questIconUrl, resolveIconKey } from './questIcons'
import { isTexturePending } from '../../services/texture-loader'
import { AnimatedSprite } from './AnimatedSprite'
import { SmartFilterIcon } from './SmartFilterIcon'
import { getFallbackIcon } from './QuestTileTypes'
import { generateFtbHexId, defaultReward } from './quest-helpers'

interface RewardTablesModalProps {
  open: boolean
  graph: QuestGraphData
  textureIndex: Record<string, string>
  onGraphChange: (g: QuestGraphData) => void
  onClose: () => void
}

function tableUsages(graph: QuestGraphData, tableId: string): number {
  let count = 0
  for (const n of graph.nodes) {
    for (const r of n.rewards || []) {
      if (r.table_id === tableId) count += 1
    }
  }
  return count
}

export function RewardTablesModal({
  open,
  graph,
  textureIndex,
  onGraphChange,
  onClose,
}: RewardTablesModalProps) {
  const tables = graph.reward_tables || []
  const [selectedId, setSelectedId] = useState<string | null>(tables[0]?.id ?? null)

  if (!open) return null
  const selected = tables.find(t => t.id === selectedId) || null

  const addTable = () => {
    const table: RewardTableData = {
      id: generateFtbHexId(),
      title: 'New Reward Table',
      order_index: tables.length,
      loot_size: 3,
      empty_weight: 0,
      hide_tooltip: false,
      use_title: true,
      rewards: [],
    }
    onGraphChange({ ...graph, reward_tables: [...tables, table] })
    setSelectedId(table.id)
  }

  const deleteTable = (id: string) => {
    const next = tables.filter(t => t.id !== id)
    onGraphChange({
      ...graph,
      reward_tables: next,
      nodes: graph.nodes.map(n => ({
        ...n,
        rewards: (n.rewards || []).map(r =>
          r.table_id === id ? { ...r, table_id: '', choices: [], item_id: '' } : r
        ),
      })),
    })
    if (selectedId === id) setSelectedId(next[0]?.id || null)
  }

  const updateTable = (id: string, data: Partial<RewardTableData>) => {
    onGraphChange({
      ...graph,
      reward_tables: tables.map(t => (t.id === id ? { ...t, ...data } : t)),
    })
  }

  const addEntry = (tableId: string) => {
    const entry: QuestRewardData = {
      ...defaultReward(),
      reward_type: 'item',
      weight: 1.0,
      item_count: 1,
    }
    const table = tables.find(t => t.id === tableId)
    if (!table) return
    updateTable(tableId, { rewards: [...(table.rewards || []), entry] })
  }

  const updateEntry = (tableId: string, entryId: string, field: string, value: unknown) => {
    const table = tables.find(t => t.id === tableId)
    if (!table) return
    updateTable(tableId, {
      rewards: (table.rewards || []).map(r => (r.id === entryId ? { ...r, [field]: value } : r)),
    })
  }

  const removeEntry = (tableId: string, entryId: string) => {
    const table = tables.find(t => t.id === tableId)
    if (!table) return
    updateTable(tableId, { rewards: (table.rewards || []).filter(r => r.id !== entryId) })
  }

  const moveEntry = (tableId: string, entryId: string, dir: -1 | 1) => {
    const table = tables.find(t => t.id === tableId)
    if (!table) return
    const list = [...(table.rewards || [])]
    const idx = list.findIndex(r => r.id === entryId)
    const target = idx + dir
    if (idx < 0 || target < 0 || target >= list.length) return
    const tmp = list[idx]
    list[idx] = list[target]
    list[target] = tmp
    updateTable(tableId, { rewards: list })
  }

  return (
    <div className="ftb-quest-popup-overlay" onClick={onClose}>
      <div className="ftb-quest-popup" style={{ width: '720px' }} onClick={(e) => e.stopPropagation()}>
        <div className="ftb-popup-header">
          <div className="ftb-popup-header-left">
            <div className="ftb-popup-title">Reward Tables</div>
          </div>
          <button className="ftb-popup-close" onClick={onClose}>✕</button>
        </div>
        <div className="ftb-popup-body" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
          <div className="ftb-popup-field" style={{ marginBottom: 8 }}>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              {tables.map(t => (
                <button
                  key={t.id}
                  className="ftb-popup-btn"
                  style={t.id === selectedId ? { background: 'var(--ftb-accent)', color: '#06251a' } : undefined}
                  onClick={() => setSelectedId(t.id)}
                  title={`${t.rewards?.length || 0} entries`}
                >
                  {t.title}
                </button>
              ))}
              <button className="ftb-popup-btn primary" onClick={addTable}>＋ New Table</button>
            </div>
          </div>

          {!selected ? (
            <div className="ftb-popup-section" style={{ opacity: 0.6, fontSize: 13 }}>
              No reward table selected. Create one to get started.
            </div>
          ) : (
            <>
              <div className="ftb-popup-section">
                <div className="ftb-popup-section-title">Table Properties</div>
                <div className="ftb-popup-field">
                  <label>Title</label>
                  <input type="text" value={selected.title} onChange={(e) => updateTable(selected.id, { title: e.target.value })} />
                </div>
                <div className="ftb-popup-field">
                  <label>Loot Size (items granted per roll)</label>
                  <input type="number" min="1" value={selected.loot_size} onChange={(e) => updateTable(selected.id, { loot_size: parseInt(e.target.value) || 1 })} />
                </div>
                <div className="ftb-popup-field">
                  <label>Empty Weight (chance to grant nothing)</label>
                  <input type="number" min="0" step="0.1" value={selected.empty_weight} onChange={(e) => updateTable(selected.id, { empty_weight: parseFloat(e.target.value) || 0 })} />
                </div>
                <label className="ftb-popup-checkbox">
                  <input type="checkbox" checked={selected.hide_tooltip} onChange={(e) => updateTable(selected.id, { hide_tooltip: e.target.checked })} />
                  <span>Hide Tooltip</span>
                </label>
                <label className="ftb-popup-checkbox">
                  <input type="checkbox" checked={selected.use_title} onChange={(e) => updateTable(selected.id, { use_title: e.target.checked })} />
                  <span>Use Title</span>
                </label>
              </div>

              <div className="ftb-popup-section">
                <div className="ftb-popup-section-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>Weighted Entries ({(selected.rewards || []).length})</span>
                  <button className="ftb-popup-btn" onClick={() => addEntry(selected.id)}>＋ Add Entry</button>
                </div>
                {tableUsages(graph, selected.id) > 0 && (
                  <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 8 }}>
                    Referenced by {tableUsages(graph, selected.id)} reward(s) in quests.
                  </div>
                )}
                {(selected.rewards || []).length === 0 && (
                  <div style={{ opacity: 0.6, fontSize: 13 }}>No entries. Add an item to this pool.</div>
                )}
                {(selected.rewards || []).map((r, idx) => {
                  const iconUrl = questIconUrl(r.item_id || r.items[0] || '', textureIndex)
                  const pending = isTexturePending(textureIndex, resolveIconKey(r.item_id || r.items[0] || ''))
                  return (
                    <div key={r.id} className="ftb-popup-field" style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '4px 0' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <button className="ftb-popup-btn" style={{ padding: '1px 6px' }} onClick={() => moveEntry(selected.id, r.id, -1)} disabled={idx === 0} title="Move up">↑</button>
                        <button className="ftb-popup-btn" style={{ padding: '1px 6px' }} onClick={() => moveEntry(selected.id, r.id, 1)} disabled={idx === (selected.rewards || []).length - 1} title="Move down">↓</button>
                      </div>
                      <div style={{ width: 24, height: 24, flexShrink: 0, background: 'var(--ftb-input-bg)', border: '1px solid var(--ftb-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', imageRendering: 'pixelated' }}>
                        {r.smart_filter ? (
                          <SmartFilterIcon dsl={r.smart_filter} textureIndex={textureIndex} fallback={getFallbackIcon('item')} size={18} />
                        ) : iconUrl ? <AnimatedSprite url={iconUrl} textureKey={resolveIconKey(r.item_id || r.items[0] || '')} width={18} height={18} alt="" /> : pending ? (
                          <span style={{ fontSize: 10 }}>⌛</span>
                        ) : (
                          <span style={{ fontSize: 12 }}>{getFallbackIcon('item')}</span>
                        )}
                      </div>
                      <input
                        type="text"
                        style={{ flex: 1 }}
                        value={r.item_id || r.items[0] || ''}
                        onChange={(e) => updateEntry(selected.id, r.id, 'item_id', e.target.value)}
                        placeholder="minecraft:diamond"
                      />
                      <input
                        type="number"
                        style={{ width: 70 }}
                        min="1"
                        value={r.item_count}
                        onChange={(e) => updateEntry(selected.id, r.id, 'item_count', parseInt(e.target.value) || 1)}
                      />
                      <input
                        type="number"
                        style={{ width: 70 }}
                        min="0"
                        step="0.1"
                        value={r.weight}
                        onChange={(e) => updateEntry(selected.id, r.id, 'weight', parseFloat(e.target.value) || 0)}
                      />
                      <button className="ftb-popup-btn danger" style={{ padding: '1px 8px' }} onClick={() => removeEntry(selected.id, r.id)} title="Remove entry">✕</button>
                    </div>
                  )
                })}
                <div style={{ fontSize: 11, opacity: 0.6, marginTop: 4, display: 'flex', gap: 16 }}>
                  <span>Item</span><span>Count</span><span style={{ flex: 1, textAlign: 'right' }}>Weight</span>
                </div>
              </div>
            </>
          )}
        </div>
        <div className="ftb-popup-footer">
          <div className="ftb-popup-footer-left">
            {selected && (
              <button className="ftb-popup-btn danger" onClick={() => deleteTable(selected.id)}>Delete Table</button>
            )}
          </div>
          <div className="ftb-popup-footer-right">
            <button className="ftb-popup-btn" onClick={onClose}>Close</button>
          </div>
        </div>
      </div>
    </div>
  )
}