import React, { useState, useRef, useCallback } from 'react'
import { Handle, Position } from '@xyflow/react'

export interface QuestTileData {
  id: string
  label: string
  description: string
  subtitle: string
  icon: string
  iconDataUrl: string
  color: string
  shape: string
  size: { width: number; height: number }
  icon_scaling: number
  nodeType: string
  optional: boolean
  visibility: string
  objectives: QuestObjectiveData[]
  rewards: QuestRewardData[]
  can_be_repeatable: boolean
  silently_complete: boolean
  repeat_time: number
  repeat_min_delay: number
  repeat_max_delay: number
  lock_icon: string
  quest_background: string
  tags: string[]
  progression_mode: string
  sequential_tasks: boolean
  disable_completion_toast: boolean
  ignore_reward_blocking: boolean
  disable_jei_recipe: boolean
  min_window_width: number
  hide_details_until_startable: boolean
  hide_text_until_completed: boolean
  invisible_until_completed: boolean
  invisible_until_x_tasks: number
  hide_dependency_lines: boolean
  hide_dependent_lines: boolean
  min_required_dependencies: number
  dependency_requirement: string
  // Callbacks passed from parent via node data
  textureIndex?: Record<string, string>
  onUpdateNode?: (id: string, data: Partial<QuestTileData>) => void
  onAddObjective?: (nodeId: string) => void
  onAddReward?: (nodeId: string) => void
  onRemoveObjective?: (nodeId: string, objectiveId: string) => void
  onRemoveReward?: (nodeId: string, rewardId: string) => void
  onUpdateObjective?: (nodeId: string, objectiveId: string, field: string, value: unknown) => void
  onUpdateReward?: (nodeId: string, rewardId: string, field: string, value: unknown) => void
  onOpenIconPicker?: (target: 'quest' | 'objective' | 'reward', index?: number) => void
}

export interface QuestObjectiveData {
  id: string
  label: string
  objective_type: string
  target: string
  target_count: number
  required: boolean
  item_tag: string
  nbt_data: string
  consume_items: boolean
  match_nbt: boolean
  ignore_nbt: boolean
  exact_match: boolean
  fluid_id: string
  fluid_amount: number
  energy_amount: number
  energy_unit: string
  xp_levels: number
  xp_points: number
  command: string
  dimension: string
  x: number
  y: number
  z: number
  radius: number
  entity_id: string
  advancement_id: string
  custom_json: string
  description: string
  stat_name: string
  stat_value: number
  biome_id: string
  structure_id: string
  observation_range: number
}

export interface QuestRewardData {
  id: string
  label: string
  reward_type: string
  items: string[]
  description: string
  item_id: string
  item_tag: string
  item_count: number
  nbt_data: string
  xp_amount: number
  xp_levels: number
  command: string
  loot_table: string
  game_stage: string
  weight: number
  reward_chests: string[]
  team_reward: boolean
  toast_message: string
  table_id: string
  choices: string[]
  advancement_id: string
}

const TILE_WIDTH = 200
const ICON_SIZE = 32

function getIconUrl(textureIndex: Record<string, string>, itemId: string): string | null {
  if (!itemId) return null
  const key = itemId.replace(/^minecraft:/, '').replace(/^textures\/(item|block)\//, '').replace(/\.png$/, '')
  return textureIndex[key] || textureIndex[itemId] || null
}

function getObjectiveIcon(obj: QuestObjectiveData): string | null {
  if (['item', 'item_tag'].includes(obj.objective_type)) return obj.target || obj.item_tag
  return null
}

function getRewardIcon(rew: QuestRewardData): string | null {
  if (['item', 'item_tag'].includes(rew.reward_type)) return rew.item_id || rew.items[0] || rew.item_tag
  return null
}

function getFallbackIcon(type: string): string {
  const icons: Record<string, string> = {
    item: '📦', item_tag: '🏷️', fluid: '💧', energy: '⚡',
    xp: '✨', entity: '👾', location: '📍', command: '💻',
    advancement: '🏆', stat: '📊', observation: '👁️', biome: '🌲', structure: '🏰',
    experience: '✨', loot_table: '🎰', game_stage: '🎮', choice: '🤔',
    xp_levels: '✨', toast: '💬', loot_table_table: '🎰'
  }
  return icons[type] || '📦'
}

function resolveIconKey(icon: string): string {
  if (!icon) return ''
  if (icon.includes(':') && !icon.includes('/')) {
    return icon
  }
  if (!icon.includes(':')) {
    return `minecraft:${icon}`
  }
  const parts = icon.split(':')
  if (parts.length === 2) {
    const namespace = parts[0]
    let path = parts[1].replace(/^textures\/(item|block)\//, '').replace(/\.png$/, '')
    if (path.startsWith('block/')) return `${namespace}:${path.substring(6)}`
    if (path.startsWith('item/')) return `${namespace}:${path.substring(5)}`
    return `${namespace}:${path}`
  }
  return icon
}

export function QuestTileComponent({
  data,
  selected,
}: { data: QuestTileData; selected: boolean }) {
  const nodeType = (data.nodeType as string) || 'quest'
  const label = (data.label as string) || 'Quest'
  const description = (data.description as string) || ''
  const subtitle = (data.subtitle as string) || ''
  const icon = (data.icon as string) || ''
  const iconDataUrl = (data.iconDataUrl as string) || ''
  const color = (data.color as string) || ''
  const optional = (data.optional as boolean) || false
  const visibility = (data.visibility as string) || 'Normal'
  const objectives = (data.objectives as QuestObjectiveData[]) || []
  const rewards = (data.rewards as QuestRewardData[]) || []
  const canBeRepeatable = (data.can_be_repeatable as boolean) || false
  const silentlyComplete = (data.silently_complete as boolean) || false

  // Extract callbacks and textureIndex from data
  const textureIndex = (data.textureIndex as Record<string, string>) || {}
  const onUpdateNode = data.onUpdateNode as ((id: string, data: Partial<QuestTileData>) => void) | undefined
  const onAddObjective = data.onAddObjective as ((nodeId: string) => void) | undefined
  const onAddReward = data.onAddReward as ((nodeId: string) => void) | undefined
  const onRemoveObjective = data.onRemoveObjective as ((nodeId: string, objectiveId: string) => void) | undefined
  const onRemoveReward = data.onRemoveReward as ((nodeId: string, rewardId: string) => void) | undefined
  const onUpdateObjective = data.onUpdateObjective as ((nodeId: string, objectiveId: string, field: string, value: unknown) => void) | undefined
  const onUpdateReward = data.onUpdateReward as ((nodeId: string, rewardId: string, field: string, value: unknown) => void) | undefined
  const onOpenIconPicker = data.onOpenIconPicker as ((target: 'quest' | 'objective' | 'reward', index?: number) => void) | undefined

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

  const toggleExpanded = (e: React.MouseEvent) => {
    e.stopPropagation()
    setExpanded(!expanded)
  }

  // Collapsed view - just the icon node like in-game
  if (!expanded) {
    const nodeSize = nodeType === 'chapter' ? 64 : 56
    const iconSize = nodeType === 'chapter' ? 48 : 40
    const borderRadius = nodeType === 'chapter' ? '50%' : '8px'
    
    return (
      <div
        className={`quest-node-collapsed ${nodeType}-node ${selected ? 'selected' : ''}`}
        style={{
          width: nodeSize,
          height: nodeSize,
          borderColor: `${borderColor}99`,
          borderRadius,
        }}
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

  // Expanded view - full editable tile
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

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      saveEdit()
    } else if (e.key === 'Escape') {
      setEditingField(null)
      setEditObjectiveIdx(null)
      setEditRewardIdx(null)
      setEditObjField(null)
      setEditRewField(null)
    }
  }

  const handleBlur = () => {
    saveEdit()
  }

  const handleDoubleClick = (e: React.MouseEvent, field: string, value: string) => {
    e.stopPropagation()
    startEdit(field, value)
  }

  const handleObjectiveDoubleClick = (e: React.MouseEvent, idx: number, field: string, value: string | number) => {
    e.stopPropagation()
    startEditObjective(idx, field, value)
  }

  const handleRewardDoubleClick = (e: React.MouseEvent, idx: number, field: string, value: string | number) => {
    e.stopPropagation()
    startEditReward(idx, field, value)
  }

  const renderQuestIcon = () => (
    <div
      className="quest-tile-icon"
      onDoubleClick={(e) => handleDoubleClick(e, 'icon', icon)}
      title="Double-click to change icon"
    >
      {questIconUrl ? (
        <img src={questIconUrl} alt="" style={{ width: ICON_SIZE, height: ICON_SIZE, imageRendering: 'pixelated' }} />
      ) : (
        <span style={{ fontSize: ICON_SIZE * 0.7 }}>{fallbackIcon}</span>
      )}
      <button
        className="quest-tile-icon-btn"
        onClick={(e) => { e.stopPropagation(); onOpenIconPicker?.('quest') }}
        title="Pick icon from mods"
      >
        🔍
      </button>
    </div>
  )

  const renderObjective = (obj: QuestObjectiveData, idx: number) => {
    const objIconKey = getObjectiveIcon(obj)
    const objIconUrl = objIconKey ? getIconUrl(textureIndex, resolveIconKey(objIconKey)) : null
    const isItemObj = ['item', 'item_tag'].includes(obj.objective_type)

    return (
      <div key={obj.id} className="quest-tile-objective">
        <div className="quest-tile-objective-icon" onDoubleClick={(e) => isItemObj && handleObjectiveDoubleClick(e, idx, 'target', obj.target)}>
          {objIconUrl ? (
            <img src={objIconUrl} alt="" style={{ width: 20, height: 20, imageRendering: 'pixelated' }} />
          ) : (
            <span style={{ fontSize: 14 }}>{getFallbackIcon(obj.objective_type)}</span>
          )}
          {isItemObj && (
            <button
              className="quest-tile-icon-btn small"
              onClick={(e) => { e.stopPropagation(); onOpenIconPicker?.('objective', idx) }}
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
                onChange={(e) => setEditValue(e.target.value)}
                onKeyDown={handleKeyDown}
                onBlur={handleBlur}
                className="quest-tile-edit-input"
                style={{ flex: 1 }}
              />
            ) : (
              <span
                className="quest-tile-objective-label"
                onDoubleClick={(e) => handleObjectiveDoubleClick(e, idx, 'label', obj.label)}
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
                onChange={(e) => setEditValue(e.target.value)}
                onKeyDown={handleKeyDown}
                onBlur={handleBlur}
                className="quest-tile-edit-input"
                style={{ flex: 1, fontSize: 11 }}
                placeholder="minecraft:diamond"
              />
            ) : isItemObj ? (
              <span
                className="quest-tile-objective-target"
                onDoubleClick={(e) => handleObjectiveDoubleClick(e, idx, 'target', obj.target)}
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
                onChange={(e) => setEditValue(e.target.value)}
                onKeyDown={handleKeyDown}
                onBlur={handleBlur}
                className="quest-tile-edit-input"
                style={{ width: 50, fontSize: 11 }}
              />
            )}
          </div>
        </div>
        <div className="quest-tile-objective-actions">
          {editObjectiveIdx === idx ? (
            <>
              <button className="quest-tile-btn save" onClick={saveEdit} title="Save">✓</button>
              <button className="quest-tile-btn cancel" onClick={() => { setEditObjectiveIdx(null); setEditObjField(null) }} title="Cancel">✕</button>
            </>
          ) : (
            <button className="quest-tile-btn delete" onClick={() => onRemoveObjective?.(data.id, obj.id)} title="Remove">🗑</button>
          )}
          {!obj.required && <span className="quest-tile-optional-badge" title="Optional">○</span>}
        </div>
      </div>
    )
  }

  const renderReward = (rew: QuestRewardData, idx: number) => {
    const rewIconKey = getRewardIcon(rew)
    const rewIconUrl = rewIconKey ? getIconUrl(textureIndex, resolveIconKey(rewIconKey)) : null
    const isItemRew = ['item', 'item_tag'].includes(rew.reward_type)

    return (
      <div key={rew.id} className="quest-tile-reward">
        <div className="quest-tile-reward-icon" onDoubleClick={(e) => isItemRew && handleRewardDoubleClick(e, idx, 'item_id', rew.item_id || rew.items[0] || '')}>
          {rewIconUrl ? (
            <img src={rewIconUrl} alt="" style={{ width: 20, height: 20, imageRendering: 'pixelated' }} />
          ) : (
            <span style={{ fontSize: 14 }}>{getFallbackIcon(rew.reward_type)}</span>
          )}
          {isItemRew && (
            <button
              className="quest-tile-icon-btn small"
              onClick={(e) => { e.stopPropagation(); onOpenIconPicker?.('reward', idx) }}
              title="Pick item icon"
            >
              🔍
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
                onChange={(e) => setEditValue(e.target.value)}
                onKeyDown={handleKeyDown}
                onBlur={handleBlur}
                className="quest-tile-edit-input"
                style={{ flex: 1 }}
              />
            ) : (
              <span
                className="quest-tile-reward-label"
                onDoubleClick={(e) => handleRewardDoubleClick(e, idx, 'label', rew.label)}
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
                onChange={(e) => setEditValue(e.target.value)}
                onKeyDown={handleKeyDown}
                onBlur={handleBlur}
                className="quest-tile-edit-input"
                style={{ flex: 1, fontSize: 11 }}
                placeholder="minecraft:diamond"
              />
            ) : isItemRew ? (
              <span
                className="quest-tile-reward-target"
                onDoubleClick={(e) => handleRewardDoubleClick(e, idx, 'item_id', rew.item_id || rew.items[0] || '')}
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
              <button className="quest-tile-btn save" onClick={saveEdit} title="Save">✓</button>
              <button className="quest-tile-btn cancel" onClick={() => { setEditRewardIdx(null); setEditRewField(null) }} title="Cancel">✕</button>
            </>
          ) : (
            <button className="quest-tile-btn delete" onClick={() => onRemoveReward?.(data.id, rew.id)} title="Remove">🗑</button>
          )}
          {rew.team_reward && <span className="quest-tile-team-badge" title="Team Reward">👥</span>}
        </div>
      </div>
    )
  }

  const addObjectiveBtn = () => (
    <button className="quest-tile-add-btn" onClick={() => onAddObjective?.(data.id)}>
      <span>+</span> Add Objective
    </button>
  )

  const addRewardBtn = () => (
    <button className="quest-tile-add-btn" onClick={() => onAddReward?.(data.id)}>
      <span>+</span> Add Reward
    </button>
  )

  return (
    <div
      className={`quest-tile ${nodeType}-tile ${selected ? 'selected' : ''} ${optional ? 'optional' : ''}`}
      style={{
        width: TILE_WIDTH,
        borderLeftColor: borderColor,
      }}
    >
      <Handle type="target" position={Position.Top} className="quest-tile-handle" />
      <Handle type="source" position={Position.Bottom} className="quest-tile-handle" />

      <div className="quest-tile-header">
        <div className="quest-tile-visibility" title={visibility}>{visIcon}</div>
        <div className="quest-tile-title-area" onDoubleClick={(e) => handleDoubleClick(e, 'label', label)}>
          {editingField === 'label' ? (
            <input
              ref={inputRef}
              type="text"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onKeyDown={handleKeyDown}
              onBlur={handleBlur}
              className="quest-tile-edit-input quest-tile-title-input"
              autoFocus
            />
          ) : (
            <span className="quest-tile-title">{label}</span>
          )}
        </div>
        {optional && <div className="quest-tile-optional-badge" title="Optional">○</div>}
      </div>

      {subtitle && (
        <div
          className="quest-tile-subtitle"
          onDoubleClick={(e) => handleDoubleClick(e, 'subtitle', subtitle)}
        >
          {editingField === 'subtitle' ? (
            <input
              ref={inputRef}
              type="text"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onKeyDown={handleKeyDown}
              onBlur={handleBlur}
              className="quest-tile-edit-input quest-tile-title-input"
            />
          ) : subtitle}
        </div>
      )}

      <div className="quest-tile-main">
        <div className="quest-tile-icon-column">
          {renderQuestIcon()}
        </div>

        <div className="quest-tile-content">
          {(description || !objectives.length && !rewards.length) && (
            <div
              className="quest-tile-description"
              onDoubleClick={(e) => handleDoubleClick(e, 'description', description)}
            >
              {editingField === 'description' ? (
                <textarea
                  ref={textareaRef}
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveEdit() } else if (e.key === 'Escape') handleBlur() }}
                  onBlur={handleBlur}
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
            {objectives.map(renderObjective)}
            {addObjectiveBtn()}
          </div>

          <div className="quest-tile-rewards">
            <div className="quest-tile-section-header">
              <span>Rewards</span>
              <span className="quest-tile-count">{rewards.length}</span>
            </div>
            {rewards.map(renderReward)}
            {addRewardBtn()}
          </div>
        </div>
      </div>

      {canBeRepeatable && (
        <div className="quest-tile-repeatable" title="Repeatable">
          🔄 {silentlyComplete ? 'Silent' : `${(data.repeat_time || 0)}t`}
        </div>
      )}
    </div>
  )
}

export default QuestTileComponent