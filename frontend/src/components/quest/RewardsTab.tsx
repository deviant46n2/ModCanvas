
import type { QuestRewardData, RewardTableData } from '../../services/api'
import {
  REWARD_TYPES,
  isItemReward,
} from './nodes'

interface RewardsTabProps {
  rewards: QuestRewardData[]
  onUpdate: (idx: number, field: string, value: unknown) => void
  onRemove: (idx: number) => void
  onAdd: () => void
  rewardTables?: RewardTableData[]
}

export function RewardsTab({ rewards, onUpdate, onRemove, onAdd, rewardTables }: RewardsTabProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div className="inspector-panel-section-title">Rewards ({rewards.length})</div>
      {rewards.map((rew, idx) => (
        <div key={rew.id} className="inspector-panel-card">
          <div className="inspector-panel-card-header">
            <span className="inspector-panel-card-index">#{idx + 1}</span>
            <button className="inspector-panel-card-remove" onClick={() => onRemove(idx)}>{'\u00D7'}</button>
          </div>
          <div className="inspector-panel-field" style={{ marginBottom: 6 }}>
            <label>Label</label>
            <input type="text" value={rew.label} onChange={(v) => onUpdate(idx, 'label', v.target.value)} />
          </div>
          <div className="inspector-panel-field" style={{ marginBottom: 6 }}>
            <label>Type</label>
            <select value={rew.reward_type} onChange={(v) => onUpdate(idx, 'reward_type', v.target.value)}>
              {REWARD_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          {isItemReward(rew.reward_type) && (
            <>
              <div className="inspector-panel-field" style={{ marginBottom: 6 }}>
                <label>Item ID / Tag</label>
                <input type="text" value={rew.item_id || (rew.items[0] || '')}
                  onChange={(v) => {
                    const val = v.target.value
                    onUpdate(idx, 'item_id', val)
                    onUpdate(idx, 'items', val ? [val] : [])
                  }}
                  placeholder="minecraft:diamond" />
              </div>
              <div className="inspector-panel-row">
                <div className="inspector-panel-field"><label>Count</label><input type="number" value={rew.item_count} onChange={(v) => onUpdate(idx, 'item_count', Number(v.target.value))} /></div>
                <div className="inspector-panel-field"><label>Weight</label><input type="number" step="0.1" value={rew.weight} onChange={(v) => onUpdate(idx, 'weight', Number(v.target.value))} /></div>
              </div>
              <div className="inspector-panel-field" style={{ marginBottom: 6 }}>
                <label>NBT Data</label>
                <input type="text" value={rew.nbt_data} onChange={(v) => onUpdate(idx, 'nbt_data', v.target.value)} />
              </div>
            </>
          )}
          {rew.reward_type === 'experience' && (
            <div className="inspector-panel-row">
              <div className="inspector-panel-field"><label>XP Amount</label><input type="number" value={rew.xp_amount} onChange={(v) => onUpdate(idx, 'xp_amount', Number(v.target.value))} /></div>
              <div className="inspector-panel-field"><label>XP Levels</label><input type="number" value={rew.xp_levels} onChange={(v) => onUpdate(idx, 'xp_levels', Number(v.target.value))} /></div>
            </div>
          )}
          {rew.reward_type === 'command' && (
            <div className="inspector-panel-field" style={{ marginBottom: 6 }}>
              <label>Command</label>
              <input type="text" value={rew.command} onChange={(v) => onUpdate(idx, 'command', v.target.value)} placeholder="/give @p minecraft:diamond" />
            </div>
          )}
          {rew.reward_type === 'loot_table' && (
            <div className="inspector-panel-field" style={{ marginBottom: 6 }}>
              <label>Loot Table</label>
              <input type="text" value={rew.loot_table} onChange={(v) => onUpdate(idx, 'loot_table', v.target.value)} placeholder="minecraft:chests/simple_dungeon" />
            </div>
          )}
          {rew.reward_type === 'game_stage' && (
            <div className="inspector-panel-field" style={{ marginBottom: 6 }}>
              <label>Game Stage</label>
              <input type="text" value={rew.game_stage} onChange={(v) => onUpdate(idx, 'game_stage', v.target.value)} />
            </div>
          )}
          {rew.reward_type === 'choice' && (
            <div className="inspector-panel-field" style={{ marginBottom: 6 }}>
              <label>Choices (one ID per line)</label>
              <textarea rows={3} value={rew.choices.join('\n')} onChange={(v) => onUpdate(idx, 'choices', v.target.value.split('\n').filter(Boolean))} placeholder={"minecraft:diamond\nminecraft:emerald"} />
            </div>
          )}
          {rew.reward_type === 'xp_levels' && (
            <div className="inspector-panel-field" style={{ marginBottom: 6 }}>
              <label>XP Levels</label>
              <input type="number" value={rew.xp_levels} onChange={(v) => onUpdate(idx, 'xp_levels', Number(v.target.value))} />
            </div>
          )}
          {rew.reward_type === 'advancement' && (
            <div className="inspector-panel-field" style={{ marginBottom: 6 }}>
              <label>Advancement ID</label>
              <input type="text" value={rew.advancement_id || ''} onChange={(v) => onUpdate(idx, 'advancement_id', v.target.value)} placeholder="minecraft:adventure/root" />
            </div>
          )}
          {rew.reward_type === 'toast' && (
            <div className="inspector-panel-field" style={{ marginBottom: 6 }}>
              <label>Toast Message</label>
              <input type="text" value={rew.toast_message || ''} onChange={(v) => onUpdate(idx, 'toast_message', v.target.value)} />
            </div>
          )}
          {['random', 'choice', 'all_table'].includes(rew.reward_type) && (
            <div className="inspector-panel-field" style={{ marginBottom: 6 }}>
              <label>Reward Table</label>
              {rewardTables && rewardTables.length > 0 ? (
                <select value={rew.table_id || ''} onChange={(v) => onUpdate(idx, 'table_id', v.target.value)}>
                  <option value="">(none)</option>
                  {rewardTables.map((t) => (
                    <option key={t.id} value={t.id}>{t.id}{t.title ? ` — ${t.title}` : ''}</option>
                  ))}
                </select>
              ) : (
                <input type="text" value={rew.table_id || ''} onChange={(v) => onUpdate(idx, 'table_id', v.target.value)}
                  placeholder="00E1FAFD0EF07752" />
              )}
            </div>
          )}
          {rew.reward_type === 'loot_table' && (
            <div className="inspector-panel-field" style={{ marginBottom: 6 }}>
              <label>Loot Table</label>
              <input type="text" value={rew.table_id || ''} onChange={(v) => onUpdate(idx, 'table_id', v.target.value)} placeholder="minecraft:gameplay/simple_loot_table" />
            </div>
          )}
          <div className="inspector-panel-field" style={{ marginBottom: 6 }}>
            <label>Description</label>
            <input type="text" value={rew.description} onChange={(v) => onUpdate(idx, 'description', v.target.value)} />
          </div>
          <label className="inspector-panel-checkbox">
            <input type="checkbox" checked={rew.team_reward} onChange={(v) => onUpdate(idx, 'team_reward', v.target.checked)} />
            Team Reward
          </label>
        </div>
      ))}
      <button className="inspector-panel-add-btn" onClick={onAdd}>+ Add Reward</button>
    </div>
  )
}
