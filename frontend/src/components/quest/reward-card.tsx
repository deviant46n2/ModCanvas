import { useState } from 'react'
import type { QuestRewardData, RewardTableData } from '../../services/api'
import { questIconUrl, resolveIconKey } from './questIcons'
import { getFallbackIcon } from './QuestTileTypes'
import { ArrowDownIcon, ArrowUpIcon, PackageIcon, XIcon } from '../ui/icons'
import { isTexturePending } from '../../services/texture-loader'
import { QuestIcon } from './QuestIcon'
import { AnimatedSprite } from './AnimatedSprite'
import { SmartFilterIcon } from './SmartFilterIcon'
import { REWARD_TYPES } from './quest-form-constants'
export function RewardCard({
  rew,
  index,
  textureIndex,
  onRemove,
  onUpdate,
  onOpenItemPicker,
  rewardTables,
  onMoveUp,
  onMoveDown,
}: {
  rew: QuestRewardData
  index: number
  textureIndex: Record<string, string>
  onRemove: () => void
  onUpdate: (field: string, value: unknown) => void
  onOpenItemPicker?: () => void
  rewardTables?: RewardTableData[]
  onMoveUp?: () => void
  onMoveDown?: () => void
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
        <div className="quest-detail-card-reorder">
          <button className="quest-detail-card-reorder-btn" onClick={onMoveUp} disabled={!onMoveUp} title="Move up"><ArrowUpIcon size={12} /></button>
          <button className="quest-detail-card-reorder-btn" onClick={onMoveDown} disabled={!onMoveDown} title="Move down"><ArrowDownIcon size={12} /></button>
        </div>
        <button className="quest-detail-card-remove" onClick={onRemove} title="Remove"><XIcon size={12} /></button>
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
              <button className="quest-detail-small-btn" onClick={onOpenItemPicker} title="Pick item" style={onOpenItemPicker ? {} : { display: 'none' }}><PackageIcon size={12} /></button>
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
