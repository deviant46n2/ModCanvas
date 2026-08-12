import type { LootEntryModel, LootPoolModel } from '../../core/loot/model'

/** Pool rolls editor: a plain number (count), a uniform min–max range, or an
 *  opaque exotic provider (binomial etc.) shown read-only and preserved. */
export function RollsInput({
  pool,
  onPool,
}: {
  pool: LootPoolModel
  onPool: (patch: Partial<LootPoolModel>) => void
}) {
  const rolls = pool.rolls
  if (rolls.kind === 'count') {
    return (
      <input
        type="number"
        step="0.5"
        value={rolls.value}
        onChange={(e) => onPool({ rolls: { kind: 'count', value: Number(e.target.value) } })}
      />
    )
  }
  if (rolls.kind === 'uniform') {
    return (
      <span className="loot-rolls-range">
        <input
          type="number"
          step="0.5"
          value={rolls.min}
          aria-label="Min rolls"
          onChange={(e) =>
            onPool({ rolls: { kind: 'uniform', min: Number(e.target.value), max: rolls.max, extra: rolls.extra } })
          }
        />
        –
        <input
          type="number"
          step="0.5"
          value={rolls.max}
          aria-label="Max rolls"
          onChange={(e) =>
            onPool({ rolls: { kind: 'uniform', min: rolls.min, max: Number(e.target.value), extra: rolls.extra } })
          }
        />
      </span>
    )
  }
  return <span className="loot-rolls-other" title="Opaque rolls provider (preserved)">opaque (read-only)</span>
}

/** One loot entry row: icon, type select, name (item picker for item entries,
 *  text input for tag/table ids), weight, quality, remove. */
export function LootEntryRow({
  entry,
  getTextureUrl,
  onChange,
  onPick,
  onRemove,
}: {
  entry: LootEntryModel
  getTextureUrl: (itemId: string) => string | null
  onChange: (patch: Partial<LootEntryModel>) => void
  onPick: () => void
  onRemove: () => void
}) {
  const url = entry.name ? getTextureUrl(entry.name) : null
  const isItem = entry.type === 'minecraft:item'
  return (
    <div className="loot-entry" data-testid="loot-entry">
      {url ? <img className="loot-entry-icon" src={url} alt="" /> : <span className="loot-entry-icon loot-entry-icon-empty" />}
      <select
        className="loot-entry-type"
        value={entry.type}
        onChange={(e) => onChange({ type: e.target.value })}
        aria-label="Entry type"
      >
        <option value="minecraft:item">item</option>
        <option value="minecraft:tag">tag</option>
        <option value="minecraft:loot_table">loot table</option>
        <option value="minecraft:empty">empty</option>
        <option value="minecraft:group">group</option>
        <option value="minecraft:alternatives">alternatives</option>
        <option value="minecraft:dynamic">dynamic</option>
      </select>
      {isItem ? (
        <button className="loot-entry-name" onClick={onPick} title="Pick an item">
          {entry.name ?? '— pick item —'}
        </button>
      ) : (
        <input
          className="loot-entry-name"
          value={entry.name ?? ''}
          placeholder="name (tag / table id)"
          onChange={(e) => onChange({ name: e.target.value || undefined })}
        />
      )}
      <label className="loot-field loot-field-inline">
        Weight
        <input
          type="number"
          step="1"
          value={entry.weight ?? 1}
          onChange={(e) => onChange({ weight: Number(e.target.value) })}
        />
      </label>
      <label className="loot-field loot-field-inline">
        Quality
        <input
          type="number"
          step="1"
          value={entry.quality ?? 0}
          onChange={(e) => onChange({ quality: Number(e.target.value) })}
        />
      </label>
      <button className="loot-btn loot-btn-ghost loot-btn-small" onClick={onRemove} aria-label="Remove entry">
        ✕
      </button>
    </div>
  )
}
