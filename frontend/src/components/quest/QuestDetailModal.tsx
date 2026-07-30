import { useState } from 'react'
import type { QuestNodeData, QuestObjectiveData, QuestRewardData } from '../../services/api'
import { questIconUrl } from './questIcons'

const SHAPES = [
  { value: 'default', label: 'Default' },
  { value: 'circle', label: 'Circle' },
  { value: 'square', label: 'Square' },
  { value: 'rounded_square', label: 'Rounded Square' },
  { value: 'diamond', label: 'Diamond' },
  { value: 'pentagon', label: 'Pentagon' },
  { value: 'hexagon', label: 'Hexagon' },
  { value: 'octagon', label: 'Octagon' },
  { value: 'heart', label: 'Heart' },
  { value: 'gear', label: 'Gear' },
]

const OBJECTIVE_TYPES = [
  { value: 'item_acquisition', label: 'Item Detection' },
  { value: 'item_retrieval', label: 'Item Retrieval' },
  { value: 'item_crafting', label: 'Item Crafting' },
  { value: 'block_break', label: 'Block Breaking' },
  { value: 'block_place', label: 'Block Placing' },
  { value: 'entity_kill', label: 'Entity Kill' },
  { value: 'location_visit', label: 'Location Visit' },
  { value: 'advancement', label: 'Advancement' },
  { value: 'observation', label: 'Observation' },
  { value: 'visit_biome', label: 'Visit Biome' },
  { value: 'find_structure', label: 'Find Structure' },
  { value: 'fluid', label: 'Fluid Detection' },
  { value: 'energy', label: 'Energy Detection' },
  { value: 'xp', label: 'Experience' },
  { value: 'stat', label: 'Statistics' },
  { value: 'command', label: 'Command' },
  { value: 'game_stage', label: 'Game Stage' },
  { value: 'checkmark', label: 'Checkmark' },
  { value: 'custom', label: 'Custom' },
]

const REWARD_TYPES = [
  { value: 'item', label: 'Item Reward' },
  { value: 'choice', label: 'Choice Reward' },
  { value: 'item_weighted', label: 'Weighted Item' },
  { value: 'random', label: 'Random Reward' },
  { value: 'all_table', label: 'All Table Reward' },
  { value: 'loot_table', label: 'Loot Reward' },
  { value: 'experience', label: 'XP Reward' },
  { value: 'xp_levels', label: 'XP Levels Reward' },
  { value: 'command', label: 'Command Reward' },
  { value: 'advancement', label: 'Advancement Reward' },
  { value: 'toast', label: 'Toast Notification' },
  { value: 'unlock', label: 'Stage Unlock' },
  { value: 'game_stage', label: 'Game Stage' },
  { value: 'custom', label: 'Custom' },
]

const VISIBILITY_OPTIONS = [
  { value: 'normal', label: 'Normal' },
  { value: 'always_visible', label: 'Always Visible' },
  { value: 'never_visible', label: 'Never Visible' },
  { value: 'when_dependencies_complete', label: 'When Deps Complete' },
  { value: 'when_quest_complete', label: 'When Quest Complete' },
  { value: 'when_all_complete', label: 'When All Complete' },
]

const PROGRESSION_MODES = [
  { value: 'default', label: 'Inherit from Chapter' },
  { value: 'linear', label: 'Linear' },
  { value: 'flexible', label: 'Flexible' },
]

interface QuestDetailModalProps {
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
  onClose: () => void
}

export function QuestDetailModal({
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
  onClose,
}: QuestDetailModalProps) {
  const [showAdvanced, setShowAdvanced] = useState(false)

  const iconUrl = questIconUrl(node.icon, textureIndex)

  return (
    <div className="quest-detail-overlay" onClick={onClose}>
      <div className="quest-detail-modal" onClick={(e) => e.stopPropagation()}>
        <div className="quest-detail-header">
          <div className="quest-detail-icon" style={{ backgroundColor: node.color || '#d4a843' }}>
            {iconUrl ? <img src={iconUrl} alt="" /> : <span className="quest-detail-icon-fallback">?</span>}
          </div>
          <div className="quest-detail-title-area">
            <input
              className="quest-detail-title-input"
              value={node.label}
              onChange={(e) => onUpdateNode(node.id, { label: e.target.value })}
              placeholder="Quest Title"
            />
            <input
              className="quest-detail-subtitle-input"
              value={node.subtitle || ''}
              onChange={(e) => onUpdateNode(node.id, { subtitle: e.target.value })}
              placeholder="Subtitle (optional)"
            />
          </div>
          <button className="quest-detail-close" onClick={onClose}>✕</button>
        </div>

        <div className="quest-detail-body">
          <section className="quest-detail-section">
            <div className="quest-detail-section-header">
              <span className="quest-detail-section-icon">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
              </span>
              <span>Description</span>
            </div>
            <textarea
              className="quest-detail-textarea"
              value={node.description}
              onChange={(e) => onUpdateNode(node.id, { description: e.target.value })}
              placeholder="Quest description..."
              rows={3}
            />
          </section>

          <section className="quest-detail-section">
            <div className="quest-detail-section-header">
              <span className="quest-detail-section-icon">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
              </span>
              <span>Tasks ({node.objectives.length})</span>
              <button className="quest-detail-add-btn" onClick={() => onAddObjective(node.id)} title="Add Task">+</button>
            </div>
            {node.objectives.length === 0 && <div className="quest-detail-empty">No tasks defined</div>}
            {node.objectives.map((obj, idx) => (
              <ObjectiveCard
                key={obj.id}
                obj={obj}
                index={idx}
                textureIndex={textureIndex}
                onRemove={() => onRemoveObjective(node.id, obj.id)}
                onUpdate={(field, value) => onUpdateObjective(node.id, obj.id, field, value)}
              />
            ))}
          </section>

          <section className="quest-detail-section">
            <div className="quest-detail-section-header">
              <span className="quest-detail-section-icon">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>
              </span>
              <span>Rewards ({node.rewards.length})</span>
              <button className="quest-detail-add-btn" onClick={() => onAddReward(node.id)} title="Add Reward">+</button>
            </div>
            {node.rewards.length === 0 && <div className="quest-detail-empty">No rewards</div>}
            {node.rewards.map((rew, idx) => (
              <RewardCard
                key={rew.id}
                rew={rew}
                index={idx}
                textureIndex={textureIndex}
                onRemove={() => onRemoveReward(node.id, rew.id)}
                onUpdate={(field, value) => onUpdateReward(node.id, rew.id, field, value)}
              />
            ))}
          </section>

          <section className="quest-detail-section">
            <div className="quest-detail-section-header">
              <span className="quest-detail-section-icon">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              </span>
              <span>Advanced</span>
              <button
                className={`quest-detail-toggle-btn ${showAdvanced ? 'open' : ''}`}
                onClick={() => setShowAdvanced(!showAdvanced)}
              >
                {showAdvanced ? '▾' : '▸'} {showAdvanced ? 'Hide' : 'Show'}
              </button>
            </div>
            {showAdvanced && (
              <div className="quest-detail-advanced">
                <div className="quest-detail-field-row">
                  <div className="quest-detail-field">
                    <label>Icon</label>
                    <div className="quest-detail-icon-select">
                      <div className="quest-detail-icon-preview">
                        {iconUrl ? <img src={iconUrl} alt="" /> : <span>📜</span>}
                      </div>
                      <button className="quest-detail-small-btn" onClick={() => openIconPicker({ type: 'quest', nodeId: node.id })}>Change</button>
                    </div>
                  </div>
                  <div className="quest-detail-field">
                    <label>Color</label>
                    <input type="color" value={node.color || '#60a5fa'} onChange={(e) => onUpdateNode(node.id, { color: e.target.value })} />
                  </div>
                </div>
                <div className="quest-detail-field-row">
                  <div className="quest-detail-field">
                    <label>Shape</label>
                    <select value={node.shape} onChange={(e) => onUpdateNode(node.id, { shape: e.target.value })}>
                      {SHAPES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                    </select>
                  </div>
                  <div className="quest-detail-field">
                    <label>Visibility</label>
                    <select value={node.visibility} onChange={(e) => onUpdateNode(node.id, { visibility: e.target.value })}>
                      {VISIBILITY_OPTIONS.map(v => <option key={v.value} value={v.value}>{v.label}</option>)}
                    </select>
                  </div>
                </div>
                <div className="quest-detail-field-row">
                  <div className="quest-detail-field">
                    <label>Progression</label>
                    <select value={node.progression_mode} onChange={(e) => onUpdateNode(node.id, { progression_mode: e.target.value })}>
                      {PROGRESSION_MODES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                    </select>
                  </div>
                  <div className="quest-detail-field">
                    <label>Min Width</label>
                    <input type="number" value={node.min_window_width} onChange={(e) => onUpdateNode(node.id, { min_window_width: parseInt(e.target.value) || 0 })} />
                  </div>
                </div>
                <div className="quest-detail-checkboxes">
                  <label className="quest-detail-checkbox">
                    <input type="checkbox" checked={node.optional} onChange={(e) => onUpdateNode(node.id, { optional: e.target.checked })} />
                    <span>Optional</span>
                  </label>
                  <label className="quest-detail-checkbox">
                    <input type="checkbox" checked={node.can_be_repeatable} onChange={(e) => onUpdateNode(node.id, { can_be_repeatable: e.target.checked })} />
                    <span>Repeatable</span>
                  </label>
                  <label className="quest-detail-checkbox">
                    <input type="checkbox" checked={node.hide_dependency_lines} onChange={(e) => onUpdateNode(node.id, { hide_dependency_lines: e.target.checked })} />
                    <span>Hide Dep Lines</span>
                  </label>
                  <label className="quest-detail-checkbox">
                    <input type="checkbox" checked={node.hide_dependent_lines} onChange={(e) => onUpdateNode(node.id, { hide_dependent_lines: e.target.checked })} />
                    <span>Hide Dependent Lines</span>
                  </label>
                  <label className="quest-detail-checkbox">
                    <input type="checkbox" checked={node.silently_complete} onChange={(e) => onUpdateNode(node.id, { silently_complete: e.target.checked })} />
                    <span>Silently Complete</span>
                  </label>
                  <label className="quest-detail-checkbox">
                    <input type="checkbox" checked={node.disable_completion_toast} onChange={(e) => onUpdateNode(node.id, { disable_completion_toast: e.target.checked })} />
                    <span>Disable Toast</span>
                  </label>
                  <label className="quest-detail-checkbox">
                    <input type="checkbox" checked={node.disable_reward} onChange={(e) => onUpdateNode(node.id, { disable_reward: e.target.checked })} />
                    <span>Disable Reward</span>
                  </label>
                  <label className="quest-detail-checkbox">
                    <input type="checkbox" checked={node.sequential_tasks} onChange={(e) => onUpdateNode(node.id, { sequential_tasks: e.target.checked })} />
                    <span>Sequential Tasks</span>
                  </label>
                  <label className="quest-detail-checkbox">
                    <input type="checkbox" checked={node.ignore_reward_blocking} onChange={(e) => onUpdateNode(node.id, { ignore_reward_blocking: e.target.checked })} />
                    <span>Ignore Reward Blocking</span>
                  </label>
                  <label className="quest-detail-checkbox">
                    <input type="checkbox" checked={node.disable_jei_recipe} onChange={(e) => onUpdateNode(node.id, { disable_jei_recipe: e.target.checked })} />
                    <span>Hide JEI Recipe</span>
                  </label>
                </div>
                <button className="quest-detail-delete-btn" onClick={() => { onDeleteNode(node.id); onClose() }}>Delete Quest</button>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}

function ObjectiveCard({
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

function RewardCard({
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
