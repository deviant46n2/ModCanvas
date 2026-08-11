import { useState } from 'react'
import type { QuestRewardData, RewardTableData } from '../../services/api'
import { ArrowDownIcon, ArrowUpIcon, XIcon } from '../ui/icons'
import { REWARD_TYPES } from './quest-form-constants'
import { QuestSlotIcon } from './quest-slot-icon'
import { QuestSelect } from './QuestSelect'
import { rewardEditorFor } from './reward-editors'

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

  // Each reward type renders its own fields via the editor registry; the
  // advanced block below holds the universal settings every reward shares.
  const Editor = rewardEditorFor(rew.reward_type)

  return (
    <div className="quest-detail-card">
      <div className="quest-detail-card-header">
        <div className="quest-detail-card-title">
          <QuestSlotIcon
            target={rew.item_id || rew.items[0] || ''}
            smartFilter={rew.smart_filter}
            objectiveType={rew.reward_type}
            textureIndex={textureIndex}
            size={24}
            className="quest-detail-task-icon"
            onClick={onOpenItemPicker}
            title={onOpenItemPicker ? 'Click to pick item' : undefined}
          />
          <span className="quest-detail-card-index">#{index + 1}</span>
          <QuestSelect
            value={rew.reward_type}
            onChange={(v) => onUpdate('reward_type', v)}
            ariaLabel="Reward type"
            options={REWARD_TYPES}
            className="quest-detail-card-type-select"
          />
        </div>
        <div className="quest-detail-card-reorder">
          <button className="quest-detail-card-reorder-btn" onClick={onMoveUp} disabled={!onMoveUp} title="Move up"><ArrowUpIcon size={12} /></button>
          <button className="quest-detail-card-reorder-btn" onClick={onMoveDown} disabled={!onMoveDown} title="Move down"><ArrowDownIcon size={12} /></button>
        </div>
        <button className="quest-detail-card-remove" onClick={onRemove} title="Remove"><XIcon size={12} /></button>
      </div>
      <div className="quest-detail-card-body">
        {Editor ? (
          <Editor rew={rew} onUpdate={onUpdate} onOpenItemPicker={onOpenItemPicker} rewardTables={rewardTables} />
        ) : (
          <div className="quest-detail-empty">No extra options for this type.</div>
        )}
        <div className="quest-detail-card-toggle">
          <button className="quest-detail-ghost-btn" onClick={() => setShowAdvanced(!showAdvanced)}>
            {showAdvanced ? '▾' : '▸'} Advanced
          </button>
        </div>
        {showAdvanced && (
          <div className="quest-detail-card-advanced">
            <div className="quest-detail-field-row">
              <div className="quest-detail-field">
                <label>Auto-Claim</label>
                <QuestSelect
                  value={rew.autoclaim}
                  onChange={(v) => onUpdate('autoclaim', v)}
                  ariaLabel="Auto-claim"
                  options={[
                    { value: '', label: 'Default' },
                    { value: 'enabled', label: 'Enabled' },
                    { value: 'disabled', label: 'Disabled' },
                    { value: 'no_toast', label: 'No Toast' },
                    { value: 'invisible', label: 'Invisible' },
                  ]}
                />
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
