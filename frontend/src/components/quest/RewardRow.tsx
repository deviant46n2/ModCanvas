import React from 'react'
import { SearchIcon, CheckIcon, XIcon, TrashIcon } from '../../components/ui/icons'
import type { QuestRewardData, QuestTileData } from './QuestTileTypes'
import { getIconUrl, getRewardIcon, getFallbackIcon, resolveIconKey } from './QuestTileTypes'
import { isTexturePending } from '../../services/texture-loader'
import { QuestIcon } from './QuestIcon'
import { AnimatedSprite } from './AnimatedSprite'
import { SmartFilterIcon } from './SmartFilterIcon'

export interface RewardRowProps {
  rew: QuestRewardData
  idx: number
  data: QuestTileData
  textureIndex: Record<string, string>
  editRewardIdx: number | null
  editRewField: string | null
  editValue: string
  inputRef: React.RefObject<HTMLInputElement | null>
  onEditValueChange: (value: string) => void
  onStartEditReward: (idx: number, field: string, value: string | number) => void
  onSaveEdit: () => void
  onCancelEdit: () => void
  onKeyDown: (e: React.KeyboardEvent) => void
  onBlur: () => void
}

export function RewardRow({
  rew, idx, data, textureIndex,
  editRewardIdx, editRewField, editValue,
  inputRef, onEditValueChange, onStartEditReward,
  onSaveEdit, onCancelEdit, onKeyDown, onBlur,
}: RewardRowProps) {
  const rewIconKeyRaw = getRewardIcon(rew)
  const rewIconKey = rewIconKeyRaw ? resolveIconKey(rewIconKeyRaw) : ''
  const rewIconUrl = rewIconKey ? getIconUrl(textureIndex, rewIconKey) : null
  const rewPending = rewIconKey ? isTexturePending(textureIndex, rewIconKey) : false
  const isItemRew = ['item', 'item_tag'].includes(rew.reward_type)

  const handleDoubleClick = (e: React.MouseEvent, field: string, value: string | number) => {
    e.stopPropagation()
    onStartEditReward(idx, field, value)
  }

  return (
    <div key={rew.id} className="quest-tile-reward">
      <div className="quest-tile-reward-icon" onDoubleClick={(e) => isItemRew && handleDoubleClick(e, 'item_id', rew.item_id || rew.items[0] || '')}>
        {rew.smart_filter ? (
          <SmartFilterIcon
            dsl={rew.smart_filter}
            textureIndex={textureIndex}
            fallback={getFallbackIcon(rew.reward_type)}
            size={20}
          />
        ) : rewIconUrl ? (
          <AnimatedSprite url={rewIconUrl} textureKey={rewIconKey} width={20} height={20} alt="" imageRendering="pixelated" />
        ) : rewPending ? (
          <QuestIcon pending url={null} fallback="" size={20} />
        ) : (
          <span style={{ fontSize: 14 }}>{getFallbackIcon(rew.reward_type)}</span>
        )}
        {isItemRew && (
          <button
            className="quest-tile-icon-btn small"
            onClick={(e) => { e.stopPropagation(); data.onOpenIconPicker?.('reward', idx) }}
            title="Pick item icon"
          >
            <SearchIcon size={12} />
          </button>
        )}
      </div>
      <div className="quest-tile-reward-content" style={{ flex: 1 }}>
        <div className="quest-tile-reward-row">
          {editRewardIdx === idx && editRewField === 'label' ? (
            <input
              ref={inputRef}
              type="text"
              value={editValue}
              onChange={(e) => onEditValueChange(e.target.value)}
              onKeyDown={onKeyDown}
              onBlur={onBlur}
              className="quest-tile-edit-input"
              style={{ flex: 1 }}
            />
          ) : (
            <span
              className="quest-tile-reward-label"
              onDoubleClick={(e) => handleDoubleClick(e, 'label', rew.label)}
            >
              {rew.label || rew.reward_type}
            </span>
          )}
          <span className="quest-tile-reward-count">×{rew.item_count || 1}</span>
        </div>
        <div className="quest-tile-reward-row">
          {editRewardIdx === idx && editRewField === 'item_id' ? (
            <input
              ref={inputRef}
              type="text"
              value={editValue}
              onChange={(e) => onEditValueChange(e.target.value)}
              onKeyDown={onKeyDown}
              onBlur={onBlur}
              className="quest-tile-edit-input"
              style={{ flex: 1, fontSize: 11 }}
              placeholder="minecraft:diamond"
            />
          ) : isItemRew ? (
            <span
              className="quest-tile-reward-target"
              onDoubleClick={(e) => handleDoubleClick(e, 'item_id', rew.item_id || rew.items[0] || '')}
            >
              {rew.item_id || rew.items[0] || rew.item_tag || '—'}
            </span>
          ) : (
            <span className="quest-tile-reward-target" style={{ color: '#888' }}>{rew.reward_type}</span>
          )}
        </div>
      </div>
      <div className="quest-tile-reward-actions">
        {editRewardIdx === idx ? (
          <>
            <button className="quest-tile-btn save" onClick={onSaveEdit} title="Save"><CheckIcon size={12} /></button>
            <button className="quest-tile-btn cancel" onClick={onCancelEdit} title="Cancel"><XIcon size={12} /></button>
          </>
        ) : (
          <button className="quest-tile-btn delete" onClick={() => data.onRemoveReward?.(data.id, rew.id)} title="Remove"><TrashIcon size={12} /></button>
        )}
        {rew.team_reward && <span className="quest-tile-team-badge" title="Team Reward">Team</span>}
      </div>
    </div>
  )
}

export default RewardRow
