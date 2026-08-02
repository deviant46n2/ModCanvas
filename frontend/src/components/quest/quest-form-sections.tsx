import { useState } from 'react'
import type { QuestObjectiveData, QuestRewardData, RewardTableData } from '../../services/api'
import { questIconUrl, resolveIconKey } from './questIcons'
import { getFallbackIcon } from './QuestTileTypes'
import { isTexturePending } from '../../services/texture-loader'
import { QuestIcon } from './QuestIcon'
import { AnimatedSprite } from './AnimatedSprite'
import { SmartFilterIcon } from './SmartFilterIcon'
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
  onOpenItemPicker,
}: {
  obj: QuestObjectiveData
  index: number
  textureIndex: Record<string, string>
  onRemove: () => void
  onUpdate: (field: string, value: unknown) => void
  onOpenItemPicker?: () => void
}) {
  const [showAdvanced, setShowAdvanced] = useState(false)
  const iconUrl = questIconUrl(obj.target || obj.fluid_id, textureIndex)
  const iconPending = isTexturePending(textureIndex, resolveIconKey(obj.target || obj.fluid_id))

  return (
    <div className="quest-detail-card">
      <div className="quest-detail-card-header">
        <div className="quest-detail-card-title">
          <div
            className="quest-detail-task-icon"
            onClick={onOpenItemPicker}
            style={{ cursor: onOpenItemPicker ? 'pointer' : 'default' }}
            title={onOpenItemPicker ? 'Click to pick item' : undefined}
          >
            {obj.smart_filter ? (
              <SmartFilterIcon
                dsl={obj.smart_filter}
                textureIndex={textureIndex}
                fallback={getFallbackIcon(obj.objective_type)}
                size={24}
              />
            ) : iconUrl ? <AnimatedSprite url={iconUrl} textureKey={resolveIconKey(obj.target || obj.fluid_id)} width={24} height={24} alt="" /> : iconPending ? (
              <QuestIcon pending url={null} fallback="" size={24} />
            ) : (
              <span className="quest-detail-item-fallback">{getFallbackIcon(obj.objective_type)}</span>
            )}
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
            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              <input type="text" value={obj.target} onChange={(e) => onUpdate('target', e.target.value)} placeholder="e.g. minecraft:diamond" style={{ flex: 1 }} />
              <button className="quest-detail-small-btn" onClick={onOpenItemPicker} title="Pick item" style={onOpenItemPicker ? {} : { display: 'none' }}>📦</button>
            </div>
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
              </div>
            )}
            {obj.objective_type === 'location_visit' && (
              <div className="quest-detail-field-row">
                <div className="quest-detail-field">
                  <label>Box Width</label>
                  <input type="number" min="1" value={obj.box_w || 1} onChange={(e) => onUpdate('box_w', Math.max(1, parseFloat(e.target.value) || 1))} />
                </div>
                <div className="quest-detail-field">
                  <label>Box Height</label>
                  <input type="number" min="1" value={obj.box_h || 1} onChange={(e) => onUpdate('box_h', Math.max(1, parseFloat(e.target.value) || 1))} />
                </div>
                <div className="quest-detail-field">
                  <label>Box Depth</label>
                  <input type="number" min="1" value={obj.box_d || 1} onChange={(e) => onUpdate('box_d', Math.max(1, parseFloat(e.target.value) || 1))} />
                </div>
              </div>
            )}
            {obj.objective_type === 'location_visit' && (
              <div className="quest-detail-checkboxes">
                <label className="quest-detail-checkbox">
                  <input type="checkbox" checked={obj.ignore_dim} onChange={(e) => onUpdate('ignore_dim', e.target.checked)} />
                  <span>Ignore Dimension</span>
                </label>
              </div>
            )}
            {obj.objective_type === 'entity_kill' && (
              <div className="quest-detail-field-row">
                <div className="quest-detail-field" style={{ flex: 1 }}>
                  <label>Entity</label>
                  <input type="text" value={obj.target} onChange={(e) => onUpdate('target', e.target.value)} placeholder="e.g. minecraft:zombie" />
                </div>
                <div className="quest-detail-field" style={{ flex: 1 }}>
                  <label>Entity Type Tag</label>
                  <input type="text" value={obj.entity_type_tag} onChange={(e) => onUpdate('entity_type_tag', e.target.value)} placeholder="e.g. minecraft:hostile" />
                </div>
              </div>
            )}
            {obj.objective_type === 'entity_kill' && (
              <div className="quest-detail-field">
                <label>Custom Name</label>
                <input type="text" value={obj.custom_name} onChange={(e) => onUpdate('custom_name', e.target.value)} placeholder="Optional custom name/predicate" />
              </div>
            )}
            {obj.objective_type === 'entity_kill' && (
              <div className="quest-detail-field">
                <label>NBT Filter</label>
                <input type="text" value={obj.nbt_filter} onChange={(e) => onUpdate('nbt_filter', e.target.value)} placeholder="e.g. {Damage: 3}" />
              </div>
            )}
            {obj.objective_type === 'advancement' && (
              <div className="quest-detail-field-row">
                <div className="quest-detail-field" style={{ flex: 1 }}>
                  <label>Advancement ID</label>
                  <input type="text" value={obj.advancement_id} onChange={(e) => onUpdate('advancement_id', e.target.value)} />
                </div>
                <div className="quest-detail-field" style={{ flex: 1 }}>
                  <label>Criterion</label>
                  <input type="text" value={obj.criterion} onChange={(e) => onUpdate('criterion', e.target.value)} placeholder="Optional" />
                </div>
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
                <label className="quest-detail-checkbox">
                  <input type="checkbox" checked={obj.task_screen_only} onChange={(e) => onUpdate('task_screen_only', e.target.checked)} />
                  <span>Task Screen Only</span>
                </label>
                <label className="quest-detail-checkbox">
                  <input type="checkbox" checked={obj.only_from_crafting} onChange={(e) => onUpdate('only_from_crafting', e.target.checked)} />
                  <span>Only From Crafting</span>
                </label>
                <label className="quest-detail-checkbox">
                  <input type="checkbox" checked={obj.match_components} onChange={(e) => onUpdate('match_components', e.target.checked)} />
                  <span>Match Components</span>
                </label>
              </div>
            )}
            {obj.objective_type === 'game_stage' && (
              <div className="quest-detail-field">
                <label>Stage</label>
                <input type="text" value={obj.advancement_id} onChange={(e) => onUpdate('advancement_id', e.target.value)} placeholder="e.g. stage_name" />
              </div>
            )}
            {obj.objective_type === 'game_stage' && (
              <div className="quest-detail-checkboxes">
                <label className="quest-detail-checkbox">
                  <input type="checkbox" checked={obj.team_stage} onChange={(e) => onUpdate('team_stage', e.target.checked)} />
                  <span>Team Stage</span>
                </label>
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
  onOpenItemPicker,
  rewardTables,
}: {
  rew: QuestRewardData
  index: number
  textureIndex: Record<string, string>
  onRemove: () => void
  onUpdate: (field: string, value: unknown) => void
  onOpenItemPicker?: () => void
  rewardTables?: RewardTableData[]
}) {
  const [showAdvanced, setShowAdvanced] = useState(false)
  const iconUrl = questIconUrl(rew.item_id || rew.items[0] || '', textureIndex)
  const iconPending = isTexturePending(textureIndex, resolveIconKey(rew.item_id || rew.items[0] || ''))

  return (
    <div className="quest-detail-card">
      <div className="quest-detail-card-header">
        <div className="quest-detail-card-title">
          <div
            className="quest-detail-task-icon"
            onClick={onOpenItemPicker}
            style={{ cursor: onOpenItemPicker ? 'pointer' : 'default' }}
            title={onOpenItemPicker ? 'Click to pick item' : undefined}
          >
            {rew.smart_filter ? (
              <SmartFilterIcon
                dsl={rew.smart_filter}
                textureIndex={textureIndex}
                fallback={getFallbackIcon(rew.reward_type)}
                size={24}
              />
            ) : iconUrl ? <AnimatedSprite url={iconUrl} textureKey={resolveIconKey(rew.item_id || rew.items[0] || '')} width={24} height={24} alt="" /> : iconPending ? (
              <QuestIcon pending url={null} fallback="" size={24} />
            ) : (
              <span className="quest-detail-item-fallback">{getFallbackIcon(rew.reward_type)}</span>
            )}
          </div>
          <span className="quest-detail-card-index">#{index + 1}</span>
          <select value={rew.reward_type} onChange={(e) => onUpdate('reward_type', e.target.value)}>
            {REWARD_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
        <button className="quest-detail-card-remove" onClick={onRemove} title="Remove">✕</button>
      </div>
      <div className="quest-detail-card-body">
        {['choice', 'random', 'all_table'].includes(rew.reward_type) ? (
          <div className="quest-detail-field">
            <label>Reward Table</label>
            {rewardTables && rewardTables.length > 0 ? (
              <select value={rew.table_id || ''} onChange={(e) => onUpdate('table_id', e.target.value || '')}>
                <option value="">— No table —</option>
                {rewardTables.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
              </select>
            ) : (
              <input type="text" value={rew.table_id || ''} onChange={(e) => onUpdate('table_id', e.target.value)} placeholder="Reward table id" />
            )}
          </div>
        ) : (
        <div className="quest-detail-field-row">
          <div className="quest-detail-field" style={{ flex: 1 }}>
            <label>Item ID</label>
            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              <input type="text" value={rew.item_id || rew.items[0] || ''} onChange={(e) => onUpdate('item_id', e.target.value)} placeholder="e.g. minecraft:diamond" style={{ flex: 1 }} />
              <button className="quest-detail-small-btn" onClick={onOpenItemPicker} title="Pick item" style={onOpenItemPicker ? {} : { display: 'none' }}>📦</button>
            </div>
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
        )}
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
            {rew.reward_type === 'command' && (
              <div className="quest-detail-field-row">
                <div className="quest-detail-field">
                  <label>Permission Level</label>
                  <input type="number" min="0" max="4" value={rew.permission_level} onChange={(e) => onUpdate('permission_level', parseInt(e.target.value) || 0)} />
                </div>
                <div className="quest-detail-field">
                  <label>Feedback Message</label>
                  <input type="text" value={rew.feedback_message} onChange={(e) => onUpdate('feedback_message', e.target.value)} placeholder="Optional" />
                </div>
              </div>
            )}
            {rew.reward_type === 'command' && (
              <div className="quest-detail-checkboxes">
                <label className="quest-detail-checkbox">
                  <input type="checkbox" checked={rew.silent} onChange={(e) => onUpdate('silent', e.target.checked)} />
                  <span>Silent</span>
                </label>
              </div>
            )}
            {rew.reward_type === 'item' && (
              <div className="quest-detail-field-row">
                <div className="quest-detail-field">
                  <label>Random Bonus</label>
                  <input type="number" step="0.5" min="0" value={rew.random_bonus} onChange={(e) => onUpdate('random_bonus', parseFloat(e.target.value) || 0)} />
                </div>
              </div>
            )}
            {rew.reward_type === 'item' && (
              <div className="quest-detail-checkboxes">
                <label className="quest-detail-checkbox">
                  <input type="checkbox" checked={rew.only_one} onChange={(e) => onUpdate('only_one', e.target.checked)} />
                  <span>Only One</span>
                </label>
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
            <div className="quest-detail-field-row">
              <div className="quest-detail-field">
                <label>Auto-Claim</label>
                <select value={rew.autoclaim} onChange={(e) => onUpdate('autoclaim', e.target.value)}>
                  <option value="">Default</option>
                  <option value="enabled">Enabled</option>
                  <option value="disabled">Disabled</option>
                  <option value="no_toast">No Toast</option>
                  <option value="invisible">Invisible</option>
                </select>
              </div>
            </div>
            <div className="quest-detail-checkboxes">
              <label className="quest-detail-checkbox">
                <input type="checkbox" checked={rew.team_reward} onChange={(e) => onUpdate('team_reward', e.target.checked)} />
                <span>Team Reward</span>
              </label>
              <label className="quest-detail-checkbox">
                <input type="checkbox" checked={rew.exclude_from_claim_all} onChange={(e) => onUpdate('exclude_from_claim_all', e.target.checked)} />
                <span>Exclude From Claim All</span>
              </label>
              <label className="quest-detail-checkbox">
                <input type="checkbox" checked={rew.ignore_reward_blocking} onChange={(e) => onUpdate('ignore_reward_blocking', e.target.checked)} />
                <span>Ignore Reward Blocking</span>
              </label>
              <label className="quest-detail-checkbox">
                <input type="checkbox" checked={rew.disable_reward_screen_blur} onChange={(e) => onUpdate('disable_reward_screen_blur', e.target.checked)} />
                <span>Disable Screen Blur</span>
              </label>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
