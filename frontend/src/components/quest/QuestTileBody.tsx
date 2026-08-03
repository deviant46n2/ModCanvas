import React from 'react'
import { SearchIcon } from '../ui/icons'
import type { ReactNode } from 'react'
import type { QuestTileData } from './QuestTileTypes'
import { ICON_SIZE, resolveIconKey } from './QuestTileTypes'
import { isTexturePending } from '../../services/texture-loader'
import { QuestIcon } from './QuestIcon'
import { AnimatedSprite } from './AnimatedSprite'
import { SmartFilterIcon } from './SmartFilterIcon'
import ObjectiveRow from './ObjectiveRow'
import RewardRow from './RewardRow'

export interface QuestTileBodyProps {
  data: QuestTileData
  editingField: string | null
  editValue: string
  editObjectiveIdx: number | null
  editRewardIdx: number | null
  editObjField: string | null
  editRewField: string | null
  questIconUrl: string | null
  fallbackIcon: ReactNode
  inputRef: React.RefObject<HTMLInputElement | null>
  textareaRef: React.RefObject<HTMLTextAreaElement | null>
  onEditValueChange: (value: string) => void
  onStartEdit: (field: string, value: string) => void
  onStartEditObjective: (idx: number, field: string, value: string | number) => void
  onStartEditReward: (idx: number, field: string, value: string | number) => void
  onSaveEdit: () => void
  onCancelEdit: () => void
  onKeyDown: (e: React.KeyboardEvent) => void
  onBlur: () => void
}

export function QuestTileBody({
  data,
  editingField,
  editValue,
  editObjectiveIdx,
  editRewardIdx,
  editObjField,
  editRewField,
  questIconUrl,
  fallbackIcon,
  inputRef,
  textareaRef,
  onEditValueChange,
  onStartEdit,
  onStartEditObjective,
  onStartEditReward,
  onSaveEdit,
  onCancelEdit,
  onKeyDown,
  onBlur,
}: QuestTileBodyProps) {
  const objectives = data.objectives || []
  const rewards = data.rewards || []
  const textureIndex = data.textureIndex || {}
  const description = data.description || ''
  const icon = data.icon || ''
  const iconKey = resolveIconKey(icon)
  const iconPending = isTexturePending(textureIndex, iconKey)
  const smartFilterDsl = !icon && objectives[0]?.smart_filter ? objectives[0].smart_filter : ''

  const handleDoubleClick = (e: React.MouseEvent, field: string, value: string) => {
    e.stopPropagation()
    onStartEdit(field, value)
  }

  return (
    <div className="quest-tile-main">
      <div className="quest-tile-icon-column">
        <div
          className="quest-tile-icon"
          onDoubleClick={(e) => handleDoubleClick(e, 'icon', icon)}
          title="Double-click to change icon"
        >
          {smartFilterDsl ? (
            <SmartFilterIcon
              dsl={smartFilterDsl}
              textureIndex={textureIndex}
              fallback={fallbackIcon}
              size={ICON_SIZE}
            />
          ) : questIconUrl ? (
            <AnimatedSprite url={questIconUrl} textureKey={iconKey} width={ICON_SIZE} height={ICON_SIZE} alt="" imageRendering="pixelated" />
          ) : iconPending ? (
            <QuestIcon pending url={null} fallback="" size={ICON_SIZE} />
          ) : (
            <span className="quest-tile-fallback" style={{ fontSize: ICON_SIZE * 0.7 }}>{fallbackIcon}</span>
          )}
          <button
            className="quest-tile-icon-btn"
            onClick={(e) => { e.stopPropagation(); data.onOpenIconPicker?.('quest') }}
            title="Pick icon from mods"
          >
            <SearchIcon size={14} />
          </button>
        </div>
      </div>

      <div className="quest-tile-content">
        {(description || (!objectives.length && !rewards.length)) && (
          <div
            className="quest-tile-description"
            onDoubleClick={(e) => handleDoubleClick(e, 'description', description)}
          >
            {editingField === 'description' ? (
              <textarea
                ref={textareaRef}
                value={editValue}
                onChange={(e) => onEditValueChange(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSaveEdit() } else if (e.key === 'Escape') onBlur() }}
                onBlur={onBlur}
                className="quest-tile-edit-textarea"
                rows={2}
                autoFocus
              />
            ) : (
              description || <span className="quest-tile-empty-desc">Double-click to add description...</span>
            )}
          </div>
        )}

        <div className="quest-tile-objectives">
          <div className="quest-tile-section-header">
            <span>Objectives</span>
            <span className="quest-tile-count">{objectives.length}</span>
          </div>
          {objectives.map((obj, idx) => (
            <ObjectiveRow
              key={obj.id}
              obj={obj}
              idx={idx}
              data={data}
              textureIndex={textureIndex}
              editingField={editingField}
              editObjectiveIdx={editObjectiveIdx}
              editObjField={editObjField}
              editValue={editValue}
              inputRef={inputRef}
              onEditValueChange={onEditValueChange}
              onStartEditObjective={onStartEditObjective}
              onSaveEdit={onSaveEdit}
              onCancelEdit={onCancelEdit}
              onKeyDown={onKeyDown}
              onBlur={onBlur}
            />
          ))}
          <button className="quest-tile-add-btn" onClick={() => data.onAddObjective?.(data.id)}>
            <span>+</span> Add Objective
          </button>
        </div>

        <div className="quest-tile-rewards">
          <div className="quest-tile-section-header">
            <span>Rewards</span>
            <span className="quest-tile-count">{rewards.length}</span>
          </div>
          {rewards.map((rew, idx) => (
            <RewardRow
              key={rew.id}
              rew={rew}
              idx={idx}
              data={data}
              textureIndex={textureIndex}
              editRewardIdx={editRewardIdx}
              editRewField={editRewField}
              editValue={editValue}
              inputRef={inputRef}
              onEditValueChange={onEditValueChange}
              onStartEditReward={onStartEditReward}
              onSaveEdit={onSaveEdit}
              onCancelEdit={onCancelEdit}
              onKeyDown={onKeyDown}
              onBlur={onBlur}
            />
          ))}
          <button className="quest-tile-add-btn" onClick={() => data.onAddReward?.(data.id)}>
            <span>+</span> Add Reward
          </button>
        </div>
      </div>
    </div>
  )
}

export default QuestTileBody
