import React from 'react'
import type { QuestObjectiveData, QuestTileData } from './QuestTileTypes'
import { getIconUrl, getObjectiveIcon, getFallbackIcon, resolveIconKey } from './QuestTileTypes'
import { isTexturePending } from '../../services/texture-loader'
import { QuestIcon } from './QuestIcon'
import { AnimatedSprite } from './AnimatedSprite'
import { SmartFilterIcon } from './SmartFilterIcon'

export interface ObjectiveRowProps {
  obj: QuestObjectiveData
  idx: number
  data: QuestTileData
  textureIndex: Record<string, string>
  editingField: string | null
  editObjectiveIdx: number | null
  editObjField: string | null
  editValue: string
  inputRef: React.RefObject<HTMLInputElement | null>
  onEditValueChange: (value: string) => void
  onStartEditObjective: (idx: number, field: string, value: string | number) => void
  onSaveEdit: () => void
  onCancelEdit: () => void
  onKeyDown: (e: React.KeyboardEvent) => void
  onBlur: () => void
}

export function ObjectiveRow({
  obj, idx, data, textureIndex,
  editingField, editObjectiveIdx, editObjField, editValue,
  inputRef, onEditValueChange, onStartEditObjective,
  onSaveEdit, onCancelEdit, onKeyDown, onBlur,
}: ObjectiveRowProps) {
  const objIconKeyRaw = getObjectiveIcon(obj)
  const objIconKey = objIconKeyRaw ? resolveIconKey(objIconKeyRaw) : ''
  const objIconUrl = objIconKey ? getIconUrl(textureIndex, objIconKey) : null
  const objPending = objIconKey ? isTexturePending(textureIndex, objIconKey) : false
  const isItemObj = ['item', 'item_tag'].includes(obj.objective_type)

  const handleDoubleClick = (e: React.MouseEvent, field: string, value: string | number) => {
    e.stopPropagation()
    onStartEditObjective(idx, field, value)
  }

  return (
    <div key={obj.id} className="quest-tile-objective">
      <div className="quest-tile-objective-icon" onDoubleClick={(e) => isItemObj && handleDoubleClick(e, 'target', obj.target)}>
        {obj.smart_filter ? (
          <SmartFilterIcon
            dsl={obj.smart_filter}
            textureIndex={textureIndex}
            fallback={getFallbackIcon(obj.objective_type)}
            size={20}
          />
        ) : objIconUrl ? (
          <AnimatedSprite url={objIconUrl} textureKey={objIconKey} width={20} height={20} alt="" imageRendering="pixelated" />
        ) : objPending ? (
          <QuestIcon pending url={null} fallback="" size={20} />
        ) : (
          <span style={{ fontSize: 14 }}>{getFallbackIcon(obj.objective_type)}</span>
        )}
        {isItemObj && (
          <button
            className="quest-tile-icon-btn small"
            onClick={(e) => { e.stopPropagation(); data.onOpenIconPicker?.('objective', idx) }}
            title="Pick item icon"
          >
            🔍
          </button>
        )}
      </div>
      <div className="quest-tile-objective-content" style={{ flex: 1 }}>
        <div className="quest-tile-objective-row">
          {editingField === null && editObjectiveIdx === idx && editObjField === 'label' ? (
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
              className="quest-tile-objective-label"
              onDoubleClick={(e) => handleDoubleClick(e, 'label', obj.label)}
            >
              {obj.label || obj.objective_type}
            </span>
          )}
          <span className="quest-tile-objective-count">×{obj.target_count || 1}</span>
        </div>
        <div className="quest-tile-objective-row">
          {editingField === null && editObjectiveIdx === idx && editObjField === 'target' ? (
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
          ) : isItemObj ? (
            <span
              className="quest-tile-objective-target"
              onDoubleClick={(e) => handleDoubleClick(e, 'target', obj.target)}
            >
              {obj.target || obj.item_tag || '—'}
            </span>
          ) : (
            <span className="quest-tile-objective-target" style={{ color: '#888' }}>{obj.objective_type}</span>
          )}
          {editObjectiveIdx === idx && editObjField === 'target_count' && (
            <input
              ref={inputRef}
              type="number"
              value={editValue}
              onChange={(e) => onEditValueChange(e.target.value)}
              onKeyDown={onKeyDown}
              onBlur={onBlur}
              className="quest-tile-edit-input"
              style={{ width: 50, fontSize: 11 }}
            />
          )}
        </div>
      </div>
      <div className="quest-tile-objective-actions">
        {editObjectiveIdx === idx ? (
          <>
            <button className="quest-tile-btn save" onClick={onSaveEdit} title="Save">✓</button>
            <button className="quest-tile-btn cancel" onClick={onCancelEdit} title="Cancel">✕</button>
          </>
        ) : (
          <button className="quest-tile-btn delete" onClick={() => data.onRemoveObjective?.(data.id, obj.id)} title="Remove">🗑</button>
        )}
        {!obj.required && <span className="quest-tile-optional-badge" title="Optional">○</span>}
      </div>
    </div>
  )
}

export default ObjectiveRow
