import { useState } from 'react'
import type { QuestNodeData } from '../../services/api'
import { questIconUrl } from './questIcons'
import { resolveIconKey } from './questIcons'
import { isTexturePending } from '../../services/texture-loader'
import { QuestIcon } from './QuestIcon'
import { AnimatedSprite } from './AnimatedSprite'
import { SmartFilterIcon } from './SmartFilterIcon'
import {
  SHAPES,
  VISIBILITY_OPTIONS,
  PROGRESSION_MODES,
  DEPENDENCY_REQUIREMENTS,
  questScaleFromSize,
  questSizeToPixels,
  setQuestScale,
} from './quest-form-constants'
import { ObjectiveCard, RewardCard } from './quest-form-sections'
import type { ProgressState } from '../../core/quest/progress'
import type { RewardTableData } from '../../services/api'

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
  onOpenItemPicker?: (target: { type: 'objective' | 'reward'; id: string; nodeId: string }) => void
  onClose: () => void
  simProgress?: ProgressState
  onSetQuestProgress?: (questId: string, status: 'started' | 'complete' | null) => void
  quests?: Array<{ id: string; label: string }>
  rewardTables?: RewardTableData[]
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
  onOpenItemPicker,
  onClose,
  simProgress,
  onSetQuestProgress,
  quests,
  rewardTables,
}: QuestDetailModalProps) {
  const [showAdvanced, setShowAdvanced] = useState(false)

  const iconUrl = questIconUrl(node.icon, textureIndex)
  const iconPending = isTexturePending(textureIndex, resolveIconKey(node.icon))

  return (
    <div className="quest-detail-overlay" onClick={onClose}>
      <div className="quest-detail-modal" onClick={(e) => e.stopPropagation()}>
        <div className="quest-detail-header">
          <div className="quest-detail-icon" style={{ backgroundColor: node.color || 'var(--color-accent)' }}>
            {!node.icon && node.objectives?.[0]?.smart_filter ? (
              <SmartFilterIcon
                dsl={node.objectives[0].smart_filter}
                textureIndex={textureIndex}
                fallback="?"
                size={28}
              />
            ) : iconUrl ? <AnimatedSprite url={iconUrl} textureKey={resolveIconKey(node.icon)} width={28} height={28} alt="" /> : iconPending ? (
              <QuestIcon pending url={null} fallback="" size={28} />
            ) : (
              <span className="quest-detail-icon-fallback">?</span>
            )}
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
          {node.node_type === 'quest_link' && (
            <section className="quest-detail-section quest-link-section">
              <div className="quest-detail-section-header">
                <span className="quest-detail-section-icon">🔗</span>
                <span>Quest Link</span>
              </div>
              <div className="quest-detail-field">
                <label>Linked Quest</label>
                <select
                  value={node.link_target || ''}
                  onChange={(e) => onUpdateNode(node.id, { link_target: e.target.value })}
                >
                  <option value="">— Unlinked —</option>
                  {(quests || [])
                    .filter(q => q.id !== node.id)
                    .map(q => (
                      <option key={q.id} value={q.id}>{q.label}</option>
                    ))}
                </select>
              </div>
              <div className="quest-detail-empty">A link references a quest in another chapter; the icon and visibility follow the target quest in-game.</div>
            </section>
          )}

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
                onOpenItemPicker={onOpenItemPicker ? () => onOpenItemPicker!({ type: 'objective', id: obj.id, nodeId: node.id }) : undefined}
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
                onOpenItemPicker={onOpenItemPicker ? () => onOpenItemPicker!({ type: 'reward', id: rew.id, nodeId: node.id }) : undefined}
                rewardTables={rewardTables}
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
                  <div className="quest-detail-field quest-detail-field-scale">
                    <label>Scale</label>
                    <div className="quest-detail-scale-control">
                      <input
                        type="range"
                        min="0.5"
                        max="4"
                        step="0.1"
                        value={questScaleFromSize(node.size)}
                        onChange={(e) => onUpdateNode(node.id, { size: setQuestScale(parseFloat(e.target.value)) })}
                      />
                      <span className="quest-detail-scale-value">
                        {questScaleFromSize(node.size)}x · {questSizeToPixels(node.size).width}×{questSizeToPixels(node.size).height}px
                      </span>
                    </div>
                  </div>
                </div>
                <div className="quest-detail-field-row">
                  <div className="quest-detail-field">
                    <label>Width</label>
                    <input type="number" min="12" value={node.size?.width || 24} onChange={(e) => onUpdateNode(node.id, { size: { width: parseInt(e.target.value) || 24, height: node.size?.height || 24 } })} />
                  </div>
                  <div className="quest-detail-field">
                    <label>Height</label>
                    <input type="number" min="12" value={node.size?.height || 24} onChange={(e) => onUpdateNode(node.id, { size: { width: node.size?.width || 24, height: parseInt(e.target.value) || 24 } })} />
                  </div>
                  <div className="quest-detail-field">
                    <label>Icon</label>
                    <div className="quest-detail-icon-select">
                      <div className="quest-detail-icon-preview">
                        {iconUrl ? <AnimatedSprite url={iconUrl} textureKey={resolveIconKey(node.icon)} width={28} height={28} alt="" /> : iconPending ? (
                          <QuestIcon pending url={null} fallback="" size={28} />
                        ) : (
                          <span>📜</span>
                        )}
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
                  <div className="quest-detail-field">
                    <label>Icon Scale</label>
                    <input
                      type="number"
                      step="0.1"
                      min="0.1"
                      max="2.0"
                      value={node.icon_scaling ?? 1.0}
                      onChange={(e) => onUpdateNode(node.id, { icon_scaling: parseFloat(e.target.value) || 1.0 })}
                    />
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
                <div className="quest-detail-field-row">
                  <div className="quest-detail-field">
                    <label>Dependency Requirement</label>
                    <select value={node.dependency_requirement || 'all_completed'} onChange={(e) => onUpdateNode(node.id, { dependency_requirement: e.target.value })}>
                      {DEPENDENCY_REQUIREMENTS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
                    </select>
                  </div>
                  <div className="quest-detail-field">
                    <label>Min Required Deps</label>
                    <input type="number" min="0" value={node.min_required_dependencies} onChange={(e) => onUpdateNode(node.id, { min_required_dependencies: parseInt(e.target.value) || 0 })} />
                  </div>
                  <div className="quest-detail-field">
                    <label>Max Completable Dependents</label>
                    <input type="number" min="0" value={node.max_completable_dependents} onChange={(e) => onUpdateNode(node.id, { max_completable_dependents: parseInt(e.target.value) || 0 })} />
                  </div>
                </div>
                <div className="quest-detail-field-row">
                  <div className="quest-detail-field">
                    <label>Repeat Cooldown (s)</label>
                    <input type="number" min="0" value={node.repeat_cooldown} onChange={(e) => onUpdateNode(node.id, { repeat_cooldown: parseInt(e.target.value) || 0 })} />
                  </div>
                  <div className="quest-detail-field quest-detail-field-guide">
                    <label>Guide Page</label>
                    <input type="text" value={node.guide_page || ''} onChange={(e) => onUpdateNode(node.id, { guide_page: e.target.value })} placeholder="e.g. quests:guide/my_guide" />
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
                    <input type="checkbox" checked={node.hide_lock_icon} onChange={(e) => onUpdateNode(node.id, { hide_lock_icon: e.target.checked })} />
                    <span>Hide Lock Icon</span>
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
              </div>
            )}
          </section>
        </div>

        <div className="quest-detail-footer">
          <div className="quest-detail-footer-left">
            <button
              className="quest-detail-sim-btn"
              onClick={() => onSetQuestProgress?.(node.id, simProgress?.[node.id] === 'complete' ? null : 'complete')}
              title="Toggle this quest's completion in the progress simulation (Simulate mode)"
            >
              {simProgress?.[node.id] === 'complete' ? '↺ Reset' : '✓ Complete'}
            </button>
          </div>
          <div className="quest-detail-footer-right">
            <button className="quest-detail-delete-btn" onClick={() => { onDeleteNode(node.id); onClose() }}>Delete Quest</button>
            <button className="quest-detail-ghost-btn" onClick={onClose}>Cancel</button>
            <button className="quest-detail-save-btn" onClick={onClose}>Save</button>
          </div>
        </div>
      </div>
    </div>
  )
}