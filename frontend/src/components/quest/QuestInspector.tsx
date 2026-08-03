import { useState } from 'react'
import type { ReactNode } from 'react'
import type { QuestNodeData, QuestObjectiveData, QuestRewardData } from '../../services/api'
import { questIconUrl, resolveIconKey } from './questIcons'
import { SHAPES, OBJECTIVE_TYPES, REWARD_TYPES, VISIBILITY_OPTIONS, PROGRESSION_MODES } from './quest-form-constants'
import { SmartFilterIcon } from './SmartFilterIcon'
import { AnimatedSprite } from './AnimatedSprite'
import { XIcon } from '../ui/icons'
import './QuestInspector.css'

interface QuestInspectorProps {
  node: QuestNodeData
  textureIndex: Record<string, string>
  onUpdateNode: (nodeId: string, data: Partial<QuestNodeData>) => void
  onDeleteNode: (nodeId: string) => void
  onAddObjective: (nodeId: string) => void
  onRemoveObjective: (nodeId: string, objectiveId: string) => void
  onUpdateObjective: (nodeId: string, objectiveId: string, field: string, value: unknown) => void
  onAddReward: (nodeId: string) => void
  onRemoveReward: (nodeId: string, rewardId: string) => void
  onUpdateReward: (nodeId: string, rewardId: string, field: string, value: unknown) => void
  openIconPicker: (target: { type: 'quest'; nodeId: string }) => void
  onOpenItemPicker?: (target: { type: 'objective' | 'reward'; id: string; nodeId: string }) => void
  onClose: () => void
}

function ItemSlot({
  iconUrl,
  iconNode,
  label,
  onPickerClick,
  size = 32,
  textureKey,
}: {
  iconUrl?: string
  iconNode?: ReactNode
  label?: string
  onPickerClick?: () => void
  size?: number
  textureKey?: string
}) {
  return (
    <div
      className="quest-inspector-item-slot"
      style={{ width: size, height: size }}
      onClick={onPickerClick}
      title="Pick item from JEI/EMI"
    >
      {iconNode ?? (iconUrl ? (
        <AnimatedSprite url={iconUrl} textureKey={textureKey} width={size} height={size} alt="" />
      ) : (
        <span className="slot-fallback">{label?.[0] || '?'}</span>
      ))}
      <span className="slot-picker-hint">+</span>
    </div>
  )
}

function ObjectiveCard({
  obj,
  index,
  nodeId,
  textureIndex,
  onRemove,
  onUpdate,
  onOpenItemPicker,
}: {
  obj: QuestObjectiveData
  index: number
  nodeId: string
  textureIndex: Record<string, string>
  onRemove: () => void
  onUpdate: (field: string, value: unknown) => void
  onOpenItemPicker?: (target: { type: 'objective' | 'reward'; id: string; nodeId: string }) => void
}) {
  const [showAdvanced, setShowAdvanced] = useState(false)
  const iconUrl = questIconUrl(obj.target, textureIndex)

  return (
    <div className="quest-inspector-card">
      <div className="quest-inspector-card-header">
        <div className="quest-inspector-card-left">
          <span className="quest-inspector-card-index">#{index + 1}</span>
          <select
            className="quest-inspector-card-type-select"
            value={obj.objective_type}
            onChange={(e) => onUpdate('objective_type', e.target.value)}
          >
            {OBJECTIVE_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>
        <button className="quest-inspector-card-remove" onClick={onRemove} title="Remove task"><XIcon size={12} /></button>
      </div>
      <div className="quest-inspector-card-body">
        <div className="quest-inspector-slot-row">
          <ItemSlot
            iconUrl={iconUrl}
            textureKey={resolveIconKey(obj.target)}
            iconNode={obj.smart_filter ? (
              <SmartFilterIcon dsl={obj.smart_filter} textureIndex={textureIndex} fallback="?" size={32} />
            ) : undefined}
            label={obj.target || 'i'}
            onPickerClick={
              onOpenItemPicker
                ? () => onOpenItemPicker({ type: 'objective', id: obj.id, nodeId })
                : undefined
            }
          />
          <input
            className="quest-inspector-card-input"
            type="text"
            value={obj.target}
            onChange={(e) => onUpdate('target', e.target.value)}
            placeholder="minecraft:diamond"
          />
          <input
            className="quest-inspector-card-input-number"
            type="number"
            value={obj.target_count}
            onChange={(e) => onUpdate('target_count', parseInt(e.target.value) || 1)}
            min={1}
          />
        </div>
        <label className="quest-inspector-checkbox">
          <input
            type="checkbox"
            checked={obj.required}
            onChange={(e) => onUpdate('required', e.target.checked)}
          />
          <span>Required</span>
        </label>
        <div className="quest-inspector-card-toggle">
          <button
            className="quest-inspector-ghost-btn"
            onClick={() => setShowAdvanced(!showAdvanced)}
          >
            {showAdvanced ? '▾' : '▸'} Advanced
          </button>
        </div>
        {showAdvanced && (
          <div className="quest-inspector-card-advanced">
            {obj.objective_type === 'fluid' && (
              <div className="quest-inspector-card-advanced-row">
                <div className="quest-inspector-card-advanced-field">
                  <label>Fluid ID</label>
                  <input
                    className="quest-inspector-card-input"
                    type="text"
                    value={obj.fluid_id}
                    onChange={(e) => onUpdate('fluid_id', e.target.value)}
                  />
                </div>
                <div className="quest-inspector-card-advanced-field">
                  <label>Amount</label>
                  <input
                    className="quest-inspector-card-input-number"
                    type="number"
                    value={obj.fluid_amount}
                    onChange={(e) => onUpdate('fluid_amount', parseFloat(e.target.value) || 0)}
                  />
                </div>
              </div>
            )}
            {obj.objective_type === 'energy' && (
              <div className="quest-inspector-card-advanced-row">
                <div className="quest-inspector-card-advanced-field">
                  <label>Amount</label>
                  <input
                    className="quest-inspector-card-input-number"
                    type="number"
                    value={obj.energy_amount}
                    onChange={(e) => onUpdate('energy_amount', parseFloat(e.target.value) || 0)}
                  />
                </div>
                <div className="quest-inspector-card-advanced-field">
                  <label>Unit</label>
                  <input
                    className="quest-inspector-card-input"
                    type="text"
                    value={obj.energy_unit}
                    onChange={(e) => onUpdate('energy_unit', e.target.value)}
                  />
                </div>
              </div>
            )}
            {obj.objective_type === 'xp' && (
              <div className="quest-inspector-card-advanced-row">
                <div className="quest-inspector-card-advanced-field">
                  <label>XP Points</label>
                  <input
                    className="quest-inspector-card-input-number"
                    type="number"
                    value={obj.xp_points}
                    onChange={(e) => onUpdate('xp_points', parseInt(e.target.value) || 0)}
                  />
                </div>
                <div className="quest-inspector-card-advanced-field">
                  <label>Levels</label>
                  <input
                    className="quest-inspector-card-input-number"
                    type="number"
                    value={obj.xp_levels}
                    onChange={(e) => onUpdate('xp_levels', parseInt(e.target.value) || 0)}
                  />
                </div>
              </div>
            )}
            {obj.objective_type === 'command' && (
              <div className="quest-inspector-card-advanced-field">
                <label>Command</label>
                <input
                  className="quest-inspector-card-input"
                  type="text"
                  value={obj.command}
                  onChange={(e) => onUpdate('command', e.target.value)}
                />
              </div>
            )}
            {obj.objective_type === 'stat' && (
              <div className="quest-inspector-card-advanced-row">
                <div className="quest-inspector-card-advanced-field">
                  <label>Stat</label>
                  <input
                    className="quest-inspector-card-input"
                    type="text"
                    value={obj.stat_name}
                    onChange={(e) => onUpdate('stat_name', e.target.value)}
                  />
                </div>
                <div className="quest-inspector-card-advanced-field">
                  <label>Value</label>
                  <input
                    className="quest-inspector-card-input-number"
                    type="number"
                    value={obj.stat_value}
                    onChange={(e) => onUpdate('stat_value', parseInt(e.target.value) || 0)}
                  />
                </div>
              </div>
            )}
            {obj.objective_type === 'location_visit' && (
              <div className="quest-inspector-card-advanced-row">
                <div className="quest-inspector-card-advanced-field">
                  <label>X</label>
                  <input
                    className="quest-inspector-card-input-number"
                    type="number"
                    value={obj.x}
                    onChange={(e) => onUpdate('x', parseFloat(e.target.value) || 0)}
                  />
                </div>
                <div className="quest-inspector-card-advanced-field">
                  <label>Y</label>
                  <input
                    className="quest-inspector-card-input-number"
                    type="number"
                    value={obj.y}
                    onChange={(e) => onUpdate('y', parseFloat(e.target.value) || 0)}
                  />
                </div>
                <div className="quest-inspector-card-advanced-field">
                  <label>Z</label>
                  <input
                    className="quest-inspector-card-input-number"
                    type="number"
                    value={obj.z}
                    onChange={(e) => onUpdate('z', parseFloat(e.target.value) || 0)}
                  />
                </div>
              </div>
            )}
            {obj.objective_type === 'location_visit' && (
              <div className="quest-inspector-card-advanced-row">
                <div className="quest-inspector-card-advanced-field">
                  <label>Dimension</label>
                  <input
                    className="quest-inspector-card-input"
                    type="text"
                    value={obj.dimension}
                    onChange={(e) => onUpdate('dimension', e.target.value)}
                  />
                </div>
                <div className="quest-inspector-card-advanced-field">
                  <label>Radius</label>
                  <input
                    className="quest-inspector-card-input-number"
                    type="number"
                    value={obj.radius}
                    onChange={(e) => onUpdate('radius', parseFloat(e.target.value) || 0)}
                  />
                </div>
              </div>
            )}
            {obj.objective_type === 'entity_kill' && (
              <div className="quest-inspector-card-advanced-field">
                <label>Entity</label>
                <input
                  className="quest-inspector-card-input"
                  type="text"
                  value={obj.target}
                  onChange={(e) => onUpdate('target', e.target.value)}
                />
              </div>
            )}
            {obj.objective_type === 'advancement' && (
              <div className="quest-inspector-card-advanced-field">
                <label>Advancement ID</label>
                <input
                  className="quest-inspector-card-input"
                  type="text"
                  value={obj.advancement_id}
                  onChange={(e) => onUpdate('advancement_id', e.target.value)}
                />
              </div>
            )}
            {['item_acquisition', 'item_retrieval', 'item_crafting', 'block_break', 'block_place'].includes(obj.objective_type) && (
              <div className="quest-inspector-checkboxes">
                <label className="quest-inspector-checkbox">
                  <input
                    type="checkbox"
                    checked={obj.consume_items}
                    onChange={(e) => onUpdate('consume_items', e.target.checked)}
                  />
                  <span>Consume</span>
                </label>
                <label className="quest-inspector-checkbox">
                  <input
                    type="checkbox"
                    checked={obj.match_nbt}
                    onChange={(e) => onUpdate('match_nbt', e.target.checked)}
                  />
                  <span>Match NBT</span>
                </label>
                <label className="quest-inspector-checkbox">
                  <input
                    type="checkbox"
                    checked={obj.ignore_nbt}
                    onChange={(e) => onUpdate('ignore_nbt', e.target.checked)}
                  />
                  <span>Ignore NBT</span>
                </label>
              </div>
            )}
            {obj.objective_type === 'game_stage' && (
              <div className="quest-inspector-card-advanced-field">
                <label>Stage</label>
                <input
                  className="quest-inspector-card-input"
                  type="text"
                  value={obj.advancement_id}
                  onChange={(e) => onUpdate('advancement_id', e.target.value)}
                  placeholder="e.g. stage_name"
                />
              </div>
            )}
            {obj.objective_type === 'observation' && (
              <div className="quest-inspector-card-advanced-field">
                <label>Range</label>
                <input
                  className="quest-inspector-card-input-number"
                  type="number"
                  value={obj.observation_range}
                  onChange={(e) => onUpdate('observation_range', parseFloat(e.target.value) || 0)}
                />
              </div>
            )}
            {obj.objective_type === 'visit_biome' && (
              <div className="quest-inspector-card-advanced-field">
                <label>Biome</label>
                <input
                  className="quest-inspector-card-input"
                  type="text"
                  value={obj.biome_id}
                  onChange={(e) => onUpdate('biome_id', e.target.value)}
                />
              </div>
            )}
            {obj.objective_type === 'find_structure' && (
              <div className="quest-inspector-card-advanced-field">
                <label>Structure</label>
                <input
                  className="quest-inspector-card-input"
                  type="text"
                  value={obj.structure_id}
                  onChange={(e) => onUpdate('structure_id', e.target.value)}
                />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function RewardCard({
  rew,
  index,
  nodeId,
  textureIndex,
  onRemove,
  onUpdate,
  onOpenItemPicker,
}: {
  rew: QuestRewardData
  index: number
  nodeId: string
  textureIndex: Record<string, string>
  onRemove: () => void
  onUpdate: (field: string, value: unknown) => void
  onOpenItemPicker?: (target: { type: 'objective' | 'reward'; id: string; nodeId: string }) => void
}) {
  const [showAdvanced, setShowAdvanced] = useState(false)
  const iconUrl = questIconUrl(rew.item_id || rew.items[0] || '', textureIndex)

  return (
    <div className="quest-inspector-card">
      <div className="quest-inspector-card-header">
        <div className="quest-inspector-card-left">
          <span className="quest-inspector-card-index">+#{index + 1}</span>
          <select
            className="quest-inspector-card-type-select"
            value={rew.reward_type}
            onChange={(e) => onUpdate('reward_type', e.target.value)}
          >
            {REWARD_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>
        <button className="quest-inspector-card-remove" onClick={onRemove} title="Remove reward"><XIcon size={12} /></button>
      </div>
      <div className="quest-inspector-card-body">
        <div className="quest-inspector-slot-row">
          <ItemSlot
            iconUrl={iconUrl}
            textureKey={resolveIconKey(rew.item_id || rew.items[0] || '')}
            iconNode={rew.smart_filter ? (
              <SmartFilterIcon dsl={rew.smart_filter} textureIndex={textureIndex} fallback="?" size={32} />
            ) : undefined}
            label={rew.item_id || rew.items[0] || 'r'}
            onPickerClick={
              onOpenItemPicker
                ? () => onOpenItemPicker({ type: 'reward', id: rew.id, nodeId })
                : undefined
            }
          />
          <input
            className="quest-inspector-card-input"
            type="text"
            value={rew.item_id || rew.items[0] || ''}
            onChange={(e) => onUpdate('item_id', e.target.value)}
            placeholder="minecraft:diamond"
          />
          <input
            className="quest-inspector-card-input-number"
            type="number"
            value={rew.item_count}
            onChange={(e) => onUpdate('item_count', parseInt(e.target.value) || 1)}
            min={1}
          />
          <input
            className="quest-inspector-card-input-number"
            type="number"
            step="0.1"
            value={rew.weight}
            onChange={(e) => onUpdate('weight', parseFloat(e.target.value) || 1.0)}
            style={{ width: 50 }}
          />
        </div>
        <div className="quest-inspector-card-toggle">
          <button
            className="quest-inspector-ghost-btn"
            onClick={() => setShowAdvanced(!showAdvanced)}
          >
            {showAdvanced ? '▾' : '▸'} Advanced
          </button>
        </div>
        {showAdvanced && (
          <div className="quest-inspector-card-advanced">
            {['experience', 'xp_levels'].includes(rew.reward_type) && (
              <div className="quest-inspector-card-advanced-row">
                <div className="quest-inspector-card-advanced-field">
                  <label>XP Amount</label>
                  <input
                    className="quest-inspector-card-input-number"
                    type="number"
                    value={rew.xp_amount}
                    onChange={(e) => onUpdate('xp_amount', parseInt(e.target.value) || 0)}
                  />
                </div>
                <div className="quest-inspector-card-advanced-field">
                  <label>Levels</label>
                  <input
                    className="quest-inspector-card-input-number"
                    type="number"
                    value={rew.xp_levels}
                    onChange={(e) => onUpdate('xp_levels', parseInt(e.target.value) || 0)}
                  />
                </div>
              </div>
            )}
            {rew.reward_type === 'command' && (
              <div className="quest-inspector-card-advanced-field">
                <label>Command</label>
                <input
                  className="quest-inspector-card-input"
                  type="text"
                  value={rew.command}
                  onChange={(e) => onUpdate('command', e.target.value)}
                />
              </div>
            )}
            {rew.reward_type === 'loot_table' && (
              <div className="quest-inspector-card-advanced-field">
                <label>Loot Table</label>
                <input
                  className="quest-inspector-card-input"
                  type="text"
                  value={rew.loot_table}
                  onChange={(e) => onUpdate('loot_table', e.target.value)}
                />
              </div>
            )}
            {rew.reward_type === 'game_stage' && (
              <div className="quest-inspector-card-advanced-field">
                <label>Stage</label>
                <input
                  className="quest-inspector-card-input"
                  type="text"
                  value={rew.game_stage}
                  onChange={(e) => onUpdate('game_stage', e.target.value)}
                />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export function QuestInspector({
  node,
  textureIndex,
  onUpdateNode,
  onDeleteNode,
  onAddObjective,
  onRemoveObjective,
  onUpdateObjective,
  onAddReward,
  onRemoveReward,
  onUpdateReward,
  openIconPicker,
  onOpenItemPicker,
  onClose,
}: QuestInspectorProps) {
  const [showAdvanced, setShowAdvanced] = useState(false)

  const iconUrl = questIconUrl(node.icon, textureIndex)

  return (
    <div className="quest-inspector-overlay" onClick={onClose}>
      <div className="quest-inspector-panel" onClick={(e) => e.stopPropagation()}>
        {/* ── Header ── */}
        <div className="quest-inspector-header">
          <div className="quest-inspector-icon">
            {iconUrl ? (
              <AnimatedSprite url={iconUrl} textureKey={resolveIconKey(node.icon)} width={40} height={40} alt="" />
            ) : (
              <span className="quest-inspector-icon-fallback">?</span>
            )}
          </div>
          <div className="quest-inspector-title-area">
            <input
              className="quest-inspector-title-input"
              value={node.label}
              onChange={(e) => onUpdateNode(node.id, { label: e.target.value })}
              placeholder="Quest Title"
            />
            <input
              className="quest-inspector-subtitle-input"
              value={node.subtitle || ''}
              onChange={(e) => onUpdateNode(node.id, { subtitle: e.target.value })}
              placeholder="Subtitle"
            />
            <div className="quest-inspector-id-row">
              <span className="quest-inspector-id-tag">{node.id}</span>
              <select
                className="quest-inspector-shape-select"
                value={node.shape}
                onChange={(e) => onUpdateNode(node.id, { shape: e.target.value })}
              >
                {SHAPES.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>
          </div>
          <button className="quest-inspector-close-btn" onClick={onClose} aria-label="Close inspector"><XIcon size={14} /></button>
        </div>

        {/* ── Body ── */}
        <div className="quest-inspector-body">
          {/* Description */}
          <div className="quest-inspector-section">
            <div className="quest-inspector-section-header">
              <span className="quest-inspector-section-title">
                
                Description
              </span>
            </div>
            <textarea
              className="quest-inspector-description"
              value={node.description}
              onChange={(e) => onUpdateNode(node.id, { description: e.target.value })}
              placeholder="Quest description..."
              rows={3}
            />
          </div>

          {/* Tasks */}
          <div className="quest-inspector-section">
            <div className="quest-inspector-section-header">
              <span className="quest-inspector-section-title">
                
                Tasks
                <span className="quest-inspector-section-count">({node.objectives.length})</span>
              </span>
              <button
                className="quest-inspector-add-btn"
                onClick={() => onAddObjective(node.id)}
                title="Add Task"
              >
                +
              </button>
            </div>
            {node.objectives.length === 0 && (
              <div className="quest-inspector-empty">No tasks defined</div>
            )}
            {node.objectives.map((obj, idx) => (
              <ObjectiveCard
                key={obj.id}
                obj={obj}
                index={idx}
                nodeId={node.id}
                textureIndex={textureIndex}
                onRemove={() => onRemoveObjective(node.id, obj.id)}
                onUpdate={(field, value) => onUpdateObjective(node.id, obj.id, field, value)}
                onOpenItemPicker={onOpenItemPicker}
              />
            ))}
          </div>

          {/* Rewards */}
          <div className="quest-inspector-section">
            <div className="quest-inspector-section-header">
              <span className="quest-inspector-section-title">
                
                Rewards
                <span className="quest-inspector-section-count">({node.rewards.length})</span>
              </span>
              <button
                className="quest-inspector-add-btn"
                onClick={() => onAddReward(node.id)}
                title="Add Reward"
              >
                +
              </button>
            </div>
            {node.rewards.length === 0 && (
              <div className="quest-inspector-empty">No rewards</div>
            )}
            {node.rewards.map((rew, idx) => (
              <RewardCard
                key={rew.id}
                rew={rew}
                index={idx}
                nodeId={node.id}
                textureIndex={textureIndex}
                onRemove={() => onRemoveReward(node.id, rew.id)}
                onUpdate={(field, value) => onUpdateReward(node.id, rew.id, field, value)}
                onOpenItemPicker={onOpenItemPicker}
              />
            ))}
          </div>

          {/* Advanced */}
          <div className="quest-inspector-section">
            <div className="quest-inspector-section-header">
              <span className="quest-inspector-section-title">
                
                Properties
              </span>
              <button
                className="quest-inspector-add-btn"
                onClick={() => setShowAdvanced(!showAdvanced)}
                style={{ fontSize: 10, padding: '0 8px' }}
              >
                {showAdvanced ? '▾ Hide' : '▸ Show'}
              </button>
            </div>
            {showAdvanced && (
              <>
                <div className="quest-inspector-slot-row" style={{ gap: 8 }}>
                  <div className="quest-inspector-card-advanced-field" style={{ flex: 1 }}>
                    <label>Icon</label>
                    <div className="quest-inspector-slot-row" style={{ gap: 6 }}>
                      <ItemSlot iconUrl={iconUrl} textureKey={resolveIconKey(node.icon)} label="I" size={32} />
                      <button
                        className="quest-inspector-card-input"
                        style={{ flex: 1, cursor: 'pointer', textAlign: 'left' }}
                        onClick={() => openIconPicker({ type: 'quest', nodeId: node.id })}
                      >
                        Change Icon
                      </button>
                    </div>
                  </div>
                  <div className="quest-inspector-card-advanced-field" style={{ flex: 1 }}>
                    <label>Color</label>
                    <input
                      className="quest-inspector-card-input"
                      type="color"
                      value={node.color || '#60a5fa'}
                      onChange={(e) => onUpdateNode(node.id, { color: e.target.value })}
                      style={{ height: 30, padding: 2, cursor: 'pointer' }}
                    />
                  </div>
                </div>
                <div className="quest-inspector-card-advanced-row">
                  <div className="quest-inspector-card-advanced-field">
                    <label>Visibility</label>
                    <select
                      className="quest-inspector-card-type-select"
                      value={node.visibility}
                      onChange={(e) => onUpdateNode(node.id, { visibility: e.target.value })}
                      style={{ width: '100%' }}
                    >
                      {VISIBILITY_OPTIONS.map((v) => (
                        <option key={v.value} value={v.value}>{v.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="quest-inspector-card-advanced-field">
                    <label>Progression</label>
                    <select
                      className="quest-inspector-card-type-select"
                      value={node.progression_mode}
                      onChange={(e) => onUpdateNode(node.id, { progression_mode: e.target.value })}
                      style={{ width: '100%' }}
                    >
                      {PROGRESSION_MODES.map((p) => (
                        <option key={p.value} value={p.value}>{p.label}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="quest-inspector-card-advanced-row">
                  <div className="quest-inspector-card-advanced-field">
                    <label>Min Width</label>
                    <input
                      className="quest-inspector-card-input-number"
                      type="number"
                      value={node.min_window_width}
                      onChange={(e) => onUpdateNode(node.id, { min_window_width: parseInt(e.target.value) || 0 })}
                      style={{ width: '100%' }}
                    />
                  </div>
                  <div className="quest-inspector-card-advanced-field">
                    <label>Icon Scale</label>
                    <input
                      className="quest-inspector-card-input-number"
                      type="number"
                      step="0.1"
                      min="0.1"
                      max="2.0"
                      value={node.icon_scaling}
                      onChange={(e) => onUpdateNode(node.id, { icon_scaling: parseFloat(e.target.value) || 1.0 })}
                      style={{ width: '100%' }}
                    />
                  </div>
                </div>
                <div className="quest-inspector-card-advanced-field">
                  <label>Tags</label>
                  <input
                    className="quest-inspector-card-input"
                    type="text"
                    value={node.tags.join(', ')}
                    onChange={(e) => onUpdateNode(node.id, { tags: e.target.value.split(',').map((t) => t.trim()).filter(Boolean) })}
                    placeholder="tag1, tag2"
                  />
                </div>
                <div className="quest-inspector-checkboxes">
                  <label className="quest-inspector-checkbox">
                    <input
                      type="checkbox"
                      checked={node.optional}
                      onChange={(e) => onUpdateNode(node.id, { optional: e.target.checked })}
                    />
                    <span>Optional</span>
                  </label>
                  <label className="quest-inspector-checkbox">
                    <input
                      type="checkbox"
                      checked={node.can_be_repeatable}
                      onChange={(e) => onUpdateNode(node.id, { can_be_repeatable: e.target.checked })}
                    />
                    <span>Repeatable</span>
                  </label>
                  <label className="quest-inspector-checkbox">
                    <input
                      type="checkbox"
                      checked={node.sequential_tasks}
                      onChange={(e) => onUpdateNode(node.id, { sequential_tasks: e.target.checked })}
                    />
                    <span>Sequential</span>
                  </label>
                  <label className="quest-inspector-checkbox">
                    <input
                      type="checkbox"
                      checked={node.silently_complete}
                      onChange={(e) => onUpdateNode(node.id, { silently_complete: e.target.checked })}
                    />
                    <span>Silent</span>
                  </label>
                  <label className="quest-inspector-checkbox">
                    <input
                      type="checkbox"
                      checked={node.disable_completion_toast}
                      onChange={(e) => onUpdateNode(node.id, { disable_completion_toast: e.target.checked })}
                    />
                    <span>No Toast</span>
                  </label>
                  <label className="quest-inspector-checkbox">
                    <input
                      type="checkbox"
                      checked={node.disable_reward}
                      onChange={(e) => onUpdateNode(node.id, { disable_reward: e.target.checked })}
                    />
                    <span>No Reward</span>
                  </label>
                  <label className="quest-inspector-checkbox">
                    <input
                      type="checkbox"
                      checked={node.hide_dependency_lines}
                      onChange={(e) => onUpdateNode(node.id, { hide_dependency_lines: e.target.checked })}
                    />
                    <span>Hide Dep Lines</span>
                  </label>
                  <label className="quest-inspector-checkbox">
                    <input
                      type="checkbox"
                      checked={node.hide_dependent_lines}
                      onChange={(e) => onUpdateNode(node.id, { hide_dependent_lines: e.target.checked })}
                    />
                    <span>Hide Depdnt Lines</span>
                  </label>
                  <label className="quest-inspector-checkbox">
                    <input
                      type="checkbox"
                      checked={node.ignore_reward_blocking}
                      onChange={(e) => onUpdateNode(node.id, { ignore_reward_blocking: e.target.checked })}
                    />
                    <span>Ignore Blocking</span>
                  </label>
                  <label className="quest-inspector-checkbox">
                    <input
                      type="checkbox"
                      checked={node.disable_jei_recipe}
                      onChange={(e) => onUpdateNode(node.id, { disable_jei_recipe: e.target.checked })}
                    />
                    <span>Hide JEI</span>
                  </label>
                  <label className="quest-inspector-checkbox">
                    <input
                      type="checkbox"
                      checked={node.hide_details_until_startable}
                      onChange={(e) => onUpdateNode(node.id, { hide_details_until_startable: e.target.checked })}
                    />
                    <span>Hide Details</span>
                  </label>
                  <label className="quest-inspector-checkbox">
                    <input
                      type="checkbox"
                      checked={node.hide_text_until_completed}
                      onChange={(e) => onUpdateNode(node.id, { hide_text_until_completed: e.target.checked })}
                    />
                    <span>Hide Text</span>
                  </label>
                  <label className="quest-inspector-checkbox">
                    <input
                      type="checkbox"
                      checked={node.invisible_until_completed}
                      onChange={(e) => onUpdateNode(node.id, { invisible_until_completed: e.target.checked })}
                    />
                    <span>Invisible</span>
                  </label>
                </div>
              </>
            )}
          </div>
        </div>

        {/* ── Footer ── */}
        <div className="quest-inspector-footer">
          <button
            className="quest-inspector-footer-btn delete"
            onClick={() => { onDeleteNode(node.id); onClose() }}
          >
            Delete
          </button>
          <button className="quest-inspector-footer-btn save" onClick={onClose}>
            Save Changes
          </button>
          <button className="quest-inspector-footer-btn close" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

export default QuestInspector
