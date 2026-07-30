import { useState } from 'react'
import type { QuestObjectiveData, QuestRewardData } from '../../services/api'
import { questIconUrl } from './questIcons'
import {
  OBJECTIVE_TYPES,
  REWARD_TYPES,
} from './quest-form-constants'

export function ObjectiveCard({
  obj,
  index,
  textureIndex,
  onRemove,
  onUpdate,
}: {
  obj: QuestObjectiveData
  index: number
  textureIndex: Record<string, string>
  onRemove: () => void
  onUpdate: (field: string, value: unknown) => void
}) {
  const [showAdvanced, setShowAdvanced] = useState(false)
  const iconUrl = questIconUrl(obj.target, textureIndex)

  return (
    <div className="quest-detail-card">
      <div className="quest-detail-card-header">
        <div className="quest-detail-card-title">
          <div className="quest-detail-task-icon">
            {iconUrl ? <img src={iconUrl} alt="" /> : <span className="quest-detail-item-fallback">i</span>}
          </div>
          <span className="quest-detail-card-index">#{index + 1}</span>
          <select value={obj.objective_type} onChange={(e) => onUpdate('objective_type', e.target.value)}>
            {OBJECTIVE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
        <button className="quest-detail-card-remove" onClick={onRemove} title="Remove">✕</button>
      </div>
      <div className="quest-detail-card-body">
        <div className="quest-detail-field-row">
          <div className="quest-detail-field" style={{ flex: 1 }}>
            <label>Target</label>
            <input type="text" value={obj.target} onChange={(e) => onUpdate('target', e.target.value)} placeholder="e.g. minecraft:diamond" />
          </div>
          <div className="quest-detail-field" style={{ width: 80 }}>
            <label>Count</label>
            <input type="number" value={obj.target_count} onChange={(e) => onUpdate('target_count', parseInt(e.target.value) || 1)} />
          </div>
        </div>
        <label className="quest-detail-checkbox" style={{ marginTop: 4 }}>
          <input type="checkbox" checked={obj.required} onChange={(e) => onUpdate('required', e.target.checked)} />
          <span>Required</span>
        </label>
        <div className="quest-detail-card-toggle">
          <button className="quest-detail-ghost-btn" onClick={() => setShowAdvanced(!showAdvanced)}>
            {showAdvanced ? '▾' : '▸'} Advanced
          </button>
        </div>
        {showAdvanced && (
          <div className="quest-detail-card-advanced">
            {obj.objective_type === 'fluid' && (
              <div className="quest-detail-field-row">
                <div className="quest-detail-field">
                  <label>Fluid ID</label>
                  <input type="text" value={obj.fluid_id} onChange={(e) => onUpdate('fluid_id', e.target.value)} />
                </div>
                <div className="quest-detail-field">
                  <label>Amount</label>
                  <input type="number" value={obj.fluid_amount} onChange={(e) => onUpdate('fluid_amount', parseFloat(e.target.value) || 0)} />
                </div>
              </div>
            )}
            {obj.objective_type === 'energy' && (
              <div className="quest-detail-field-row">
                <div className="quest-detail-field">
                  <label>Amount</label>
                  <input type="number" value={obj.energy_amount} onChange={(e) => onUpdate('energy_amount', parseFloat(e.target.value) || 0)} />
                </div>
                <div className="quest-detail-field">
                  <label>Unit</label>
                  <input type="text" value={obj.energy_unit} onChange={(e) => onUpdate('energy_unit', e.target.value)} />
                </div>
              </div>
            )}
            {obj.objective_type === 'xp' && (
              <div className="quest-detail-field-row">
                <div className="quest-detail-field">
                  <label>XP Points</label>
                  <input type="number" value={obj.xp_points} onChange={(e) => onUpdate('xp_points', parseInt(e.target.value) || 0)} />
                </div>
                <div className="quest-detail-field">
                  <label>Levels</label>
                  <input type="number" value={obj.xp_levels} onChange={(e) => onUpdate('xp_levels', parseInt(e.target.value) || 0)} />
                </div>
              </div>
            )}
            {obj.objective_type === 'command' && (
              <div className="quest-detail-field">
                <label>Command</label>
                <input type="text" value={obj.command} onChange={(e) => onUpdate('command', e.target.value)} />
              </div>
            )}
            {obj.objective_type === 'stat' && (
              <div className="quest-detail-field-row">
                <div className="quest-detail-field">
                  <label>Stat</label>
                  <input type="text" value={obj.stat_name} onChange={(e) => onUpdate('stat_name', e.target.value)} />
                </div>
                <div className="quest-detail-field">
                  <label>Count</label>
                  <input type="number" value={obj.stat_value} onChange={(e) => onUpdate('stat_value', parseInt(e.target.value) || 0)} />
                </div>
              </div>
            )}
            {obj.objective_type === 'location_visit' && (
              <div className="quest-detail-field-row">
                <div className="quest-detail-field">
                  <label>X</label>
                  <input type="number" value={obj.x} onChange={(e) => onUpdate('x', parseFloat(e.target.value) || 0)} />
                </div>
                <div className="quest-detail-field">
                  <label>Y</label>
                  <input type="number" value={obj.y} onChange={(e) => onUpdate('y', parseFloat(e.target.value) || 0)} />
                </div>
                <div className="quest-detail-field">
                  <label>Z</label>
                  <input type="number" value={obj.z} onChange={(e) => onUpdate('z', parseFloat(e.target.value) || 0)} />
                </div>
                <div className="quest-detail-field">
                  <label>Dimension</label>
                  <input type="text" value={obj.dimension} onChange={(e) => onUpdate('dimension', e.target.value)} />
                </div>
                <div className="quest-detail-field">
                  <label>Radius</label>
                  <input type="number" value={obj.radius} onChange={(e) => onUpdate('radius', parseFloat(e.target.value) || 0)} />
                </div>
              </div>
            )}
            {obj.objective_type === 'entity_kill' && (
              <div className="quest-detail-field">
                <label>Entity</label>
                <input type="text" value={obj.target} onChange={(e) => onUpdate('target', e.target.value)} />
              </div>
            )}
            {obj.objective_type === 'advancement' && (
              <div className="quest-detail-field">
                <label>Advancement ID</label>
                <input type="text" value={obj.advancement_id} onChange={(e) => onUpdate('advancement_id', e.target.value)} />
              </div>
            )}
            {['item_acquisition', 'item_retrieval', 'item_crafting', 'block_break', 'block_place'].includes(obj.objective_type) && (
              <div className="quest-detail-checkboxes">
                <label className="quest-detail-checkbox">
                  <input type="checkbox" checked={obj.consume_items} onChange={(e) => onUpdate('consume_items', e.target.checked)} />
                  <span>Consume Items</span>
                </label>
                <label className="quest-detail-checkbox">
                  <input type="checkbox" checked={obj.match_nbt} onChange={(e) => onUpdate('match_nbt', e.target.checked)} />
                  <span>Match NBT</span>
                </label>
                <label className="quest-detail-checkbox">
                  <input type="checkbox" checked={obj.ignore_nbt} onChange={(e) => onUpdate('ignore_nbt', e.target.checked)} />
                  <span>Ignore NBT</span>
                </label>
              </div>
            )}
            {obj.objective_type === 'game_stage' && (
              <div className="quest-detail-field">
                <label>Stage</label>
                <input type="text" value={obj.advancement_id} onChange={(e) => onUpdate('advancement_id', e.target.value)} placeholder="e.g. stage_name" />
              </div>
            )}
            {obj.objective_type === 'observation' && (
              <div className="quest-detail-field">
                <label>Range</label>
                <input type="number" value={obj.observation_range} onChange={(e) => onUpdate('observation_range', parseFloat(e.target.value) || 0)} />
              </div>
            )}
            {obj.objective_type === 'visit_biome' && (
              <div className="quest-detail-field">
                <label>Biome</label>
                <input type="text" value={obj.biome_id} onChange={(e) => onUpdate('biome_id', e.target.value)} />
              </div>
            )}
            {obj.objective_type === 'find_structure' && (
              <div className="quest-detail-field">
                <label>Structure</label>
                <input type="text" value={obj.structure_id} onChange={(e) => onUpdate('structure_id', e.target.value)} />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export function RewardCard({
  rew,
  index,
  textureIndex,
  onRemove,
  onUpdate,
}: {
  rew: QuestRewardData
  index: number
  textureIndex: Record<string, string>
  onRemove: () => void
  onUpdate: (field: string, value: unknown) => void
}) {
  const [showAdvanced, setShowAdvanced] = useState(false)
  const iconUrl = questIconUrl(rew.item_id || rew.items[0] || '', textureIndex)

  return (
    <div className="quest-detail-card">
      <div className="quest-detail-card-header">
        <div className="quest-detail-card-title">
          <div className="quest-detail-task-icon">
            {iconUrl ? <img src={iconUrl} alt="" /> : <span className="quest-detail-item-fallback">r</span>}
          </div>
          <span className="quest-detail-card-index">#{index + 1}</span>
          <select value={rew.reward_type} onChange={(e) => onUpdate('reward_type', e.target.value)}>
            {REWARD_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
        <button className="quest-detail-card-remove" onClick={onRemove} title="Remove">✕</button>
      </div>
      <div className="quest-detail-card-body">
        <div className="quest-detail-field-row">
          <div className="quest-detail-field" style={{ flex: 1 }}>
            <label>Item ID</label>
            <input type="text" value={rew.item_id || rew.items[0] || ''} onChange={(e) => onUpdate('item_id', e.target.value)} placeholder="e.g. minecraft:diamond" />
          </div>
          <div className="quest-detail-field" style={{ width: 80 }}>
            <label>Count</label>
            <input type="number" value={rew.item_count} onChange={(e) => onUpdate('item_count', parseInt(e.target.value) || 1)} />
          </div>
          <div className="quest-detail-field" style={{ width: 80 }}>
            <label>Weight</label>
            <input type="number" step="0.1" value={rew.weight} onChange={(e) => onUpdate('weight', parseFloat(e.target.value) || 1.0)} />
          </div>
        </div>
        <div className="quest-detail-card-toggle">
          <button className="quest-detail-ghost-btn" onClick={() => setShowAdvanced(!showAdvanced)}>
            {showAdvanced ? '▾' : '▸'} Advanced
          </button>
        </div>
        {showAdvanced && (
          <div className="quest-detail-card-advanced">
            {['experience', 'xp_levels'].includes(rew.reward_type) && (
              <div className="quest-detail-field-row">
                <div className="quest-detail-field">
                  <label>XP Amount</label>
                  <input type="number" value={rew.xp_amount} onChange={(e) => onUpdate('xp_amount', parseInt(e.target.value) || 0)} />
                </div>
                <div className="quest-detail-field">
                  <label>Levels</label>
                  <input type="number" value={rew.xp_levels} onChange={(e) => onUpdate('xp_levels', parseInt(e.target.value) || 0)} />
                </div>
              </div>
            )}
            {rew.reward_type === 'command' && (
              <div className="quest-detail-field">
                <label>Command</label>
                <input type="text" value={rew.command} onChange={(e) => onUpdate('command', e.target.value)} />
              </div>
            )}
            {rew.reward_type === 'loot_table' && (
              <div className="quest-detail-field">
                <label>Loot Table</label>
                <input type="text" value={rew.loot_table} onChange={(e) => onUpdate('loot_table', e.target.value)} />
              </div>
            )}
            {rew.reward_type === 'game_stage' && (
              <div className="quest-detail-field">
                <label>Stage</label>
                <input type="text" value={rew.game_stage} onChange={(e) => onUpdate('game_stage', e.target.value)} />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
