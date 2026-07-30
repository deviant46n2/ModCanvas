import React from 'react'
import type { QuestTileData } from './QuestTileTypes'

export interface QuestTileHeaderProps {
  data: QuestTileData
  editingField: string | null
  editValue: string
  visIcon: string
  inputRef: React.RefObject<HTMLInputElement | null>
  onEditValueChange: (value: string) => void
  onStartEdit: (field: string, value: string) => void
  onKeyDown: (e: React.KeyboardEvent) => void
  onBlur: () => void
}

export function QuestTileHeader({
  data,
  editingField,
  editValue,
  visIcon,
  inputRef,
  onEditValueChange,
  onStartEdit,
  onKeyDown,
  onBlur,
}: QuestTileHeaderProps) {
  const handleDoubleClick = (e: React.MouseEvent, field: string, value: string) => {
    e.stopPropagation()
    onStartEdit(field, value)
  }

  return (
    <>
      <div className="quest-tile-header">
        <div className="quest-tile-visibility" title={data.visibility}>{visIcon}</div>
        <div className="quest-tile-title-area" onDoubleClick={(e) => handleDoubleClick(e, 'label', data.label)}>
          {editingField === 'label' ? (
            <input
              ref={inputRef}
              type="text"
              value={editValue}
              onChange={(e) => onEditValueChange(e.target.value)}
              onKeyDown={onKeyDown}
              onBlur={onBlur}
              className="quest-tile-edit-input quest-tile-title-input"
              autoFocus
            />
          ) : (
            <span className="quest-tile-title">{data.label}</span>
          )}
        </div>
        {data.optional && <div className="quest-tile-optional-badge" title="Optional">○</div>}
      </div>

      {data.subtitle && (
        <div
          className="quest-tile-subtitle"
          onDoubleClick={(e) => handleDoubleClick(e, 'subtitle', data.subtitle)}
        >
          {editingField === 'subtitle' ? (
            <input
              ref={inputRef}
              type="text"
              value={editValue}
              onChange={(e) => onEditValueChange(e.target.value)}
              onKeyDown={onKeyDown}
              onBlur={onBlur}
              className="quest-tile-edit-input quest-tile-title-input"
            />
          ) : data.subtitle}
        </div>
      )}
    </>
  )
}

export default QuestTileHeader
