import React, { useState, useRef, useCallback } from 'react'
import { Handle, Position } from '@xyflow/react'
import type { QuestTileData, QuestObjectiveData, QuestRewardData } from './quest/QuestTileTypes'
import { resolveIconKey, getIconUrl } from './quest/QuestTileTypes'
import QuestTileHeader from './quest/QuestTileHeader'
import QuestTileBody from './quest/QuestTileBody'
import QuestTileFooter from './quest/QuestTileFooter'

export type { QuestTileData, QuestObjectiveData, QuestRewardData }

export function QuestTileComponent({
  data,
  selected,
}: { data: QuestTileData; selected: boolean }) {
  const nodeType = data.nodeType || 'quest'
  const label = data.label || 'Quest'
  const icon = data.icon || ''
  const iconDataUrl = data.iconDataUrl || ''
  const color = data.color || ''
  const optional = data.optional || false
  const visibility = data.visibility || 'Normal'
  const objectives = data.objectives || []
  const rewards = data.rewards || []
  const canBeRepeatable = data.can_be_repeatable || false
  const silentlyComplete = data.silently_complete || false

  const textureIndex = data.textureIndex || {}
  const onUpdateNode = data.onUpdateNode
  const onUpdateObjective = data.onUpdateObjective
  const onUpdateReward = data.onUpdateReward

  const [expanded, setExpanded] = useState(false)
  const [editingField, setEditingField] = useState<string | null>(null)
  const [editValue, setEditValue] = useState<string>('')
  const [editObjectiveIdx, setEditObjectiveIdx] = useState<number | null>(null)
  const [editRewardIdx, setEditRewardIdx] = useState<number | null>(null)
  const [editObjField, setEditObjField] = useState<string | null>(null)
  const [editRewField, setEditRewField] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const borderColor = color || (
    nodeType === 'chapter' ? '#4ade80' :
    nodeType === 'quest' ? '#60a5fa' :
    nodeType === 'reward' ? '#fbbf24' :
    nodeType === 'gate' ? '#f87171' :
    nodeType === 'side_quest' ? '#a78bfa' : '#94a3b8'
  )

  const fallbackIcon = nodeType === 'chapter' ? '📖' :
    nodeType === 'gate' ? '🔒' :
    nodeType === 'reward' ? '🎁' :
    nodeType === 'side_quest' ? '📋' : '📜'

  const iconKey = resolveIconKey(icon)
  const questIconUrl = iconDataUrl || getIconUrl(textureIndex, iconKey) || null

  const visIcon = visibility === 'NeverVisible' ? '👻' :
    visibility === 'AlwaysVisible' ? '👁️' :
    visibility === 'WhenDependenciesComplete' ? '🔐' :
    visibility === 'WhenQuestComplete' ? '✅' :
    visibility === 'WhenAllComplete' ? '🏁' : ''

  const saveEdit = useCallback(() => {
    if (editingField && onUpdateNode) {
      onUpdateNode(data.id, { [editingField]: editValue } as Partial<QuestTileData>)
    }
    if (editObjectiveIdx !== null && editObjField && onUpdateObjective) {
      const obj = objectives[editObjectiveIdx]
      if (obj) onUpdateObjective(data.id, obj.id, editObjField, editValue)
    }
    if (editRewardIdx !== null && editRewField && onUpdateReward) {
      const rew = rewards[editRewardIdx]
      if (rew) onUpdateReward(data.id, rew.id, editRewField, editValue)
    }
    setEditingField(null)
    setEditObjectiveIdx(null)
    setEditRewardIdx(null)
    setEditObjField(null)
    setEditRewField(null)
  }, [editingField, editValue, editObjectiveIdx, editObjField, editRewardIdx, editRewField, data.id, objectives, rewards, onUpdateNode, onUpdateObjective, onUpdateReward])

  const toggleExpanded = (e: React.MouseEvent) => {
    e.stopPropagation()
    setExpanded(!expanded)
  }

  if (!expanded) {
    const nodeSize = nodeType === 'chapter' ? 64 : 56
    const iconSize = nodeType === 'chapter' ? 48 : 40
    const borderRadius = nodeType === 'chapter' ? '50%' : '8px'

    return (
      <div
        className={`quest-node-collapsed ${nodeType}-node ${selected ? 'selected' : ''}`}
        style={{ width: nodeSize, height: nodeSize, borderColor: `${borderColor}99`, borderRadius }}
        onDoubleClick={toggleExpanded}
      >
        {visIcon && <div className="node-vis-badge" title={visibility}>{visIcon}</div>}
        {optional && <div className="node-optional-badge">○</div>}
        <div className="node-icon-large" style={{ width: iconSize, height: iconSize }}>
          {questIconUrl ? (
            <img src={questIconUrl} alt="" style={{ width: iconSize - 2, height: iconSize - 2, imageRendering: 'pixelated' }} />
          ) : (
            <span style={{ fontSize: Math.max(16, Math.round(iconSize * 0.6)) }}>{fallbackIcon}</span>
          )}
        </div>
        <div className="node-label">{label}</div>
        {(objectives.length > 0 || rewards.length > 0) && (
          <div className="node-task-reward-badges">
            {objectives.length > 0 && <span className="node-task-badge" title={`${objectives.length} objective${objectives.length !== 1 ? 's' : ''}`}>T{objectives.length}</span>}
            {rewards.length > 0 && <span className="node-reward-badge" title={`${rewards.length} reward${rewards.length !== 1 ? 's' : ''}`}>R{rewards.length}</span>}
          </div>
        )}
        <Handle type="target" position={Position.Top} className="quest-tile-handle" />
        <Handle type="source" position={Position.Bottom} className="quest-tile-handle" />
      </div>
    )
  }

  const startEdit = (field: string, currentValue: string) => {
    setEditingField(field)
    setEditValue(currentValue)
    setTimeout(() => inputRef.current?.focus(), 0)
  }

  const startEditObjective = (idx: number, field: string, currentValue: string | number) => {
    setEditObjectiveIdx(idx)
    setEditObjField(field)
    setEditValue(String(currentValue))
    setTimeout(() => inputRef.current?.focus(), 0)
  }

  const startEditReward = (idx: number, field: string, currentValue: string | number) => {
    setEditRewardIdx(idx)
    setEditRewField(field)
    setEditValue(String(currentValue))
    setTimeout(() => inputRef.current?.focus(), 0)
  }

  const cancelEdit = () => {
    setEditingField(null)
    setEditObjectiveIdx(null)
    setEditRewardIdx(null)
    setEditObjField(null)
    setEditRewField(null)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      saveEdit()
    } else if (e.key === 'Escape') {
      cancelEdit()
    }
  }

  const handleBlur = () => { saveEdit() }

  return (
    <div
      className={`quest-tile ${nodeType}-tile ${selected ? 'selected' : ''} ${optional ? 'optional' : ''}`}
      style={{ width: 200, borderLeftColor: borderColor }}
    >
      <Handle type="target" position={Position.Top} className="quest-tile-handle" />
      <Handle type="source" position={Position.Bottom} className="quest-tile-handle" />

      <QuestTileHeader
        data={data}
        editingField={editingField}
        editValue={editValue}
        visIcon={visIcon}
        inputRef={inputRef}
        onEditValueChange={setEditValue}
        onStartEdit={startEdit}
        onSaveEdit={saveEdit}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
      />

      <QuestTileBody
        data={data}
        editingField={editingField}
        editValue={editValue}
        editObjectiveIdx={editObjectiveIdx}
        editRewardIdx={editRewardIdx}
        editObjField={editObjField}
        editRewField={editRewField}
        questIconUrl={questIconUrl}
        fallbackIcon={fallbackIcon}
        inputRef={inputRef}
        textareaRef={textareaRef}
        onEditValueChange={setEditValue}
        onStartEdit={startEdit}
        onStartEditObjective={startEditObjective}
        onStartEditReward={startEditReward}
        onSaveEdit={saveEdit}
        onCancelEdit={cancelEdit}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
      />

      <QuestTileFooter
        canBeRepeatable={canBeRepeatable}
        silentlyComplete={silentlyComplete}
        repeatTime={data.repeat_time || 0}
      />
    </div>
  )
}

export default QuestTileComponent
